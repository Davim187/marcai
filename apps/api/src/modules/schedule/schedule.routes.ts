import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  brazilianHolidays,
  holidaySchema,
  OPEN_BOOKING_STATUSES,
  recurringBlockSchema,
  timeOffSchema,
  workingHoursSchema,
} from '@marcai/shared'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { ctx, requireOwner, requireTenant, type TenantContext } from '../../plugins/auth'
import { idParam } from '../../lib/route-schemas'

/** Dona mexe em qualquer agenda; profissional só na própria. */
export function assertCanManageProfessional(
  c: TenantContext,
  professionalId: string | null | undefined,
) {
  if (c.role === 'owner') return
  if (!professionalId || professionalId !== c.professionalId) {
    throw forbidden('Você só pode alterar a sua própria agenda')
  }
}

export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      onRequest: requireTenant,
      schema: {
        tags: ['horários'],
        querystring: z.object({ professionalId: z.string().optional() }),
      },
    },
    async (request) => {
      const { db } = ctx(request)
      const where = request.query.professionalId
        ? { professionalId: request.query.professionalId }
        : {}
      const [workingHours, timeOffs, recurringBlocks, holidays] = await Promise.all([
        db.workingHours.findMany({ where, orderBy: [{ weekday: 'asc' }, { start: 'asc' }] }),
        db.timeOff.findMany({
          where: {
            endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
            ...(request.query.professionalId
              ? { OR: [{ professionalId: request.query.professionalId }, { professionalId: null }] }
              : {}),
          },
          orderBy: { startsAt: 'asc' },
        }),
        db.recurringBlock.findMany({
          where: request.query.professionalId
            ? { OR: [{ professionalId: request.query.professionalId }, { professionalId: null }] }
            : {},
          orderBy: [{ weekday: 'asc' }, { start: 'asc' }],
        }),
        db.holiday.findMany({
          where: { date: { gte: new Date().toISOString().slice(0, 10) } },
          orderBy: { date: 'asc' },
        }),
      ])
      return { workingHours, timeOffs, recurringBlocks, holidays }
    },
  )

  app.put(
    '/working-hours',
    { onRequest: requireTenant, schema: { tags: ['horários'], body: workingHoursSchema } },
    async (request) => {
      const c = ctx(request)
      const { professionalId, shifts } = request.body
      assertCanManageProfessional(c, professionalId)
      const prof = await c.db.professional.findFirst({
        where: { id: professionalId, deletedAt: null },
      })
      if (!prof) throw notFound('Profissional não encontrado')
      await c.db.workingHours.deleteMany({ where: { professionalId } })
      await c.db.workingHours.createMany({
        data: shifts.map((s) => ({ ...s, professionalId, tenantId: c.tenantId })),
      })
      return { ok: true }
    },
  )

  app.post(
    '/time-off',
    {
      onRequest: requireTenant,
      schema: { tags: ['horários'], summary: 'Bloqueio pontual', body: timeOffSchema },
    },
    async (request, reply) => {
      const c = ctx(request)
      if (c.role !== 'owner') assertCanManageProfessional(c, request.body.professionalId)
      const { confirmConflicts, ...body } = request.body
      // Agendamentos já marcados no período não somem com o bloqueio: avisa antes
      const conflicts = await c.db.booking.count({
        where: {
          status: { in: [...OPEN_BOOKING_STATUSES] },
          startsAt: { lt: body.endsAt },
          endsAt: { gt: body.startsAt },
          ...(body.professionalId ? { professionalId: body.professionalId } : {}),
        },
      })
      if (conflicts && !confirmConflicts) {
        throw new AppError(
          409,
          `Há ${conflicts} ${conflicts === 1 ? 'agendamento marcado' : 'agendamentos marcados'} nesse período. O bloqueio não cancela ${conflicts === 1 ? 'ele' : 'eles'}: cancele ou remarque na agenda.`,
          'AGENDAMENTOS_NO_PERIODO',
          { count: conflicts },
        )
      }
      const created = await c.db.timeOff.create({
        data: {
          ...body,
          tenantId: c.tenantId,
          professionalId: body.professionalId ?? null,
        },
      })
      return reply.status(201).send(created)
    },
  )

  app.delete(
    '/time-off/:id',
    { onRequest: requireTenant, schema: { tags: ['horários'], params: idParam } },
    async (request) => {
      const c = ctx(request)
      const t = await c.db.timeOff.findFirst({ where: { id: request.params.id } })
      if (!t) throw notFound('Bloqueio não encontrado')
      if (c.role !== 'owner') assertCanManageProfessional(c, t.professionalId)
      await c.db.timeOff.deleteMany({ where: { id: t.id } })
      return { ok: true }
    },
  )

  app.post(
    '/recurring-blocks',
    { onRequest: requireTenant, schema: { tags: ['horários'], body: recurringBlockSchema } },
    async (request, reply) => {
      const c = ctx(request)
      if (c.role !== 'owner') assertCanManageProfessional(c, request.body.professionalId)
      const created = await c.db.recurringBlock.create({
        data: {
          ...request.body,
          tenantId: c.tenantId,
          professionalId: request.body.professionalId ?? null,
        },
      })
      return reply.status(201).send(created)
    },
  )

  app.delete(
    '/recurring-blocks/:id',
    { onRequest: requireTenant, schema: { tags: ['horários'], params: idParam } },
    async (request) => {
      const c = ctx(request)
      const b = await c.db.recurringBlock.findFirst({ where: { id: request.params.id } })
      if (!b) throw notFound('Bloqueio não encontrado')
      if (c.role !== 'owner') assertCanManageProfessional(c, b.professionalId)
      await c.db.recurringBlock.deleteMany({ where: { id: b.id } })
      return { ok: true }
    },
  )

  // ---------- Feriados ----------
  app.post(
    '/holidays',
    { onRequest: requireOwner, schema: { tags: ['horários'], body: holidaySchema } },
    async (request, reply) => {
      const { db } = ctx(request)
      const h = await db.holiday.upsert({
        where: { tenantId_date: { tenantId: ctx(request).tenantId, date: request.body.date } },
        create: { ...request.body, tenantId: ctx(request).tenantId, source: 'custom' },
        update: { name: request.body.name, closed: request.body.closed },
      })
      return reply.status(201).send(h)
    },
  )

  app.patch(
    '/holidays/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['horários'], params: idParam, body: z.object({ closed: z.boolean() }) },
    },
    async (request) => {
      const res = await ctx(request).db.holiday.updateMany({
        where: { id: request.params.id },
        data: { closed: request.body.closed },
      })
      if (!res.count) throw notFound()
      return { ok: true }
    },
  )

  app.delete(
    '/holidays/:id',
    { onRequest: requireOwner, schema: { tags: ['horários'], params: idParam } },
    async (request) => {
      await ctx(request).db.holiday.deleteMany({ where: { id: request.params.id } })
      return { ok: true }
    },
  )

  app.get(
    '/national-holidays',
    {
      schema: {
        tags: ['horários'],
        querystring: z.object({ year: z.coerce.number().int().min(2000).max(2100) }),
      },
    },
    async (request) => brazilianHolidays(request.query.year),
  )
}
