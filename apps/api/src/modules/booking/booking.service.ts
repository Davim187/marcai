import type { Prisma, Tenant } from '@prisma/client'
import { normalizeBrazilianMobile, type PublicBookingInput } from '@marcai/shared'
import { randomToken } from '../../lib/crypto'
import {
  AppError,
  badRequest,
  conflict,
  notFound,
  SLOT_TAKEN_MESSAGE,
  tooMany,
} from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { isOverlapError } from '../../plugins/error-handler'
import { onBookingCanceled, onBookingCreated, onBookingRescheduled } from '../notifications/events'
import { checkSlot } from './availability.service'

const MAX_BOOKINGS_PER_PHONE_PER_HOUR = 5

type AnswerInput = PublicBookingInput['answers'][number]

/** Valida as respostas do formulário: obrigatórias, opções válidas e campos do serviço. */
export async function validateAnswers(tenantId: string, serviceId: string, answers: AnswerInput[]) {
  const fields = await prisma.formField.findMany({
    where: { tenantId, deletedAt: null, active: true },
    include: { options: true, services: true },
  })
  const applicable = fields.filter(
    (f) => f.appliesToAll || f.services.some((s) => s.serviceId === serviceId),
  )
  const byId = new Map(applicable.map((f) => [f.id, f]))
  const errors: Record<string, string> = {}
  const clean: Array<{
    fieldId: string
    label: string
    type: string
    value: Prisma.InputJsonValue
  }> = []

  for (const f of applicable) {
    const a = answers.find((x) => x.fieldId === f.id)
    const empty =
      a === undefined || a.value === '' || (Array.isArray(a.value) && a.value.length === 0)
    if (empty) {
      if (f.required) errors[f.id] = 'Resposta obrigatória'
      continue
    }
    const labels = new Set(f.options.map((o) => o.label))
    const v = a!.value
    if (f.type === 'yes_no' && typeof v !== 'boolean') errors[f.id] = 'Responda sim ou não'
    else if (f.type === 'single_select' && (typeof v !== 'string' || !labels.has(v)))
      errors[f.id] = 'Escolha uma opção válida'
    else if (f.type === 'multi_select' && (!Array.isArray(v) || v.some((x) => !labels.has(x))))
      errors[f.id] = 'Escolha opções válidas'
    else if ((f.type === 'short_text' || f.type === 'long_text') && typeof v !== 'string')
      errors[f.id] = 'Resposta inválida'
    else if (f.type === 'photo' && (typeof v !== 'string' || !v.startsWith(`/uploads/`)))
      errors[f.id] = 'Foto inválida'
    else
      clean.push({ fieldId: f.id, label: f.label, type: f.type, value: v as Prisma.InputJsonValue })
  }
  // Ignora silenciosamente respostas para campos que não existem/não se aplicam.
  void byId
  if (Object.keys(errors).length) {
    throw new AppError(400, 'Responda as perguntas obrigatórias.', 'VALIDACAO', { answers: errors })
  }
  return clean
}

export interface CreateBookingOptions {
  tenant: Tenant
  serviceId: string
  professionalId: string
  startsAt: Date
  customer: { id?: string; name?: string; phone?: string; email?: string | null; consent?: boolean }
  notes?: string | null
  answers?: AnswerInput[]
  source: 'online' | 'manual'
  priceCents?: number
  /** Encaixe manual fora do expediente: só checa conflito com outras clientes. */
  allowOutsideHours?: boolean
  notifyCustomer?: boolean
}

