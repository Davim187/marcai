import type { Booking, BookingSeries, Prisma, Tenant } from '@prisma/client'
import {
  accessLevel,
  addDaysToDate,
  hhmmToMinutes,
  localToUtc,
  OPEN_BOOKING_STATUSES,
  toLocalDate,
  toLocalTime,
  WEEK_MS,
} from '@marcai/shared'
import { env } from '../../config/env'
import { ACCOUNT_SUB_INCLUDE, withAccountSub } from '../../lib/account'
import { randomToken } from '../../lib/crypto'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { forTenant } from '../../lib/tenant-db'
import { isOverlapError } from '../../plugins/error-handler'
import { onSeriesEnded, onSeriesOccurrenceCreated } from '../notifications/events'
import { checkSlot } from './availability.service'

type Actor = 'customer' | 'professional'

/** Mesmo horário local, 7 dias depois (respeita o fuso, mesmo se um dia voltar o horário de verão). */
export function nextWeek(startsAt: Date, timezone: string): Date {
  const date = addDaysToDate(toLocalDate(startsAt, timezone), 7)
  return localToUtc(date, hhmmToMinutes(toLocalTime(startsAt, timezone)), timezone)
}

/** Até onde a série fica reservada: `recurringWeeks` semanas a partir de agora. */
function horizonFor(tenant: Pick<Tenant, 'recurringWeeks'>, now = new Date()) {
  return new Date(now.getTime() + tenant.recurringWeeks * WEEK_MS)
}

/** A primeira sessão é o modelo das próximas (nome, observações, respostas, status). */
async function templateBooking(seriesId: string) {
  return prisma.booking.findFirst({
    where: { seriesId },
    orderBy: { createdAt: 'asc' },
    include: { answers: true },
  })
}

/**
 * Tenta reservar uma sessão. Nunca lança por falta de horário: devolve null quando a semana
 * não serve (expediente, folga, feriado ou outro agendamento) e a série pula essa semana.
 */
async function createOccurrence(
  tenant: Tenant,
  series: BookingSeries,
  template: NonNullable<Awaited<ReturnType<typeof templateBooking>>>,
  startsAt: Date,
): Promise<Booking | null> {
  const db = forTenant(tenant.id)
  const service = await db.service.findFirst({ where: { id: series.serviceId, deletedAt: null } })
  if (!service) return null
  // Regras de antecedência não valem para a série (ela reserva semanas à frente de propósito)
  const free = await checkSlot({
    tenant,
    professionalId: series.professionalId,
    service,
    startsAt,
    ignoreRules: true,
  })
  if (!free) return null
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
  const blockedUntil = new Date(endsAt.getTime() + service.bufferMinutes * 60_000)
  const status = template.status === 'pending' ? 'pending' : 'confirmed'
  try {
    return await db.booking.create({
      data: {
        tenantId: tenant.id,
        seriesId: series.id,
        professionalId: series.professionalId,
        serviceId: service.id,
        customerId: series.customerId,
        customerName: template.customerName,
        startsAt,
        endsAt,
        blockedUntil,
        status,
        confirmedAt: status === 'confirmed' ? new Date() : null,
        source: template.source,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: template.source === 'manual' ? template.priceCents : service.priceCents,
        priceFrom: service.priceFrom,
        notes: template.notes,
        cancelToken: randomToken(18),
        answers: {
          create: template.answers.map((a) => ({
            tenantId: tenant.id,
            fieldId: a.fieldId,
            label: a.label,
            type: a.type,
            value: a.value as Prisma.InputJsonValue,
          })),
        },
      },
    })
  } catch (err) {
    // Outra reserva pegou o horário no mesmo instante: pula a semana
    if (isOverlapError(err)) return null
    throw err
  }
}

/**
 * Reserva as semanas que faltam até o horizonte. Avança `nextStartsAt` antes de cada tentativa
 * (de forma condicional), então duas execuções simultâneas nunca tentam a mesma semana.
 */
export async function extendSeries(tenant: Tenant, seriesId: string, now = new Date()) {
  const created: Date[] = []
  const skipped: Date[] = []
  const template = await templateBooking(seriesId)
  if (!template) return { created, skipped }
  const horizon = horizonFor(tenant, now)
  for (let guard = 0; guard < 60; guard++) {
    const series = await prisma.bookingSeries.findUnique({ where: { id: seriesId } })
    if (!series || series.endedAt || series.nextStartsAt > horizon) break
    const startsAt = series.nextStartsAt
    const claimed = await prisma.bookingSeries.updateMany({
      where: { id: series.id, nextStartsAt: startsAt, endedAt: null },
      data: { nextStartsAt: nextWeek(startsAt, tenant.timezone) },
    })
    if (!claimed.count) continue
    // Semana que já passou (série parada por um tempo): só avança
    if (startsAt <= now) continue
    const booking = await createOccurrence(tenant, series, template, startsAt)
    if (!booking) {
      skipped.push(startsAt)
      continue
    }
    created.push(startsAt)
    await onSeriesOccurrenceCreated(booking.id)
  }
  return { created, skipped }
}

