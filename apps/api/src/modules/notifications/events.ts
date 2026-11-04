import type { Subscription, Tenant } from '@prisma/client'
import { formatDateLong, toLocalTime } from '@marcai/shared'
import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { channels } from './channels/registry'
import { canNotify } from './gating'
import {
  type FullBooking,
  loadFullBooking,
  renderForCustomer,
  renderForProfessional,
} from './messages'
import { cancelJobs, enqueue } from './queue'

type TenantWithSub = Tenant & { subscription: Subscription | null }

export { canNotify }

async function recipients(b: FullBooking) {
  // Donas + a profissional do agendamento (se tiver acesso ao painel)
  const members = await prisma.tenantMember.findMany({
    where: { tenantId: b.tenantId, OR: [{ role: 'owner' }, { professionalId: b.professionalId }] },
    include: { user: { select: { id: true, email: true } } },
  })
  return members
}

/** Avisos para a profissional: painel (tempo real), push, WhatsApp (Pro) ou e-mail (fallback). */
async function notifyProfessional(
  b: FullBooking & { tenant: TenantWithSub },
  opts: {
    type: string
    title: string
    summary: string
    template: Parameters<typeof renderForProfessional>[1]
    extra?: Record<string, string>
  },
) {
  const t = b.tenant
  const link = `${env.APP_URL}/painel/agenda/${b.id}`
  if (t.notifyInApp) {
    await channels.inapp
      .send({
        tenantId: t.id,
        title: opts.title,
        body: opts.summary,
        url: `/painel/agenda/${b.id}`,
        type: opts.type,
        bookingId: b.id,
      } as never)
      .catch((err) => logger.error({ err }, 'Falha ao criar notificação no painel'))
  }
  const members = await recipients(b)
  if (t.notifyPush) {
    for (const m of members) {
      await enqueue({
        channel: 'push',
        kind: opts.type,
        bookingId: b.id,
        message: {
          tenantId: t.id,
          to: m.user.id,
          title: opts.title,
          body: opts.summary,
          url: `/painel/agenda/${b.id}`,
        },
      })
    }
  }
  const text = await renderForProfessional(b, opts.template, opts.extra)
  const waOk =
    t.notifyWhatsappProfessional && !!t.notifyPhone && canNotify(t, 'whatsapp_professional')
  if (waOk) {
    await enqueue({
      channel: 'whatsapp',
      kind: `professional_${opts.type}`,
      bookingId: b.id,
      message: { tenantId: t.id, to: t.notifyPhone!, title: opts.title, body: text, url: link },
    })
  } else if (t.notifyEmail) {
    for (const m of members) {
      await enqueue({
        channel: 'email',
        kind: `professional_${opts.type}`,
        bookingId: b.id,
        message: {
          tenantId: t.id,
          to: m.user.email,
          title: `${opts.title} — ${b.customer.name}`,
          body: text,
          url: link,
          fromName: env.APP_MODE === 'single_tenant' ? t.name : env.APP_NAME,
          color: t.primaryColor,
        },
      })
    }
  }
}

async function notifyCustomer(
  b: FullBooking & { tenant: TenantWithSub },
  template: Parameters<typeof renderForCustomer>[1],
  title: string,
  extra?: Record<string, string>,
) {
  const t = b.tenant
  const text = await renderForCustomer(b, template, extra)
  if (
    t.notifyWhatsappCustomer &&
    canNotify(t, 'whatsapp_customer') &&
    !b.customer.phone.startsWith('removida')
  ) {
    await enqueue({
      channel: 'whatsapp',
      kind: template,
      bookingId: b.id,
      message: { tenantId: t.id, to: b.customer.phone, title, body: text },
    })
  } else if (b.customer.email) {
    await enqueue({
      channel: 'email',
      kind: template,
      bookingId: b.id,
      message: {
        tenantId: t.id,
        to: b.customer.email,
        title,
        body: text,
        url: `${env.APP_URL}/a/${b.cancelToken}`,
        fromName: t.name,
        color: t.primaryColor,
      },
    })
  }
}

