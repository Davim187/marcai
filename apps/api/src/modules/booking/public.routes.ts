import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  addDaysToDate,
  availabilityQuerySchema,
  diffDays,
  formatBRL,
  publicBookingSchema,
  slotsQuerySchema,
} from '@marcai/shared'
import { env } from '../../config/env'
import { badRequest, notFound } from '../../lib/errors'
import { buildIcs, googleCalendarUrl } from '../../lib/ics'
import { prisma } from '../../lib/prisma'
import { storage } from '../../lib/storage'
import { readImageUpload } from '../uploads/upload.routes'
import { availableDates, daySlots } from './availability.service'
import { createBooking } from './booking.service'
import { publicProfile, resolvePublicTenant } from './public.service'

const slugParam = z.object({ slug: z.string().max(60) })

async function serviceFor(tenantId: string, serviceId: string, professionalId: string) {
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      tenantId,
      deletedAt: null,
      active: true,
      professionals: { some: { professionalId } },
    },
  })
  if (!service) throw notFound('Serviço não encontrado para essa profissional')
  return service
}

export function bookingLinks(token: string) {
  const manageUrl = `${env.APP_URL}/a/${token}`
  return { manageUrl, icsUrl: `${env.API_URL}/api/public/bookings/${token}/ics` }
}

export const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/config',
    { schema: { tags: ['público'], summary: 'Configuração pública da instalação' } },
    async () => ({
      appMode: env.APP_MODE,
      appName: env.APP_NAME,
      singleTenantSlug: env.APP_MODE === 'single_tenant' ? (env.SINGLE_TENANT_SLUG ?? null) : null,
    }),
  )

  app.get(
    '/t/:slug',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['público'],
        summary: 'Página pública do estabelecimento',
        params: slugParam,
      },
    },
    async (request, reply) => {
      const { tenant, available } = await resolvePublicTenant(request.params.slug)
      reply.header('cache-control', 'public, max-age=30')
      return publicProfile(tenant, available)
    },
  )

  app.get(
    '/t/:slug/availability',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['público'],
        summary: 'Dias com horário livre',
        params: slugParam,
        querystring: availabilityQuerySchema,
      },
    },
    async (request) => {
      const { tenant, available } = await resolvePublicTenant(request.params.slug)
      if (!available) return { dates: [] }
      const { serviceId, professionalId, from, to } = request.query
      if (diffDays(to, from) > 62 || diffDays(to, from) < 0)
        throw badRequest('Intervalo de datas inválido')
      const service = await serviceFor(tenant.id, serviceId, professionalId)
      const dates = await availableDates({
        tenant,
        professionalId,
        service,
        fromDate: from,
        toDate: to,
      })
      return {
        dates,
        maxDate: addDaysToDate(new Date().toISOString().slice(0, 10), tenant.maxAdvanceDays),
      }
    },
  )

  app.get(
    '/t/:slug/slots',
    {
      config: { rateLimit: { max: 180, timeWindow: '1 minute' } },
      schema: {
        tags: ['público'],
        summary: 'Horários livres de um dia',
        params: slugParam,
        querystring: slotsQuerySchema,
      },
    },
    async (request) => {
      const { tenant, available } = await resolvePublicTenant(request.params.slug)
      if (!available) return { slots: [] }
      const { serviceId, professionalId, date, excludeBookingId } = request.query
      const service = await serviceFor(tenant.id, serviceId, professionalId)
      const slots = await daySlots({ tenant, professionalId, service, date, excludeBookingId })
      return { slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), time: s.time })) }
    },
  )

  app.post(
    '/t/:slug/bookings',
    {
      // Rate limit por IP; o limite por telefone é feito no serviço.
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['público'],
        summary: 'Cria um agendamento (cliente final)',
        params: slugParam,
        body: publicBookingSchema,
      },
    },
    async (request, reply) => {
      const { tenant, available } = await resolvePublicTenant(request.params.slug)
      if (!available)
        throw badRequest('A agenda está temporariamente indisponível.', 'AGENDA_INDISPONIVEL')
      const b = request.body
      // Honeypot: robôs preenchem o campo escondido. Fingimos sucesso e não gravamos nada.
      if (b.website) {
        request.log.warn({ ip: request.ip }, 'Honeypot acionado na reserva pública')
        return reply
          .status(201)
          .send({ id: 'ok', status: 'confirmed', startsAt: b.startsAt, manageUrl: env.APP_URL })
      }
      const booking = await createBooking({
        tenant,
        serviceId: b.serviceId,
        professionalId: b.professionalId,
        startsAt: b.startsAt,
        customer: {
          name: b.customerName,
          phone: b.customerPhone,
          email: b.customerEmail || null,
          consent: b.consent,
        },
        notes: b.notes || null,
        answers: b.answers,
        source: 'online',
      })
      const links = bookingLinks(booking.cancelToken)
      const event = {
        uid: `${booking.id}@marcai`,
        title: `${booking.serviceName} — ${tenant.name}`,
        description: `Profissional: ${booking.professional.name}\nValor: ${formatBRL(booking.priceCents)}\nVer, cancelar ou remarcar: ${links.manageUrl}`,
        location: [tenant.address, tenant.city].filter(Boolean).join(' - ') || null,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        url: links.manageUrl,
      }
      return reply.status(201).send({
        id: booking.id,
        token: booking.cancelToken,
        status: booking.status,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        serviceName: booking.serviceName,
        priceCents: booking.priceCents,
        priceFrom: booking.priceFrom,
        professionalName: booking.professional.name,
        customerName: booking.customer.name,
        cancellationPolicy: tenant.cancellationPolicy,
        googleCalendarUrl: googleCalendarUrl(event),
        ...links,
      })
    },
  )

  app.post(
    '/t/:slug/uploads',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: { tags: ['público'], summary: 'Foto de referência', params: slugParam },
    },
    async (request, reply) => {
      const { tenant, available } = await resolvePublicTenant(request.params.slug)
      if (!available) throw badRequest('A agenda está temporariamente indisponível.')
      const { buffer, ext } = await readImageUpload(request)
      const url = await storage.save(`${tenant.id}-ref`, buffer, ext)
      return reply.status(201).send({ url })
    },
  )

  app.get(
    '/bookings/:token/ics',
    {
      schema: {
        tags: ['público'],
        summary: 'Arquivo .ics do agendamento',
        params: z.object({ token: z.string().max(64) }),
      },
    },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({
        where: { cancelToken: request.params.token },
        include: { tenant: true, professional: true },
      })
      if (!booking) throw notFound('Agendamento não encontrado')
      const { manageUrl } = bookingLinks(booking.cancelToken)
      const ics = buildIcs({
        uid: `${booking.id}@marcai`,
        title: `${booking.serviceName} — ${booking.tenant.name}`,
        description: `Profissional: ${booking.professional.name}\nVer, cancelar ou remarcar: ${manageUrl}`,
        location: [booking.tenant.address, booking.tenant.city].filter(Boolean).join(' - ') || null,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        url: manageUrl,
      })
      return reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', 'attachment; filename="agendamento.ics"')
        .send(ics)
    },
  )
}