export async function createBooking(opts: CreateBookingOptions) {
  const { tenant } = opts
  const service = await prisma.service.findFirst({
    where: {
      id: opts.serviceId,
      tenantId: tenant.id,
      deletedAt: null,
      ...(opts.source === 'online' ? { active: true } : {}),
    },
    include: { professionals: { where: { professionalId: opts.professionalId } } },
  })
  if (!service) throw notFound('Serviço não encontrado')
  const professional = await prisma.professional.findFirst({
    where: {
      id: opts.professionalId,
      tenantId: tenant.id,
      deletedAt: null,
      ...(opts.source === 'online' ? { active: true } : {}),
    },
  })
  if (!professional) throw notFound('Profissional não encontrado')
  if (opts.source === 'online' && service.professionals.length === 0) {
    throw badRequest('Esse profissional não faz esse serviço')
  }

  if (!opts.allowOutsideHours) {
    const ok = await checkSlot({
      tenant,
      professionalId: professional.id,
      service,
      startsAt: opts.startsAt,
      ignoreRules: opts.source === 'manual',
    })
    if (!ok) throw conflict(SLOT_TAKEN_MESSAGE, 'HORARIO_OCUPADO')
  }

  const answers =
    opts.source === 'online' ? await validateAnswers(tenant.id, service.id, opts.answers ?? []) : []

  // Cliente: deduplicada pelo telefone dentro do estabelecimento
  let customerId = opts.customer.id
  if (customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: tenant.id, deletedAt: null },
    })
    if (!c) throw notFound('Cliente não encontrada')
  } else {
    const phone = normalizeBrazilianMobile(opts.customer.phone ?? '')
    if (!phone) throw badRequest('Informe um WhatsApp válido')
    if (opts.source === 'online') {
      const recent = await prisma.booking.count({
        where: {
          tenantId: tenant.id,
          customer: { phone },
          createdAt: { gte: new Date(Date.now() - 3_600_000) },
        },
      })
      if (recent >= MAX_BOOKINGS_PER_PHONE_PER_HOUR)
        throw tooMany(
          'Muitos agendamentos com esse número. Tente mais tarde ou fale com o estabelecimento.',
        )
    }
    const customer = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      create: {
        tenantId: tenant.id,
        phone,
        name: opts.customer.name!.trim(),
        email: opts.customer.email || null,
        consentAt: opts.customer.consent ? new Date() : null,
      },
      update: {
        deletedAt: null,
        ...(opts.customer.email ? { email: opts.customer.email } : {}),
        ...(opts.customer.consent ? { consentAt: new Date() } : {}),
      },
    })
    customerId = customer.id
  }

  const endsAt = new Date(opts.startsAt.getTime() + service.durationMinutes * 60_000)
  const blockedUntil = new Date(endsAt.getTime() + service.bufferMinutes * 60_000)
  const status = opts.source === 'online' && tenant.requireConfirmation ? 'pending' : 'confirmed'

  let booking
  try {
    // A exclusion constraint "booking_no_overlap" garante, de forma atômica, que duas
    // reservas simultâneas para o mesmo horário não passem: só uma é gravada.
    booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        professionalId: professional.id,
        serviceId: service.id,
        customerId,
        startsAt: opts.startsAt,
        endsAt,
        blockedUntil,
        status,
        confirmedAt: status === 'confirmed' ? new Date() : null,
        source: opts.source,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: opts.priceCents ?? service.priceCents,
        priceFrom: service.priceFrom,
        notes: opts.notes || null,
        cancelToken: randomToken(18),
        answers: { create: answers.map((a) => ({ ...a, tenantId: tenant.id })) },
      },
      include: { professional: true, customer: true },
    })
  } catch (err) {
    if (isOverlapError(err)) throw conflict(SLOT_TAKEN_MESSAGE, 'HORARIO_OCUPADO')
    throw err
  }

  await onBookingCreated(booking.id, { notifyCustomer: opts.notifyCustomer ?? true })
  return booking
}

export async function rescheduleBooking(opts: {
  tenant: Tenant
  bookingId: string
  startsAt: Date
  professionalId?: string
  by: 'customer' | 'professional'
  force?: boolean
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: opts.bookingId, tenantId: opts.tenant.id },
    include: { service: true },
  })
  if (!booking) throw notFound('Agendamento não encontrado')
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw badRequest('Só dá para remarcar agendamentos pendentes ou confirmados')
  }
  const professionalId = opts.professionalId ?? booking.professionalId
  if (!opts.force) {
    const ok = await checkSlot({
      tenant: opts.tenant,
      professionalId,
      service: {
        durationMinutes: booking.durationMinutes,
        bufferMinutes: booking.service.bufferMinutes,
      },
      startsAt: opts.startsAt,
      excludeBookingId: booking.id,
      ignoreRules: opts.by === 'professional',
    })
    if (!ok) throw conflict(SLOT_TAKEN_MESSAGE, 'HORARIO_OCUPADO')
  }
  const endsAt = new Date(opts.startsAt.getTime() + booking.durationMinutes * 60_000)
  const blockedUntil = new Date(endsAt.getTime() + booking.service.bufferMinutes * 60_000)
  try {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        startsAt: opts.startsAt,
        endsAt,
        blockedUntil,
        professionalId,
        previousStartsAt: booking.startsAt,
        rescheduledAt: new Date(),
        customerConfirmedAt: null,
      },
    })
  } catch (err) {
    if (isOverlapError(err)) throw conflict(SLOT_TAKEN_MESSAGE, 'HORARIO_OCUPADO')
    throw err
  }
  await onBookingRescheduled(booking.id, booking.startsAt, opts.by)
  return prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { professional: true, customer: true },
  })
}

export async function cancelBooking(opts: {
  tenantId: string
  bookingId: string
  by: 'customer' | 'professional'
  reason?: string | null
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: opts.bookingId, tenantId: opts.tenantId },
  })
  if (!booking) throw notFound('Agendamento não encontrado')
  if (booking.status === 'canceled') return booking
  if (!['pending', 'confirmed'].includes(booking.status))
    throw badRequest('Esse agendamento não pode mais ser cancelado')
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
      canceledBy: opts.by,
      cancelReason: opts.reason || null,
    },
  })
  await onBookingCanceled(booking.id, opts.by)
  return updated
}
