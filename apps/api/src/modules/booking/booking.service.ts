import type { Prisma, Tenant } from '@prisma/client'
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TRANSITIONS,
  type BookingStatus,
  HOUR_MS,
  isOpenBooking,
  MINUTE_MS,
  normalizeBrazilianMobile,
  OPEN_BOOKING_STATUSES,
  PAST_TOLERANCE_MS,
  type PublicBookingInput,
} from '@marcai/shared'
import { randomToken } from '../../lib/crypto'
import {
  AppError,
  badRequest,
  notFound,
  pastTime,
  slotOverlapPanel,
  slotTaken,
  slotUnavailable,
  tooMany,
} from '../../lib/errors'
import { privateFilePath } from '../../lib/storage'
import { forTenant, type TenantDb } from '../../lib/tenant-db'
import { isOverlapError } from '../../plugins/error-handler'
import { upsertCustomerByPhone } from '../customers/customer.service'
import {
  onBookingApproved,
  onBookingCanceled,
  onBookingCreated,
  onBookingRescheduled,
} from '../notifications/events'
import { checkSlot, slotProblem } from './availability.service'

const MAX_BOOKINGS_PER_PHONE_PER_HOUR = 5

type AnswerInput = PublicBookingInput['answers'][number]
type Actor = 'customer' | 'professional'

/** Início, fim do atendimento e fim do intervalo protegido (atendimento + limpeza). */
export function bookingWindow(startsAt: Date, durationMinutes: number, bufferMinutes: number) {
  const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS)
  const blockedUntil = new Date(endsAt.getTime() + bufferMinutes * MINUTE_MS)
  return { endsAt, blockedUntil }
}

function assertNotPast(startsAt: Date) {
  if (startsAt.getTime() < Date.now() - PAST_TOLERANCE_MS) throw pastTime()
}

/** Erro certo para cada caso: cliente vê "acabou de ser reservado"; o painel vê o motivo exato. */
function overlapError(by: Actor) {
  return by === 'customer' ? slotTaken() : slotOverlapPanel()
}

async function findProfessional(db: TenantDb, id: string, onlyActive: boolean) {
  const professional = await db.professional.findFirst({
    where: { id, deletedAt: null, ...(onlyActive ? { active: true } : {}) },
  })
  if (!professional) throw notFound('Profissional não encontrado')
  return professional
}

/** Valida as respostas do formulário: obrigatórias, opções válidas e campos do serviço. */
export async function validateAnswers(db: TenantDb, serviceId: string, answers: AnswerInput[]) {
  const fields = await db.formField.findMany({
    where: { deletedAt: null, active: true },
    include: { options: true, services: true },
  })
  // Respostas para campos que não existem ou não se aplicam ao serviço são ignoradas.
  const applicable = fields.filter(
    (f) => f.appliesToAll || f.services.some((s) => s.serviceId === serviceId),
  )
  const errors: Record<string, string> = {}
  const clean: Array<{
    fieldId: string
    label: string
    type: string
    value: Prisma.InputJsonValue
  }> = []

  for (const field of applicable) {
    const answer = answers.find((x) => x.fieldId === field.id)
    const empty =
      answer === undefined ||
      answer.value === '' ||
      (Array.isArray(answer.value) && answer.value.length === 0)
    if (empty) {
      if (field.required) errors[field.id] = 'Resposta obrigatória'
      continue
    }
    const labels = new Set(field.options.map((o) => o.label))
    const value = answer!.value
    if (field.type === 'yes_no' && typeof value !== 'boolean')
      errors[field.id] = 'Responda sim ou não'
    else if (field.type === 'single_select' && (typeof value !== 'string' || !labels.has(value)))
      errors[field.id] = 'Escolha uma opção válida'
    else if (
      field.type === 'multi_select' &&
      (!Array.isArray(value) || value.some((x) => !labels.has(x)))
    )
      errors[field.id] = 'Escolha opções válidas'
    else if (
      (field.type === 'short_text' || field.type === 'long_text') &&
      typeof value !== 'string'
    )
      errors[field.id] = 'Resposta inválida'
    else if (
      field.type === 'photo' &&
      // Só fotos enviadas para ESTE estabelecimento
      (typeof value !== 'string' || privateFilePath(value)?.folder !== `${db.$tenantId()}-ref`)
    )
      errors[field.id] = 'Foto inválida'
    else
      clean.push({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: value as Prisma.InputJsonValue,
      })
  }
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
  /** Encaixe manual fora do expediente: só checa conflito com outros clientes. */
  allowOutsideHours?: boolean
  notifyCustomer?: boolean
}

