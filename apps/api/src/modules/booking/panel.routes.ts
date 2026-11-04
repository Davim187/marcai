import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  bookingListQuerySchema,
  bookingStatusUpdateSchema,
  isoDate,
  manualBookingSchema,
  normalizeBrazilianMobile,
  rescheduleSchema,
} from '@marcai/shared'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { ctx, requireTenant, type TenantContext } from '../../plugins/auth'
import { daySlots } from './availability.service'
import { createBooking, rescheduleBooking, setBookingStatus } from './booking.service'

const idParam = z.object({ id: z.string() })

export const bookingInclude = {
  professional: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.BookingInclude

/** Profissional (não dona) só vê a própria agenda. */
/** Membro sem agenda vinculada não vê agenda de ninguém (nunca "tudo"). */
const NO_AGENDA = '__sem_agenda__'
export function scopeWhere(c: TenantContext): Prisma.BookingWhereInput {
  if (c.role === 'owner') return {}
  return { professionalId: c.professionalId ?? NO_AGENDA }
}

async function findBooking(c: TenantContext, id: string) {
  const b = await c.db.booking.findFirst({ where: { id, ...scopeWhere(c) } })
  if (!b) throw notFound('Agendamento não encontrado')
  return b
}

export const bookingPanelRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireTenant)

  app.get(
    '/',
    {
      schema: {
        tags: ['agendamentos'],
        summary: 'Lista com filtros e busca',
        querystring: bookingListQuerySchema,
      },
    },
    async (request) => {
      const c = ctx(request)
      const q = request.query
      const where: Prisma.BookingWhereInput = {
        ...(q.from || q.to
          ? { startsAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } }
          : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.serviceId ? { serviceId: q.serviceId } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.professionalId ? { professionalId: q.professionalId } : {}),
        // Escopo por último: um filtro vindo da URL nunca amplia o que a profissional vê
        ...scopeWhere(c),
        ...(q.q
          ? {
              OR: [
                { customer: { name: { contains: q.q, mode: 'insensitive' } } },
                { customer: { phone: { contains: q.q.replace(/\D/g, '') || '§' } } },
                { serviceName: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      const [items, total] = await Promise.all([
        c.db.booking.findMany({
          where,
          include: bookingInclude,
          orderBy: { startsAt: q.from && !q.to ? 'asc' : 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        c.db.booking.count({ where }),
      ])
      return { items, total, page: q.page, pageSize: q.pageSize }
    },
  )

  app.get(
    '/calendar',
    {
      schema: {
        tags: ['agendamentos'],
        summary: 'Agendamentos e bloqueios de um intervalo (agenda)',
        querystring: z.object({
          from: z.coerce.date(),
          to: z.coerce.date(),
          professionalId: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const c = ctx(request)
      const { from, to, professionalId } = request.query
      if (to.getTime() - from.getTime() > 45 * 86_400_000)
        throw badRequest('Intervalo muito grande')
      const prof = professionalId ? { professionalId } : {}
      const [bookings, timeOffs] = await Promise.all([
        c.db.booking.findMany({
          where: { ...prof, ...scopeWhere(c), startsAt: { lt: to }, endsAt: { gt: from } },
          include: bookingInclude,
          orderBy: { startsAt: 'asc' },
        }),
        c.db.timeOff.findMany({
          where: {
            startsAt: { lt: to },
            endsAt: { gt: from },
            ...(professionalId ? { OR: [{ professionalId }, { professionalId: null }] } : {}),
          },
        }),
      ])
      return { bookings, timeOffs }
    },
  )

  app.get(
    '/slots',
    {
      schema: {
        tags: ['agendamentos'],
        summary: 'Horários livres (painel, sem antecedência mínima)',
        querystring: z.object({
          serviceId: z.string(),
          professionalId: z.string(),
          date: isoDate,
          excludeBookingId: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const c = ctx(request)
      const { serviceId, professionalId, date, excludeBookingId } = request.query
      const service = await c.db.service.findFirst({ where: { id: serviceId, deletedAt: null } })
      if (!service) throw notFound('Serviço não encontrado')
      const slots = await daySlots({
        tenant: c.tenant,
        professionalId,
        service,
        date,
        excludeBookingId,
        ignoreRules: true,
      })
      return { slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), time: s.time })) }
    },
  )

  app.get('/:id', { schema: { tags: ['agendamentos'], params: idParam } }, async (request) => {
    const c = ctx(request)
    const b = await c.db.booking.findFirst({
      where: { id: request.params.id, ...scopeWhere(c) },
      include: {
        ...bookingInclude,
        customer: {
          select: { id: true, name: true, phone: true, email: true, notes: true, tags: true },
        },
        answers: { select: { fieldId: true, label: true, type: true, value: true } },
      },
    })
    if (!b) throw notFound('Agendamento não encontrado')
    return b
  })

  app.post(
    '/',
    {
      schema: {
        tags: ['agendamentos'],
        summary: 'Agendamento manual (pelo WhatsApp, telefone…)',
        body: manualBookingSchema,
      },
    },
    async (request, reply) => {
      const c = ctx(request)
      const b = request.body
      if (c.role !== 'owner' && b.professionalId !== c.professionalId)
        throw badRequest('Você só pode agendar na sua agenda')
      if (!b.customerId && (!b.customerName || !b.customerPhone))
        throw badRequest('Informe a cliente (nome e WhatsApp)')
      const booking = await createBooking({
        tenant: c.tenant,
        serviceId: b.serviceId,
        professionalId: b.professionalId,
        startsAt: b.startsAt,
        customer: { id: b.customerId, name: b.customerName, phone: b.customerPhone },
        notes: b.notes || null,
        source: 'manual',
        priceCents: c.role === 'owner' ? b.priceCents : undefined,
        allowOutsideHours: b.allowOutsideHours,
        notifyCustomer: b.notifyCustomer,
      })
      return reply.status(201).send(booking)
    },
  )

  app.patch(
    '/:id/status',
    { schema: { tags: ['agendamentos'], params: idParam, body: bookingStatusUpdateSchema } },
    async (request) => {
      const c = ctx(request)
      const booking = await findBooking(c, request.params.id)
      return setBookingStatus({ tenantId: c.tenantId, bookingId: booking.id, ...request.body })
    },
  )

  app.post(
    '/:id/reschedule',
    { schema: { tags: ['agendamentos'], params: idParam, body: rescheduleSchema } },
    async (request) => {
      const c = ctx(request)
      const b = await findBooking(c, request.params.id)
      if (
        c.role !== 'owner' &&
        request.body.professionalId &&
        request.body.professionalId !== c.professionalId
      ) {
        throw badRequest('Você só pode remarcar na sua agenda')
      }
      return rescheduleBooking({
        tenant: c.tenant,
        bookingId: b.id,
        startsAt: request.body.startsAt,
        professionalId: request.body.professionalId,
        by: 'professional',
        force: request.body.force,
      })
    },
  )

  app.patch(
    '/:id/notes',
    {
      schema: {
        tags: ['agendamentos'],
        params: idParam,
        body: z.object({
          notes: z.string().max(500).nullable(),
          priceCents: z.number().int().min(0).optional(),
        }),
      },
    },
    async (request) => {
      const c = ctx(request)
      const booking = await findBooking(c, request.params.id)
      // Preço só a gestão altera (protege o faturamento)
      if (request.body.priceCents !== undefined && c.role !== 'owner') {
        throw forbidden('Só a gestão pode alterar o valor do atendimento')
      }
      return c.db.booking.update({ where: { id: booking.id }, data: request.body })
    },
  )

  // Busca rápida de clientes para o agendamento manual
  app.get(
    '/customer-search',
    { schema: { tags: ['agendamentos'], querystring: z.object({ q: z.string().max(60) }) } },
    async (request) => {
      const c = ctx(request)
      const digits = request.query.q.replace(/\D/g, '')
      return c.db.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: request.query.q, mode: 'insensitive' } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ...(normalizeBrazilianMobile(request.query.q)
              ? [{ phone: normalizeBrazilianMobile(request.query.q)! }]
              : []),
          ],
        },
        take: 8,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, phone: true },
      })
    },
  )
}
