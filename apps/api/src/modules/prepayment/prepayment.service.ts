import type { Booking, BookingPayment, Subscription, Tenant } from '@prisma/client'
import QRCode from 'qrcode'
import {
  hasFeature,
  MINUTE_MS,
  PREPAYMENT_PERCENT_MAX,
  PREPAYMENT_PERCENT_MIN,
  prepaymentAmount,
  type PrepaymentMethod,
} from '@marcai/shared'
import { env } from '../../config/env'
import { decryptSecret } from '../../lib/crypto'
import { badRequest, notFound } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { buildPixPayload } from '../../lib/pix'
import { prisma } from '../../lib/prisma'
import { forTenant } from '../../lib/tenant-db'
import { onBookingApproved, onBookingCanceled, onPrepaymentUpdate } from '../notifications/events'
import { notifyOwners } from '../notifications/owners'

/** external_reference dos pagamentos de sinal (diferente das faturas do Marcaí: "inv:"). */
export const PREPAYMENT_REF = 'bkp:'
const EXPIRED_REASON = 'O sinal não foi pago dentro do prazo.'

type MpPaymentStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back'

interface MpPayment {
  id: number
  status: MpPaymentStatus
  external_reference?: string | null
  transaction_amount: number
  currency_id?: string
  date_approved?: string | null
}

const toReais = (cents: number) => Math.round(cents) / 100
const toCents = (v: number) => Math.round(v * 100)

// ---------------------------------------------------------------------------------------------
// Mercado Pago do estabelecimento (o dinheiro cai direto na conta da dona)
// ---------------------------------------------------------------------------------------------

export function tenantMpToken(tenant: Pick<Tenant, 'mpAccessTokenEnc'>) {
  return tenant.mpAccessTokenEnc ? decryptSecret(tenant.mpAccessTokenEnc) : null
}

