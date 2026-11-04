import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  addDaysToDate,
  diffDays,
  isoDate,
  localToUtc,
  toLocalDate,
  toLocalTime,
  weekdayOf,
} from '@marcai/shared'
import { toCsv } from '../../lib/csv'
import { badRequest } from '../../lib/errors'
import { ctx, requireOwner } from '../../plugins/auth'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const query = z.object({ from: isoDate, to: isoDate, professionalId: z.string().optional() })

async function buildReport(c: ReturnType<typeof ctx>, q: z.infer<typeof query>) {
  if (diffDays(q.to, q.from) < 0 || diffDays(q.to, q.from) > 400)
    throw badRequest('Período inválido (máximo de 400 dias)')
  const tz = c.tenant.timezone
  const bookings = await c.db.booking.findMany({
    where: {
      startsAt: { gte: localToUtc(q.from, 0, tz), lt: localToUtc(addDaysToDate(q.to, 1), 0, tz) },
      ...(q.professionalId ? { professionalId: q.professionalId } : {}),
    },
    select: {
      startsAt: true,
      status: true,
      priceCents: true,
      serviceId: true,
      serviceName: true,
      customerId: true,
      customer: { select: { name: true } },
    },
  })
  const days = diffDays(q.to, q.from) + 1
  const byDay = new Map<
    string,
    { date: string; realized: number; forecast: number; count: number }
  >()
  for (let i = 0; i < days; i++) {
    const d = addDaysToDate(q.from, i)
    byDay.set(d, { date: d, realized: 0, forecast: 0, count: 0 })
  }
  const services = new Map<string, { name: string; count: number; revenue: number }>()
  const hours = new Map<number, number>()
  const weekdays = new Map<number, number>()
  const customers = new Map<string, { id: string; name: string; visits: number; spent: number }>()
  let completed = 0
  let canceled = 0
  let noShow = 0
  let realized = 0
  let forecast = 0
  for (const b of bookings) {
    const date = toLocalDate(b.startsAt, tz)
    const day = byDay.get(date)
    if (b.status === 'canceled') canceled++
    if (b.status === 'no_show') noShow++
    if (b.status === 'completed') {
      completed++
      realized += b.priceCents
      if (day) day.realized += b.priceCents
      const cu = customers.get(b.customerId) ?? {
        id: b.customerId,
        name: b.customer.name,
        visits: 0,
        spent: 0,
      }
      cu.visits++
      cu.spent += b.priceCents
      customers.set(b.customerId, cu)
    }
    if (b.status === 'pending' || b.status === 'confirmed') {
      forecast += b.priceCents
      if (day) day.forecast += b.priceCents
    }
    if (b.status !== 'canceled') {
      if (day) day.count++
      const s = services.get(b.serviceId) ?? { name: b.serviceName, count: 0, revenue: 0 }
      s.count++
      if (b.status !== 'no_show') s.revenue += b.priceCents
      services.set(b.serviceId, s)
      const h = Number(toLocalTime(b.startsAt, tz).slice(0, 2))
      hours.set(h, (hours.get(h) ?? 0) + 1)
      const w = weekdayOf(date)
      weekdays.set(w, (weekdays.get(w) ?? 0) + 1)
    }
  }
  const total = bookings.length
  return {
    period: { from: q.from, to: q.to },
    totals: {
      realizedCents: realized,
      forecastCents: forecast,
      bookings: total,
      completed,
      canceled,
      noShow,
      cancelRate: total ? canceled / total : 0,
      noShowRate: completed + noShow ? noShow / (completed + noShow) : 0,
      avgTicketCents: completed ? Math.round(realized / completed) : 0,
    },
    byDay: [...byDay.values()],
    topServices: [...services.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    peakHours: [...hours.entries()]
      .map(([hour, count]) => ({ hour: `${String(hour).padStart(2, '0')}h`, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    peakWeekdays: [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      weekday: WEEKDAYS[w]!.slice(0, 3),
      count: weekdays.get(w) ?? 0,
    })),
    topCustomers: [...customers.values()]
      .sort((a, b) => b.visits - a.visits || b.spent - a.spent)
      .slice(0, 10),
  }
}

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { onRequest: requireOwner, schema: { tags: ['relatórios'], querystring: query } },
    async (request) => buildReport(ctx(request), request.query),
  )

  app.get(
    '/export.csv',
    { onRequest: requireOwner, schema: { tags: ['relatórios'], querystring: query } },
    async (request, reply) => {
      const r = await buildReport(ctx(request), request.query)
      const money = (c: number) => (c / 100).toFixed(2).replace('.', ',')
      const csv = toCsv(
        r.byDay.map((d) => ({
          date: d.date.split('-').reverse().join('/'),
          count: d.count,
          realized: money(d.realized),
          forecast: money(d.forecast),
        })),
        [
          { key: 'date', label: 'Data' },
          { key: 'count', label: 'Agendamentos' },
          { key: 'realized', label: 'Faturado (R$)' },
          { key: 'forecast', label: 'Previsto (R$)' },
        ],
      )
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="relatorio-${r.period.from}-a-${r.period.to}.csv"`,
        )
        .send(csv)
    },
  )
}
