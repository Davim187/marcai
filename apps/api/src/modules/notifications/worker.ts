import type { FastifyBaseLogger } from 'fastify'
import type { NotificationJob } from '@prisma/client'
import {
  addDaysToDate,
  formatBRL,
  formatDateLong,
  localToUtc,
  renderTemplate,
  toLocalDate,
  toLocalTime,
  OPEN_BOOKING_STATUSES,
  isOpenBooking,
} from '@marcai/shared'
import { env } from '../../config/env'
import { logger as baseLogger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { channels } from './channels/registry'
import { PermanentChannelError, type ChannelName, type OutboundMessage } from './channels/types'
import { canNotify } from './gating'
import { getTemplate, loadFullBooking, renderForCustomer } from './messages'
import { enqueue } from './queue'

const BATCH = 20
const LOCK_TIMEOUT_MS = 5 * 60_000

/** Pega jobs vencidos com FOR UPDATE SKIP LOCKED: vários workers podem rodar em paralelo. */
async function claimJobs(): Promise<NotificationJob[]> {
  return prisma.$queryRaw<NotificationJob[]>`
    UPDATE "NotificationJob" SET status = 'processing', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "NotificationJob"
      WHERE (status = 'pending' AND "runAt" <= now())
         OR (status = 'processing' AND "lockedAt" < ${new Date(Date.now() - LOCK_TIMEOUT_MS)})
      ORDER BY "runAt" ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`
}

/** Jobs especiais são montados na hora do envio (dados sempre atualizados). */
async function resolveMessage(job: NotificationJob): Promise<OutboundMessage | null> {
  const payload = job.payload as unknown as OutboundMessage & { startsAt?: string }
  if (job.kind === 'customer_reminder') {
    const b = job.bookingId ? await loadFullBooking(job.bookingId) : null
    // Lembrete obsoleto: cancelado, remarcado ou plano sem o recurso
    if (!b || !isOpenBooking(b.status)) return null
    if (payload.startsAt && b.startsAt.toISOString() !== payload.startsAt) return null
    if (!canNotify(b.tenant, 'whatsapp_customer')) return null
    return { ...payload, body: await renderForCustomer(b, 'customer_reminder') }
  }
  if (job.kind === 'daily_summary') return buildDailySummary(job.tenantId!, payload)
  return payload
}

async function buildDailySummary(
  tenantId: string,
  payload: OutboundMessage,
): Promise<OutboundMessage | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true },
  })
  if (!tenant || !tenant.dailySummaryEnabled) return null
  const today = toLocalDate(new Date(), tenant.timezone)
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      status: { in: [...OPEN_BOOKING_STATUSES] },
      startsAt: {
        gte: localToUtc(today, 0, tenant.timezone),
        lt: localToUtc(addDaysToDate(today, 1), 0, tenant.timezone),
      },
    },
    include: { customer: true, professional: true },
    orderBy: { startsAt: 'asc' },
  })
  if (!bookings.length) return null
  const agenda = bookings
    .map(
      (b) =>
        `${toLocalTime(b.startsAt, tenant.timezone)} · ${b.customer.name} · ${b.serviceName}${tenant.notifyPhone ? '' : ''}`,
    )
    .join('\n')
  const body = renderTemplate(await getTemplate(tenantId, 'professional_daily_summary'), {
    negocio: tenant.name,
    data: formatDateLong(new Date(), tenant.timezone),
    total: formatBRL(bookings.reduce((s, b) => s + b.priceCents, 0)),
    agenda,
    link: `${env.APP_URL}/painel/agenda`,
  })
  return { ...payload, body }
}

export async function processJob(
  job: NotificationJob,
  log: FastifyBaseLogger | typeof baseLogger = baseLogger,
) {
  try {
    const msg = await resolveMessage(job)
    if (!msg) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'canceled', processedAt: new Date(), lastError: 'Obsoleto' },
      })
      return
    }
    await channels[job.channel as ChannelName].send(msg)
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { status: 'done', processedAt: new Date(), lastError: null },
    })
  } catch (err) {
    const permanent = err instanceof PermanentChannelError
    const exhausted = job.attempts >= job.maxAttempts
    const message = (err as Error).message?.slice(0, 500)
    log.warn(
      { jobId: job.id, channel: job.channel, kind: job.kind, attempt: job.attempts, err: message },
      'Falha ao enviar notificação',
    )
    if (permanent || exhausted) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'failed', lastError: message, processedAt: new Date() },
      })
      await fallbackToEmail(job)
    } else {
      // Backoff exponencial: 30s, 1min, 2min, 4min…
      const delay = 30_000 * 2 ** (job.attempts - 1)
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          lastError: message,
          runAt: new Date(Date.now() + delay),
          lockedAt: null,
        },
      })
    }
  }
}

/** WhatsApp para a profissional falhou de vez → manda por e-mail para a dona. */
async function fallbackToEmail(job: NotificationJob) {
  if (job.channel !== 'whatsapp' || !job.kind.startsWith('professional_') || !job.tenantId) return
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: job.tenantId, role: 'owner' },
    include: { user: true, tenant: true },
  })
  if (!owner) return
  const p = job.payload as unknown as OutboundMessage
  await enqueue({
    channel: 'email',
    kind: `${job.kind}_fallback`,
    bookingId: job.bookingId ?? undefined,
    message: {
      ...p,
      to: owner.user.email,
      fromName: owner.tenant.name,
      color: owner.tenant.primaryColor,
    },
  })
}

export async function processDueJobs(log: FastifyBaseLogger | typeof baseLogger = baseLogger) {
  let total = 0
  for (let round = 0; round < 10; round++) {
    const jobs = await claimJobs()
    if (!jobs.length) break
    await Promise.all(jobs.map((j) => processJob(j, log)))
    total += jobs.length
  }
  return total
}

/** Agenda o resumo diário das 07:00 (no fuso de cada estabelecimento). */
export async function scheduleDailySummaries(now = new Date()) {
  const tenants = await prisma.tenant.findMany({
    where: { dailySummaryEnabled: true, deletedAt: null, blocked: false },
    select: {
      id: true,
      timezone: true,
      notifyPhone: true,
      notifyWhatsappProfessional: true,
      name: true,
    },
  })
  for (const t of tenants) {
    const date = toLocalDate(now, t.timezone)
    const hour = Number(toLocalTime(now, t.timezone).slice(0, 2))
    if (hour < 7 || hour >= 12) continue
    const full = await prisma.tenant.findUnique({
      where: { id: t.id },
      include: { subscription: true },
    })
    const base = {
      tenantId: t.id,
      title: `Sua agenda de hoje`,
      body: '',
      url: `${env.APP_URL}/painel/agenda`,
    }
    if (
      full &&
      t.notifyPhone &&
      t.notifyWhatsappProfessional &&
      canNotify(full, 'whatsapp_professional')
    ) {
      await enqueue({
        channel: 'whatsapp',
        kind: 'daily_summary',
        dedupeKey: `daily:wa:${t.id}:${date}`,
        message: { ...base, to: t.notifyPhone },
      })
    }
    await enqueue({
      channel: 'push',
      kind: 'daily_summary',
      dedupeKey: `daily:push:${t.id}:${date}`,
      message: base,
    })
  }
}