/** Agenda o lembrete X horas antes (o texto é montado na hora do envio). */
async function scheduleReminder(b: FullBooking & { tenant: TenantWithSub }) {
  await cancelJobs(b.id, ['customer_reminder'])
  const t = b.tenant
  if (!t.notifyWhatsappCustomer || !canNotify(t, 'whatsapp_customer')) return
  const runAt = new Date(b.startsAt.getTime() - t.reminderHours * 3_600_000)
  // Se já passou do momento ideal mas falta mais de 1h, envia agora; senão, não envia.
  if (b.startsAt.getTime() - Date.now() < 3_600_000) return
  await enqueue({
    channel: 'whatsapp',
    kind: 'customer_reminder',
    bookingId: b.id,
    runAt: runAt.getTime() < Date.now() ? new Date() : runAt,
    dedupeKey: `reminder:${b.id}:${b.startsAt.toISOString()}`,
    message: {
      tenantId: t.id,
      to: b.customer.phone,
      title: 'Lembrete',
      body: '',
      startsAt: b.startsAt.toISOString(),
    },
  })
}

async function load(bookingId: string) {
  const b = await loadFullBooking(bookingId)
  if (!b) logger.warn({ bookingId }, 'Agendamento não encontrado para notificar')
  return b as (FullBooking & { tenant: TenantWithSub }) | null
}

function when(b: FullBooking) {
  return `${formatDateLong(b.startsAt, b.tenant.timezone)} às ${toLocalTime(b.startsAt, b.tenant.timezone)}`
}

/**
 * Os handlers nunca derrubam o agendamento: qualquer erro é registrado e engolido.
 */
async function safely(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (err) {
    logger.error({ err, event: name }, 'Falha ao processar evento de notificação')
  }
}

export function onBookingCreated(bookingId: string, opts: { notifyCustomer?: boolean } = {}) {
  return safely('booking.created', async () => {
    const b = await load(bookingId)
    if (!b) return
    if (b.source === 'online') {
      await notifyProfessional(b, {
        type: 'booking_created',
        title: b.status === 'pending' ? 'Novo pedido de agendamento' : 'Novo agendamento!',
        summary: `${b.customer.name} · ${b.serviceName} · ${when(b)}`,
        template: 'professional_new_booking',
      })
    }
    if (opts.notifyCustomer !== false)
      await notifyCustomer(b, 'customer_confirmation', `Agendamento em ${b.tenant.name}`)
    await scheduleReminder(b)
  })
}

export function onBookingCanceled(bookingId: string, by: 'customer' | 'professional') {
  return safely('booking.canceled', async () => {
    const b = await load(bookingId)
    if (!b) return
    await cancelJobs(b.id, ['customer_reminder'])
    if (by === 'customer') {
      await notifyProfessional(b, {
        type: 'booking_canceled',
        title: 'Agendamento cancelado',
        summary: `${b.customer.name} cancelou ${b.serviceName} de ${when(b)}`,
        template: 'professional_booking_canceled',
        extra: { motivo: b.cancelReason || 'Não informado' },
      })
    } else {
      await notifyCustomer(b, 'customer_canceled', `Horário cancelado — ${b.tenant.name}`, {
        motivo: b.cancelReason ? `Motivo: ${b.cancelReason}` : '',
      })
    }
  })
}

export function onBookingRescheduled(
  bookingId: string,
  previousStartsAt: Date,
  by: 'customer' | 'professional',
) {
  return safely('booking.rescheduled', async () => {
    const b = await load(bookingId)
    if (!b) return
    const extra = {
      data_anterior: formatDateLong(previousStartsAt, b.tenant.timezone),
      hora_anterior: toLocalTime(previousStartsAt, b.tenant.timezone),
    }
    if (by === 'customer') {
      await notifyProfessional(b, {
        type: 'booking_rescheduled',
        title: 'Agendamento remarcado',
        summary: `${b.customer.name} remarcou ${b.serviceName} para ${when(b)}`,
        template: 'professional_booking_rescheduled',
        extra,
      })
    } else {
      await notifyCustomer(b, 'customer_rescheduled', `Horário remarcado — ${b.tenant.name}`, extra)
    }
    await scheduleReminder(b)
  })
}

export function onBookingConfirmedByCustomer(bookingId: string) {
  return safely('booking.customer_confirmed', async () => {
    const b = await load(bookingId)
    if (!b || !b.tenant.notifyInApp) return
    await channels.inapp.send({
      tenantId: b.tenantId,
      title: 'Presença confirmada ✅',
      body: `${b.customer.name} confirmou ${b.serviceName} de ${when(b)}`,
      url: `/painel/agenda/${b.id}`,
      type: 'booking_confirmed',
      bookingId: b.id,
    } as never)
  })
}