export async function createBooking(opts: CreateBookingOptions) {
  const { tenant } = opts
  const db = forTenant(tenant.id)
  const online = opts.source === 'online'
  const by: Actor = online ? 'customer' : 'professional'
  assertNotPast(opts.startsAt)

  const service = await db.service.findFirst({
    where: { id: opts.serviceId, deletedAt: null, ...(online ? { active: true } : {}) },
    include: { professionals: { where: { professionalId: opts.professionalId } } },
  })
  if (!service) throw notFound('Serviço não encontrado')
  const professional = await findProfessional(db, opts.professionalId, online)
  if (online && service.professionals.length === 0) {
    throw badRequest('Esse profissional não faz esse serviço')
  }

  if (!opts.allowOutsideHours) {
    const slotOpts = {
      tenant,
      professionalId: professional.id,
      service,
      startsAt: opts.startsAt,
      ignoreRules: !online,
    }
    if (!(await checkSlot(slotOpts))) {
      throw (await slotProblem(slotOpts)) === 'taken' ? overlapError(by) : slotUnavailable()
    }
  }

  const answers = online ? await validateAnswers(db, service.id, opts.answers ?? []) : []

  // Cliente: deduplicado pelo telefone dentro do estabelecimento, sem sobrescrever dados existentes
  let customerId = opts.customer.id
  if (customerId) {
    const existing = await db.customer.findFirst({ where: { id: customerId, deletedAt: null } })
    if (!existing) throw notFound('Cliente não encontrado')
  } else {
    if (online) await assertPhoneRateLimit(db, opts.customer.phone ?? '')
    const { customer } = await upsertCustomerByPhone(
      db,
      opts.customer.phone ?? '',
      { name: opts.customer.name, email: opts.customer.email, consent: opts.customer.consent },
      'reuse',
    )
    customerId = customer.id
  }

  const { endsAt, blockedUntil } = bookingWindow(
    opts.startsAt,
    service.durationMinutes,
    service.bufferMinutes,
  )
  const status: BookingStatus = online && tenant.requireConfirmation ? 'pending' : 'confirmed'

  let booking
  try {
    // A exclusion constraint "booking_no_overlap" garante, de forma atômica, que duas
    // reservas simultâneas para o mesmo horário não passem: só uma é gravada.
    booking = await db.booking.create({
      data: {
        tenantId: db.$tenantId(),
        professionalId: professional.id,
        serviceId: service.id,
        customerId,
        customerName: opts.customer.name?.trim() || null,
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
        answers: { create: answers.map((a) => ({ ...a, tenantId: db.$tenantId() })) },
      },
      include: { professional: true, customer: true },
    })
  } catch (err) {
    if (isOverlapError(err)) throw overlapError(by)
    throw err
  }

  // Rede de segurança contra reservas em paralelo: o limite por telefone é conferido de novo
  // depois de gravar (a primeira checagem não enxerga requisições simultâneas)
  if (online && !opts.customer.id) {
    const recent = await db.booking.count({
      where: { customerId, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    })
    if (recent > MAX_BOOKINGS_PER_PHONE_PER_HOUR) {
      await db.booking.deleteMany({ where: { id: booking.id } })
      throw tooMany(
        'Muitos agendamentos com esse número. Tente mais tarde ou fale com o estabelecimento.',
      )
    }
  }

  await onBookingCreated(booking.id, { notifyCustomer: opts.notifyCustomer ?? true })
  return booking
}

async function assertPhoneRateLimit(db: TenantDb, phoneInput: string) {
  const phone = normalizeBrazilianMobile(phoneInput)
  if (!phone) return
  const recent = await db.booking.count({
    where: { customer: { phone }, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
  })
  if (recent >= MAX_BOOKINGS_PER_PHONE_PER_HOUR) {
    throw tooMany(
      'Muitos agendamentos com esse número. Tente mais tarde ou fale com o estabelecimento.',
    )
  }
}

export async function rescheduleBooking(opts: {
  tenant: Tenant
  bookingId: string
  startsAt: Date
  professionalId?: string
  by: Actor
  /** Encaixe: ignora expediente e antecedência (só a dona/profissional pelo painel). */
  force?: boolean
}) {
  const db = forTenant(opts.tenant.id)
  const booking = await db.booking.findFirst({
    where: { id: opts.bookingId },
    include: { service: true },
  })
  if (!booking) throw notFound('Agendamento não encontrado')
  if (!isOpenBooking(booking.status)) {
    throw badRequest('Só dá para remarcar agendamentos pendentes ou confirmados')
  }
  // O profissional precisa ser DESTE estabelecimento (nunca de outro tenant)
  const professionalId = opts.professionalId ?? booking.professionalId
  // Mesmo horário e mesma profissional (clique repetido, rede reenviando): nada muda, nada é avisado
  if (
    booking.startsAt.getTime() === opts.startsAt.getTime() &&
    professionalId === booking.professionalId
  ) {
    return db.booking.findFirstOrThrow({
      where: { id: booking.id },
      include: { professional: true, customer: true },
    })
  }
  assertNotPast(opts.startsAt)

  if (professionalId !== booking.professionalId) {
    await findProfessional(db, professionalId, false)
    const offers = await db.professionalService.findFirst({
      where: { professionalId, serviceId: booking.serviceId },
    })
    if (!offers && !opts.force) throw badRequest('Esse profissional não faz esse serviço')
  }

  const force = Boolean(opts.force) && opts.by === 'professional'
  if (!force) {
    const slotOpts = {
      tenant: opts.tenant,
      professionalId,
      service: {
        durationMinutes: booking.durationMinutes,
        bufferMinutes: booking.service.bufferMinutes,
      },
      startsAt: opts.startsAt,
      excludeBookingId: booking.id,
      ignoreRules: opts.by === 'professional',
    }
    if (!(await checkSlot(slotOpts))) {
      throw (await slotProblem(slotOpts)) === 'taken' ? overlapError(opts.by) : slotUnavailable()
    }
  }

  const { endsAt, blockedUntil } = bookingWindow(
    opts.startsAt,
    booking.durationMinutes,
    booking.service.bufferMinutes,
  )
  try {
    const res = await db.booking.updateMany({
      // Condicional ao horário lido: duas remarcações simultâneas não geram dois avisos
      where: {
        id: booking.id,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        startsAt: booking.startsAt,
      },
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
    if (!res.count) {
      const now = await db.booking.findFirst({ where: { id: booking.id } })
      // A outra requisição já levou para o mesmo horário: resultado igual, sem aviso duplicado
      if (now && now.startsAt.getTime() === opts.startsAt.getTime())
        return db.booking.findFirstOrThrow({
          where: { id: booking.id },
          include: { professional: true, customer: true },
        })
      throw badRequest('Esse agendamento acabou de mudar. Atualize a página.')
    }
  } catch (err) {
    if (isOverlapError(err)) throw overlapError(opts.by)
    throw err
  }
  await onBookingRescheduled(booking.id, booking.startsAt, opts.by)
  return db.booking.findFirstOrThrow({
    where: { id: booking.id },
    include: { professional: true, customer: true },
  })
}

/**
 * Cancela de forma atômica: só o primeiro pedido muda o status e dispara os avisos.
 * Cliques duplos ou requisições simultâneas não geram mensagens repetidas.
 */
export async function cancelBooking(opts: {
  tenantId: string
  bookingId: string
  by: Actor
  reason?: string | null
}) {
  const db = forTenant(opts.tenantId)
  const res = await db.booking.updateMany({
    where: { id: opts.bookingId, status: { in: [...OPEN_BOOKING_STATUSES] } },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
      canceledBy: opts.by,
      cancelReason: opts.reason || null,
    },
  })
  const booking = await db.booking.findFirst({ where: { id: opts.bookingId } })
  if (!booking) throw notFound('Agendamento não encontrado')
  if (!res.count) {
    if (booking.status === 'canceled') return booking // já estava cancelado: idempotente
    throw badRequest('Esse agendamento não pode mais ser cancelado')
  }
  await onBookingCanceled(booking.id, opts.by)
  return booking
}

/** Máquina de estados do agendamento no painel (confirmar, concluir, falta, cancelar). */
export async function setBookingStatus(opts: {
  tenantId: string
  bookingId: string
  status: BookingStatus
  reason?: string
}) {
  if (opts.status === 'canceled') {
    return cancelBooking({
      tenantId: opts.tenantId,
      bookingId: opts.bookingId,
      by: 'professional',
      reason: opts.reason,
    })
  }
  const db = forTenant(opts.tenantId)
  const booking = await db.booking.findFirst({ where: { id: opts.bookingId } })
  if (!booking) throw notFound('Agendamento não encontrado')
  if (booking.status === opts.status) return withRelations(db, booking.id) // clique repetido
  if (booking.status === 'canceled') {
    throw badRequest('Esse agendamento foi cancelado. Crie um novo se precisar.')
  }
  if (!BOOKING_STATUS_TRANSITIONS[booking.status].includes(opts.status)) {
    throw badRequest(
      `Não dá para mudar de "${BOOKING_STATUS_LABELS[booking.status]}" para "${BOOKING_STATUS_LABELS[opts.status]}".`,
      'MUDANCA_DE_STATUS_INVALIDA',
    )
  }
  if ((opts.status === 'completed' || opts.status === 'no_show') && booking.startsAt > new Date()) {
    throw badRequest('Só dá para concluir ou marcar falta depois do horário começar')
  }
  const now = new Date()
  const changed = await db.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: {
      status: opts.status,
      ...(opts.status === 'confirmed' ? { confirmedAt: now } : {}),
      ...(opts.status === 'completed' ? { completedAt: now } : {}),
    },
  })
  const updated = await withRelations(db, booking.id)
  if (!changed.count) return updated // outra requisição mudou antes
  // Aprovação de um pedido (confirmação manual): avisa a cliente e agenda o lembrete.
  // Condicional: dois cliques simultâneos só aprovam (e avisam) uma vez.
  if (booking.status === 'pending' && opts.status === 'confirmed') {
    await onBookingApproved(booking.id)
  }
  return updated
}

const statusInclude = {
  professional: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
} as const

function withRelations(db: ReturnType<typeof forTenant>, id: string) {
  return db.booking.findFirstOrThrow({ where: { id }, include: statusInclude })
}
