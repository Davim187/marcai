import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  addDaysToDate,
  localToUtc,
  toLocalDate,
  weekdayOf,
  OPEN_BOOKING_STATUSES,
  ACTIVE_BOOKING_STATUSES,
} from '@marcai/shared'
import { ctx, requireTenant } from '../../plugins/auth'
import { bookingInclude, customerScope, scopeWhere } from '../booking/panel.routes'
import { publicUrlFor } from '../tenants/tenant.summary'

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
          where: {
            ...scope,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
            startsAt: { gte: from, lt: to },
          },
          _sum: { priceCents: true },
          _count: { _all: true },
        })
        return { cents: r._sum.priceCents ?? 0, count: r._count._all }
      }
      const last30 = new Date(now.getTime() - 30 * 86_400_000)
      const TREND_DAYS = 14
      const trendStartDate = addDaysToDate(today, -(TREND_DAYS - 1))
      const trendStart = localToUtc(trendStartDate, 0, tz)
      const [
        todayBookings,
        next,
        day,
        week,
        month,
        noShows,
        done,
        pending,
        unread,
        trendBookings,
        newCustomers,
      ] = await Promise.all([
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
            status: { in: [...OPEN_BOOKING_STATUSES] },
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
        c.db.booking.findMany({
          where: {
            ...scope,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
            startsAt: { gte: trendStart, lt: dayEnd },
          },
          select: { startsAt: true, priceCents: true },
        }),
        c.db.customer.count({
          where: { ...customerScope(c), deletedAt: null, createdAt: { gte: monthStart } },
        }),
      ])
      // Série diária (data local do salão) para os gráficos do painel
      const byDate = new Map<string, { cents: number; count: number }>()
      for (let i = 0; i < TREND_DAYS; i++)
        byDate.set(addDaysToDate(trendStartDate, i), { cents: 0, count: 0 })
      for (const b of trendBookings) {
        const d = byDate.get(toLocalDate(b.startsAt, tz))
        if (d) {
          d.cents += b.priceCents
          d.count += 1
        }
      }
      return {
        today: todayBookings,
        next,
        revenue: { day, week, month },
        noShowRate: done + noShows ? noShows / (done + noShows) : 0,
        attendance: { completed: done, noShows },
        trend: [...byDate].map(([date, v]) => ({ date, ...v })),
        newCustomers,
        pendingCount: pending,
        unreadNotifications: unread,
        publicUrl: publicUrlFor(c.tenant.slug),
      }
    },
  )
}
