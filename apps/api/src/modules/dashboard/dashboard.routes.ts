import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { addDaysToDate, localToUtc, toLocalDate, weekdayOf } from '@marcai/shared'
import { ctx, requireTenant } from '../../plugins/auth'
import { bookingInclude, scopeWhere } from '../booking/panel.routes'
import { publicUrlFor } from '../tenants/tenant.summary'

const ACTIVE = ['pending', 'confirmed', 'completed'] as const

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      onRequest: requireTenant,
      schema: { tags: ['dashboard'], summary: 'Resumo do dia, semana e mês' },
    },
    async (request) => {
      const c = ctx(request)
      const tz = c.tenant.timezone
      const now = new Date()
      const today = toLocalDate(now, tz)
      const dayStart = localToUtc(today, 0, tz)
      const dayEnd = localToUtc(addDaysToDate(today, 1), 0, tz)
      const weekStartDate = addDaysToDate(today, -((weekdayOf(today) + 6) % 7)) // segunda-feira
      const weekStart = localToUtc(weekStartDate, 0, tz)
      const weekEnd = localToUtc(addDaysToDate(weekStartDate, 7), 0, tz)
      const monthStartDate = `${today.slice(0, 8)}01`
      const [y, m] = today.split('-').map(Number) as [number, number]
      const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
      const monthStart = localToUtc(monthStartDate, 0, tz)
      const monthEnd = localToUtc(nextMonth, 0, tz)
      const scope = scopeWhere(c)

      const revenue = async (from: Date, to: Date) => {
        const r = await c.db.booking.aggregate({
          where: { ...scope, status: { in: [...ACTIVE] }, startsAt: { gte: from, lt: to } },
          _sum: { priceCents: true },
          _count: { _all: true },
        })
        return { cents: r._sum.priceCents ?? 0, count: r._count._all }
      }
      const last30 = new Date(now.getTime() - 30 * 86_400_000)
      const [todayBookings, next, day, week, month, noShows, done, pending, unread] =
        await Promise.all([
          c.db.booking.findMany({
            where: {
              ...scope,
              startsAt: { gte: dayStart, lt: dayEnd },
              status: { not: 'canceled' },
            },
            include: bookingInclude,
            orderBy: { startsAt: 'asc' },
          }),
          c.db.booking.findFirst({
            where: {
              ...scope,
              startsAt: { gte: new Date(now.getTime() - 15 * 60_000) },
              status: { in: ['pending', 'confirmed'] },
            },
            include: bookingInclude,
            orderBy: { startsAt: 'asc' },
          }),
          revenue(dayStart, dayEnd),
          revenue(weekStart, weekEnd),
          revenue(monthStart, monthEnd),
          c.db.booking.count({
            where: { ...scope, status: 'no_show', startsAt: { gte: last30, lt: now } },
          }),
          c.db.booking.count({
            where: { ...scope, status: 'completed', startsAt: { gte: last30, lt: now } },
          }),
          c.db.booking.count({ where: { ...scope, status: 'pending', startsAt: { gte: now } } }),
          c.db.notification.count({ where: { readAt: null } }),
        ])
      return {
        today: todayBookings,
        next,
        revenue: { day, week, month },
        noShowRate: done + noShows ? noShows / (done + noShows) : 0,
        pendingCount: pending,
        unreadNotifications: unread,
        publicUrl: publicUrlFor(c.tenant.slug),
      }
    },
  )
}