/** Transforma um agendamento recém-criado na primeira sessão de um horário fixo semanal. */
export async function startSeries(tenant: Tenant, first: Booking, by: Actor) {
  const series = await prisma.bookingSeries.create({
    data: {
      tenantId: tenant.id,
      customerId: first.customerId,
      professionalId: first.professionalId,
      serviceId: first.serviceId,
      nextStartsAt: nextWeek(first.startsAt, tenant.timezone),
      createdBy: by,
    },
  })
  await prisma.booking.update({ where: { id: first.id }, data: { seriesId: series.id } })
  const { created, skipped } = await extendSeries(tenant, series.id)
  return { id: series.id, created: [first.startsAt, ...created], skipped }
}

/**
 * Encerra o horário fixo: não reserva mais semanas e cancela as sessões a partir de `from`.
 * Um aviso só para o outro lado (não um por sessão).
 */
export async function endSeries(opts: {
  tenant: Tenant
  seriesId: string
  by: Actor
  /** Sessões a partir deste instante são canceladas; as anteriores ficam. */
  from: Date
}) {
  const db = forTenant(opts.tenant.id)
  const now = new Date()
  const series = await db.bookingSeries.findFirst({ where: { id: opts.seriesId } })
  if (!series) return { canceled: 0, kept: [] as Date[] }
  await db.bookingSeries.updateMany({
    where: { id: series.id, endedAt: null },
    data: { endedAt: now, endedBy: opts.by },
  })
  const toCancel = await db.booking.findMany({
    where: {
      seriesId: series.id,
      status: { in: [...OPEN_BOOKING_STATUSES] },
      startsAt: { gte: opts.from },
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true },
  })
  const reason = 'Horário fixo encerrado'
  const res = await db.booking.updateMany({
    where: { id: { in: toCancel.map((b) => b.id) }, status: { in: [...OPEN_BOOKING_STATUSES] } },
    data: { status: 'canceled', canceledAt: now, canceledBy: opts.by, cancelReason: reason },
  })
  // Sessões que continuam marcadas (ex.: dentro do prazo de cancelamento do cliente)
  const kept = await db.booking.findMany({
    where: {
      seriesId: series.id,
      status: { in: [...OPEN_BOOKING_STATUSES] },
      startsAt: { gte: now },
    },
    orderBy: { startsAt: 'asc' },
    select: { startsAt: true },
  })
  if (res.count) {
    await onSeriesEnded(
      toCancel.map((b) => b.id),
      opts.by,
    )
  }
  return { canceled: res.count, kept: kept.map((k) => k.startsAt) }
}

/** O que mostrar de um horário fixo (área do cliente e painel). */
export async function seriesSummary(tenant: Pick<Tenant, 'timezone'>, seriesId: string) {
  const series = await prisma.bookingSeries.findUnique({ where: { id: seriesId } })
  if (!series) return null
  const upcoming = await prisma.booking.findMany({
    where: { seriesId, startsAt: { gte: new Date() }, status: { in: [...OPEN_BOOKING_STATUSES] } },
    orderBy: { startsAt: 'asc' },
    take: 12,
    select: { id: true, startsAt: true, status: true, cancelToken: true },
  })
  return {
    id: series.id,
    active: !series.endedAt,
    endedAt: series.endedAt,
    createdBy: series.createdBy,
    upcoming,
  }
}

/** Tarefa periódica: mantém as semanas reservadas à frente de cada horário fixo ativo. */
export async function extendActiveSeries(now = new Date()) {
  // 12 semanas é o maior horizonte possível; cada série usa o do próprio estabelecimento
  const due = await prisma.bookingSeries.findMany({
    where: { endedAt: null, nextStartsAt: { lte: new Date(now.getTime() + 12 * WEEK_MS) } },
    include: { tenant: { include: ACCOUNT_SUB_INCLUDE } },
    orderBy: { nextStartsAt: 'asc' },
    take: 500,
  })
  for (const s of due) {
    const tenant = withAccountSub(s.tenant)
    // Conta excluída, bloqueada ou sem assinatura: não reserva semanas novas
    if (
      tenant.deletedAt ||
      tenant.blocked ||
      accessLevel(tenant.subscription, now, env.APP_MODE) === 'blocked'
    )
      continue
    const professional = await prisma.professional.findFirst({
      where: { id: s.professionalId, tenantId: s.tenantId, deletedAt: null, active: true },
    })
    const service = await prisma.service.findFirst({
      where: { id: s.serviceId, tenantId: s.tenantId, deletedAt: null },
    })
    if (!professional || !service) {
      // Profissional ou serviço saiu: a série para de renovar (as sessões marcadas continuam)
      await prisma.bookingSeries.updateMany({
        where: { id: s.id, endedAt: null },
        data: { endedAt: now, endedBy: 'system' },
      })
      continue
    }
    await extendSeries(tenant, s.id, now).catch((err) =>
      logger.error({ err, seriesId: s.id }, 'Falha ao renovar horário fixo'),
    )
  }
}
