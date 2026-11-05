import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  accessLevel,
  customerCancelSchema,
  HOUR_MS,
  customerRescheduleSchema,
} from '@marcai/shared'
import { env } from '../../config/env'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { googleCalendarUrl } from '../../lib/ics'
import { prisma } from '../../lib/prisma'
import { onBookingConfirmedByCustomer } from '../notifications/events'
import { cancelBooking, rescheduleBooking } from './booking.service'
import { bookingLinks } from './public.routes'

const tokenParam = z.object({ token: z.string().min(10).max(64) })

async function load(token: string) {
  const b = await prisma.booking.findUnique({
    where: { cancelToken: token },
    include: {
      tenant: { include: { subscription: true } },
      professional: true,
      customer: true,
      service: true,
    },
  })
  if (!b || b.tenant.deletedAt) throw notFound('Agendamento não encontrado. Confira o link.')
  return b
}

/** Política: cancelar/remarcar sozinha só até X horas antes e se ainda estiver ativo. */
function policy(b: Awaited<ReturnType<typeof load>>) {
  const deadline = new Date(b.startsAt.getTime() - b.tenant.cancelMinHours * HOUR_MS)
  const active = b.status === 'pending' || b.status === 'confirmed'
  const canChange = active && Date.now() <= deadline.getTime()
  return { deadline, active, canChange, canConfirm: active && b.startsAt.getTime() > Date.now() }
}

const STATUS_REASON: Record<string, string> = {
  canceled: 'Esse agendamento já foi cancelado.',
  completed: 'Esse atendimento já foi concluído.',
  no_show: 'Esse horário já passou.',
}

/** Recusa com o motivo real: agendamento encerrado ou prazo da política. */
function assertCanChange(
  b: Awaited<ReturnType<typeof load>>,
  action: 'Cancelamentos' | 'Remarcações',
) {
  const p = policy(b)
  if (p.canChange) return
  if (!p.active)
    throw badRequest(
      STATUS_REASON[b.status] ?? 'Esse agendamento não pode mais ser alterado.',
      'AGENDAMENTO_ENCERRADO',
    )
  throw forbidden(
    `${action} pelo link só até ${b.tenant.cancelMinHours}h antes. Fale direto com ${b.tenant.name}.`,
  )
}

/** Área da cliente final (sem login), acessada pelo link com token único. */
export const customerAreaRoutes: FastifyPluginAsyncZod = async (app) => {
  const limit = { rateLimit: { max: 60, timeWindow: '10 minutes' } }

  app.get(
    '/:token',
    {
      config: limit,
      schema: { tags: ['cliente final'], summary: 'Detalhes do agendamento', params: tokenParam },
    },
    async (request) => {
      const b = await load(request.params.token)
      const p = policy(b)
      const links = bookingLinks(b.cancelToken)
      return {
        id: b.id,
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        serviceId: b.serviceId,
        serviceName: b.serviceName,
        priceCents: b.priceCents,
        priceFrom: b.priceFrom,
        professionalId: b.professionalId,
        professionalName: b.professional.name,
        customerName: (b.customerName ?? b.customer.name).split(' ')[0],
        customerConfirmedAt: b.customerConfirmedAt,
        cancelReason: b.cancelReason,
        canChange: p.canChange,
        canConfirm: p.canConfirm,
        changeDeadline: p.deadline,
        tenant: {
          slug: b.tenant.slug,
          name: b.tenant.name,
          logoUrl: b.tenant.logoUrl,
          primaryColor: b.tenant.primaryColor,
          timezone: b.tenant.timezone,
          address: [b.tenant.address, b.tenant.city].filter(Boolean).join(' - ') || null,
          whatsapp: b.tenant.whatsapp,
          cancellationPolicy: b.tenant.cancellationPolicy,
          cancelMinHours: b.tenant.cancelMinHours,
          maxAdvanceDays: b.tenant.maxAdvanceDays,
          whiteLabel: env.APP_MODE === 'single_tenant',
        },
        googleCalendarUrl: googleCalendarUrl({
          uid: b.id,
          title: `${b.serviceName} — ${b.tenant.name}`,
          description: links.manageUrl,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          location: b.tenant.address,
        }),
        ...links,
      }
    },
  )

  app.post(
    '/:token/confirm',
    {
      config: limit,
      schema: { tags: ['cliente final'], summary: 'Confirmar presença', params: tokenParam },
    },
    async (request) => {
      const b = await load(request.params.token)
      if (!policy(b).canConfirm) throw badRequest('Esse agendamento não pode mais ser confirmado.')
      if (!b.customerConfirmedAt) {
        // Condicional: dois toques simultâneos só confirmam (e avisam) uma vez
        const res = await prisma.booking.updateMany({
          where: { id: b.id, customerConfirmedAt: null },
          data: {
            customerConfirmedAt: new Date(),
            ...(b.status === 'pending' && !b.tenant.requireConfirmation
              ? { status: 'confirmed', confirmedAt: new Date() }
              : {}),
          },
        })
        if (res.count) await onBookingConfirmedByCustomer(b.id)
      }
      return { ok: true }
    },
  )

  app.post(
    '/:token/cancel',
    {
      config: limit,
      schema: {
        tags: ['cliente final'],
        summary: 'Cancelar',
        params: tokenParam,
        body: customerCancelSchema,
      },
    },
    async (request) => {
      const b = await load(request.params.token)
      if (b.status === 'canceled') return { ok: true }
      assertCanChange(b, 'Cancelamentos')
      await cancelBooking({
        tenantId: b.tenantId,
        bookingId: b.id,
        by: 'customer',
        reason: request.body.reason,
      })
      return { ok: true }
    },
  )

  app.post(
    '/:token/reschedule',
    {
      config: limit,
      schema: {
        tags: ['cliente final'],
        summary: 'Remarcar',
        params: tokenParam,
        body: customerRescheduleSchema,
      },
    },
    async (request) => {
      const b = await load(request.params.token)
      assertCanChange(b, 'Remarcações')
      // Agenda fora do ar (assinatura vencida ou conta bloqueada): não aceita novos horários
      if (
        b.tenant.blocked ||
        accessLevel(b.tenant.subscription, new Date(), env.APP_MODE) === 'blocked'
      )
        throw forbidden(
          `A agenda de ${b.tenant.name} não está aceitando remarcações agora. Fale direto com o estabelecimento.`,
        )
      const updated = await rescheduleBooking({
        tenant: b.tenant,
        bookingId: b.id,
        startsAt: request.body.startsAt,
        by: 'customer',
      })
      return { ok: true, startsAt: updated.startsAt, endsAt: updated.endsAt }
    },
  )
}