export async function mpCall<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const res = await fetch(`${env.MP_API_URL.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!res.ok)
    throw Object.assign(
      new Error(`Mercado Pago ${res.status}: ${data.message ?? data.error ?? 'erro'}`),
      { status: res.status },
    )
  return data
}

/** Confere o access token colado pela dona e devolve um nome para exibir. */
export async function verifyMpToken(token: string) {
  try {
    const me = await mpCall<{ id: number; nickname?: string; email?: string }>(
      token,
      'GET',
      '/users/me',
    )
    return { label: me.email || me.nickname || `Conta ${me.id}` }
  } catch (err) {
    logger.warn({ err }, 'Access token do Mercado Pago recusado')
    throw badRequest(
      'O Mercado Pago não aceitou esse Access Token. Confira se copiou o de produção inteiro.',
      'MP_TOKEN_INVALIDO',
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Criação do sinal junto com a reserva
// ---------------------------------------------------------------------------------------------

/** Meio de cobrança que funciona agora (configuração completa), ou null. */
export function activePrepaymentMethod(
  tenant: Tenant & { subscription?: Subscription | null },
): PrepaymentMethod | null {
  if (!tenant.requirePrepayment) return null
  // Recurso do Premium: plano menor (ou sem a assinatura carregada) não cobra sinal
  if (!hasFeature(tenant.subscription ?? null, 'prepayment', env.APP_MODE)) return null
  if (tenant.prepaymentMethod === 'mercadopago')
    return tenant.mpAccessTokenEnc ? 'mercadopago' : null
  return tenant.pixKey ? 'pix_manual' : null
}

/** A reserva online precisa de sinal? (serviço com preço e sinal configurado) */
export function needsPrepayment(tenant: Tenant, priceCents: number) {
  return priceCents > 0 && activePrepaymentMethod(tenant) !== null
}

/**
 * Gera o sinal de uma reserva recém-criada. No Mercado Pago, cria o link de pagamento
 * (Checkout Pro só com PIX) na conta do estabelecimento.
 */
export async function startPrepayment(tenant: Tenant, booking: Booking) {
  const method = activePrepaymentMethod(tenant)
  if (!method) return null
  const percent = Math.min(
    PREPAYMENT_PERCENT_MAX,
    Math.max(PREPAYMENT_PERCENT_MIN, tenant.prepaymentPercent),
  )
  const amountCents = prepaymentAmount(booking.priceCents, percent)
  // O prazo nunca passa do início do atendimento
  const expiresAt = new Date(
    Math.min(Date.now() + tenant.prepaymentHoldMinutes * MINUTE_MS, booking.startsAt.getTime()),
  )
  const db = forTenant(tenant.id)
  const payment = await db.bookingPayment.create({
    data: {
      tenantId: tenant.id,
      bookingId: booking.id,
      method,
      percent,
      amountCents,
      expiresAt,
    },
  })
  if (method === 'mercadopago') {
    const checkout = await createMpCheckout(tenant, booking, payment)
    return db.bookingPayment.update({ where: { id: payment.id }, data: checkout })
  }
  return payment
}

async function createMpCheckout(tenant: Tenant, booking: Booking, payment: BookingPayment) {
  const token = tenantMpToken(tenant)
  if (!token) throw badRequest('O pagamento online deste estabelecimento está indisponível.')
  const manage = `${env.APP_URL}/a/${booking.cancelToken}`
  const pref = await mpCall<{ id: string; init_point: string }>(
    token,
    'POST',
    '/checkout/preferences',
    {
      items: [
        {
          id: booking.id,
          title: `Sinal ${payment.percent}% · ${booking.serviceName}`.slice(0, 250),
          quantity: 1,
          unit_price: toReais(payment.amountCents),
          currency_id: 'BRL',
        },
      ],
      external_reference: `${PREPAYMENT_REF}${payment.id}`,
      notification_url: `${env.API_URL}/api/webhooks/mercadopago/sinal/${tenant.id}`,
      back_urls: {
        success: `${manage}?pagamento=aprovado`,
        pending: `${manage}?pagamento=pendente`,
        failure: `${manage}?pagamento=recusado`,
      },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: payment.expiresAt.toISOString(),
      // PIX gerado no checkout também expira no prazo da reserva
      date_of_expiration: payment.expiresAt.toISOString(),
      payment_methods: {
        excluded_payment_types: ['credit_card', 'debit_card', 'ticket', 'atm', 'prepaid_card'].map(
          (id) => ({ id }),
        ),
        installments: 1,
      },
      statement_descriptor: tenant.name.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 13) || undefined,
    },
    `sinal-${payment.id}`,
  )
  return { checkoutId: pref.id, checkoutUrl: pref.init_point }
}

// ---------------------------------------------------------------------------------------------
// O que a cliente vê (página de sucesso e área da cliente)
// ---------------------------------------------------------------------------------------------

export async function publicPaymentView(
  tenant: Tenant,
  booking: Pick<Booking, 'id'>,
  payment: BookingPayment | null,
) {
  if (!payment) return null
  const base = {
    method: payment.method as PrepaymentMethod,
    status: payment.status,
    percent: payment.percent,
    amountCents: payment.amountCents,
    expiresAt: payment.expiresAt.toISOString(),
    proofSent: !!payment.proofUrl,
    rejectReason: payment.rejectReason,
    checkoutUrl: null as string | null,
    pix: null as null | {
      key: string
      holder: string | null
      copyPaste: string
      qrDataUrl: string
    },
  }
  const open = payment.status === 'awaiting_payment' || payment.status === 'under_review'
  if (!open) return base
  if (payment.method === 'mercadopago') return { ...base, checkoutUrl: payment.checkoutUrl }
  if (!tenant.pixKey) return base
  const copyPaste = buildPixPayload({
    key: tenant.pixKey,
    amountCents: payment.amountCents,
    merchantName: tenant.pixKeyHolder || tenant.name,
    merchantCity: tenant.city || 'Brasil',
    txid: booking.id.slice(-25),
  })
  const qrDataUrl = await QRCode.toDataURL(copyPaste, { margin: 1, width: 320 })
  return {
    ...base,
    pix: { key: tenant.pixKey, holder: tenant.pixKeyHolder, copyPaste, qrDataUrl },
  }
}

// ---------------------------------------------------------------------------------------------
// Transições: pago, recusado, vencido, devolvido
// ---------------------------------------------------------------------------------------------

/** Confirma a reserva pendente (uma vez só, mesmo com requisições simultâneas) e avisa a cliente. */
async function confirmPendingBooking(tenantId: string, bookingId: string) {
  const db = forTenant(tenantId)
  const res = await db.booking.updateMany({
    where: { id: bookingId, status: 'pending' },
    data: { status: 'confirmed', confirmedAt: new Date() },
  })
  if (res.count) await onBookingApproved(bookingId)
  return res.count > 0
}

async function cancelPendingBooking(tenantId: string, bookingId: string, reason: string) {
  const db = forTenant(tenantId)
  const res = await db.booking.updateMany({
    where: { id: bookingId, status: 'pending' },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
      canceledBy: 'professional',
      cancelReason: reason,
    },
  })
  if (res.count) await onBookingCanceled(bookingId, 'professional')
  return res.count > 0
}

/** PIX manual: a cliente mandou o comprovante. Fica para a dona conferir. */
export async function attachProof(tenant: Tenant, bookingId: string, proofUrl: string) {
  const db = forTenant(tenant.id)
  const payment = await db.bookingPayment.findFirst({ where: { bookingId } })
  if (!payment || payment.method !== 'pix_manual')
    throw badRequest('Esse agendamento não tem sinal por PIX.')
  if (payment.status !== 'awaiting_payment' && payment.status !== 'under_review')
    throw badRequest('Esse pagamento não está mais aberto.', 'PAGAMENTO_ENCERRADO')
  if (payment.status === 'awaiting_payment' && payment.expiresAt.getTime() < Date.now())
    throw badRequest(
      'O prazo para pagar o sinal acabou. Faça um novo agendamento.',
      'PRAZO_VENCIDO',
    )
  const res = await db.bookingPayment.updateMany({
    where: { id: payment.id, status: { in: ['awaiting_payment', 'under_review'] } },
    data: { status: 'under_review', proofUrl, proofUploadedAt: new Date() },
  })
  if (!res.count) throw badRequest('Esse pagamento acabou de mudar. Atualize a página.')
  await onPrepaymentUpdate(bookingId, {
    type: 'prepayment_proof',
    title: 'Comprovante de sinal para conferir',
  })
  return { previousProofUrl: payment.proofUrl }
}

/**
 * A dona aprovou o sinal (PIX manual) ou confirmou a reserva no painel: o sinal conta como
 * pago e a reserva é confirmada.
 */
export async function approvePrepayment(tenantId: string, bookingId: string) {
  const db = forTenant(tenantId)
  const payment = await db.bookingPayment.findFirst({ where: { bookingId } })
  if (!payment) throw notFound('Esse agendamento não tem sinal')
  if (payment.status === 'paid') {
    await confirmPendingBooking(tenantId, bookingId)
    return
  }
  if (payment.method !== 'pix_manual')
    throw badRequest('O sinal pelo Mercado Pago é confirmado sozinho quando o cliente paga.')
  const res = await db.bookingPayment.updateMany({
    where: { id: payment.id, status: { in: ['awaiting_payment', 'under_review'] } },
    data: { status: 'paid', paidAt: new Date(), reviewedAt: new Date() },
  })
  if (!res.count) throw badRequest('Esse pagamento não está mais aberto.')
  await confirmPendingBooking(tenantId, bookingId)
}

/** A dona recusou o comprovante: o horário é liberado e a cliente é avisada com o motivo. */
export async function rejectPrepayment(tenantId: string, bookingId: string, reason: string) {
  const db = forTenant(tenantId)
  const payment = await db.bookingPayment.findFirst({ where: { bookingId } })
  if (!payment) throw notFound('Esse agendamento não tem sinal')
  const res = await db.bookingPayment.updateMany({
    where: { id: payment.id, status: { in: ['awaiting_payment', 'under_review'] } },
    data: { status: 'rejected', reviewedAt: new Date(), rejectReason: reason },
  })
  if (!res.count) throw badRequest('Esse pagamento não está mais aberto.')
  await cancelPendingBooking(tenantId, bookingId, `Pagamento do sinal recusado: ${reason}`)
}

/** Pagamento aprovado no Mercado Pago (webhook, volta do checkout ou rotina). */
async function applyMpPayment(tenant: Tenant, payment: BookingPayment, mp: MpPayment) {
  const db = forTenant(tenant.id)
  if (mp.currency_id && mp.currency_id !== 'BRL') return
  if (mp.status === 'refunded' || mp.status === 'charged_back') {
    const res = await db.bookingPayment.updateMany({
      where: { id: payment.id, status: 'paid' },
      data: { status: 'refunded' },
    })
    if (res.count)
      await onPrepaymentUpdate(payment.bookingId, {
        type: 'prepayment_refunded',
        title: 'Sinal devolvido no Mercado Pago',
      })
    return
  }
  if (mp.status !== 'approved') return
  if (toCents(mp.transaction_amount) < payment.amountCents) {
    logger.warn({ paymentId: payment.id, mp: mp.id }, 'Sinal pago com valor menor que o devido')
    return
  }
  const booking = await db.booking.findFirst({ where: { id: payment.bookingId } })
  if (!booking) return
  const paidAt = mp.date_approved ? new Date(mp.date_approved) : new Date()
  // Pago depois do prazo e o horário já foi liberado: devolve o dinheiro sozinho
  if (booking.status === 'canceled') {
    const claimed = await db.bookingPayment.updateMany({
      where: { id: payment.id, status: { in: ['awaiting_payment', 'expired', 'rejected'] } },
      data: { status: 'refunded', providerPaymentId: String(mp.id), paidAt },
    })
    if (!claimed.count) return
    const token = tenantMpToken(tenant)
    const refunded = token
      ? await mpCall(token, 'POST', `/v1/payments/${mp.id}/refunds`, {}, `refund-${mp.id}`)
          .then(() => true)
          .catch((err) => {
            logger.error({ err, mp: mp.id }, 'Falha ao devolver sinal pago fora do prazo')
            return false
          })
      : false
    await notifyOwners({
      tenantId: tenant.id,
      kind: 'prepayment_late',
      title: 'Sinal pago depois que o horário foi liberado',
      body: refunded
        ? `${booking.customerName ?? 'O cliente'} pagou o sinal de ${booking.serviceName} fora do prazo. Devolvemos o valor automaticamente pelo Mercado Pago.`
        : `${booking.customerName ?? 'O cliente'} pagou o sinal de ${booking.serviceName} fora do prazo e não conseguimos devolver sozinhos. Devolva pelo app do Mercado Pago (pagamento ${mp.id}).`,
      path: `/painel/agenda/${booking.id}`,
      dedupe: String(mp.id),
    })
    return
  }
  const res = await db.bookingPayment.updateMany({
    where: { id: payment.id, status: { in: ['awaiting_payment', 'expired'] } },
    data: { status: 'paid', paidAt, providerPaymentId: String(mp.id) },
  })
  if (!res.count) return
  await confirmPendingBooking(tenant.id, booking.id)
  await onPrepaymentUpdate(booking.id, {
    type: 'prepayment_paid',
    title: 'Sinal pago pelo Mercado Pago ✅',
  })
}

/** Notificação do Mercado Pago na conta do estabelecimento. O corpo nunca é confiável. */
export async function handleTenantMpWebhook(tenantId: string, paymentId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const token = tenant ? tenantMpToken(tenant) : null
  if (!tenant || !token) return
  const mp = await mpCall<MpPayment>(token, 'GET', `/v1/payments/${encodeURIComponent(paymentId)}`)
  const ref = mp.external_reference ?? ''
  if (!ref.startsWith(PREPAYMENT_REF)) return
  const payment = await forTenant(tenant.id).bookingPayment.findFirst({
    where: { id: ref.slice(PREPAYMENT_REF.length) },
  })
  if (payment) await applyMpPayment(tenant, payment, mp)
}

/** Procura no Mercado Pago pagamentos do sinal (quando o webhook não chegou). */
export async function syncMpPayment(tenant: Tenant, payment: BookingPayment) {
  if (payment.method !== 'mercadopago') return
  const token = tenantMpToken(tenant)
  if (!token) return
  const found = await mpCall<{ results: MpPayment[] }>(
    token,
    'GET',
    `/v1/payments/search?external_reference=${encodeURIComponent(`${PREPAYMENT_REF}${payment.id}`)}&sort=date_created&criteria=desc`,
  ).catch((err) => {
    logger.warn({ err, paymentId: payment.id }, 'Falha ao consultar o sinal no Mercado Pago')
    return { results: [] as MpPayment[] }
  })
  const approved = found.results.find((p) => p.status === 'approved')
  if (approved) await applyMpPayment(tenant, payment, approved)
}

/**
 * Rotina (a cada minuto): sinais não pagos no prazo liberam o horário. Antes de liberar,
 * confere no Mercado Pago se o pagamento não entrou sem o webhook chegar.
 */
export async function expireOverduePrepayments(now = new Date()) {
  const overdue = await prisma.bookingPayment.findMany({
    where: { status: 'awaiting_payment', expiresAt: { lt: now } },
    include: { tenant: true },
    take: 100,
  })
  for (const p of overdue) {
    try {
      if (p.method === 'mercadopago') {
        await syncMpPayment(p.tenant, p)
        const fresh = await prisma.bookingPayment.findUnique({ where: { id: p.id } })
        if (fresh?.status !== 'awaiting_payment') continue
      }
      const res = await prisma.bookingPayment.updateMany({
        where: { id: p.id, status: 'awaiting_payment' },
        data: { status: 'expired' },
      })
      if (!res.count) continue
      await cancelPendingBooking(p.tenantId, p.bookingId, EXPIRED_REASON)
      if (p.method === 'mercadopago' && p.checkoutId) {
        const token = tenantMpToken(p.tenant)
        if (token)
          await mpCall(token, 'PUT', `/checkout/preferences/${encodeURIComponent(p.checkoutId)}`, {
            expires: true,
            expiration_date_to: new Date().toISOString(),
          }).catch(() => undefined)
      }
    } catch (err) {
      logger.error({ err, paymentId: p.id }, 'Falha ao vencer sinal não pago')
    }
  }
  return overdue.length
}
