import { createHmac } from 'node:crypto'
import { env } from '../../config/env'
import { safeEqual } from '../../lib/crypto'
import type {
  BillingEvent,
  BillingProvider,
  BillingType,
  CardSubscriptionInput,
  CheckoutInput,
  WebhookRequest,
} from './provider'

/** Prefixos do external_reference: sabemos de onde veio cada pagamento. */
export const INVOICE_REF = 'inv:'
export const TENANT_REF = 'ten:'

/** Tipos de pagamento do Mercado Pago a excluir do checkout para cada escolha. */
const EXCLUDED_TYPES: Record<BillingType, string[]> = {
  PIX: ['credit_card', 'debit_card', 'ticket', 'atm', 'prepaid_card'],
  BOLETO: ['credit_card', 'debit_card', 'bank_transfer', 'atm', 'prepaid_card'],
  CREDIT_CARD: ['ticket', 'bank_transfer', 'atm'],
  UNDEFINED: [],
}

interface MpPayment {
  id: number
  status:
    | 'pending'
    | 'approved'
    | 'authorized'
    | 'in_process'
    | 'in_mediation'
    | 'rejected'
    | 'cancelled'
    | 'refunded'
    | 'charged_back'
  external_reference?: string | null
  transaction_amount: number
  currency_id?: string
  date_approved?: string | null
  payment_method_id?: string | null
  payment_type_id?: string | null
}

interface MpPreapproval {
  id: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled'
  external_reference?: string | null
}

interface MpAuthorizedPayment {
  id: number
  preapproval_id: string
  transaction_amount: number
  payment?: { id: number; status: MpPayment['status'] } | null
  status?: string
  currency_id?: string
  debit_date?: string | null
  date_created?: string | null
}

const REPLAY_WINDOW_MS = 3 * 24 * 60 * 60_000
/** Tópicos que não usamos (merchant_order, IPN antigo): respondemos 200 para não haver reenvio. */
const IGNORED_TOPICS = new Set(['merchant_order', 'chargebacks', 'point_integration_wh'])

const toCents = (v: number) => Math.round(v * 100)
const toReais = (cents: number) => Math.round(cents) / 100

function paymentEventType(status: MpPayment['status']): BillingEvent['type'] {
  // "authorized" é só reserva (sem captura): conta como pendente até virar "approved"
  if (status === 'approved') return 'payment_confirmed'
  if (status === 'refunded' || status === 'charged_back') return 'payment_refunded'
  if (status === 'rejected' || status === 'cancelled') return 'payment_failed'
  return 'payment_pending'
}

/**
 * Mercado Pago: Checkout Pro para faturas (PIX, boleto, cartão) e Preapproval para a
 * assinatura automática no cartão. Docs: https://www.mercadopago.com.br/developers
 */
export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = 'mercadopago' as const

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado')
    const res = await fetch(`${env.MP_API_URL.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
    if (!res.ok)
      throw new Error(`Mercado Pago ${res.status}: ${data.message ?? data.error ?? 'erro'}`)
    return data
  }

  async createCheckout(input: CheckoutInput) {
    const pref = await this.call<{ id: string; init_point: string }>(
      'POST',
      '/checkout/preferences',
      {
        items: [
          {
            id: input.invoiceId,
            title: input.description,
            quantity: 1,
            unit_price: toReais(input.amountCents),
            currency_id: 'BRL',
          },
        ],
        payer: { email: input.payerEmail },
        external_reference: `${INVOICE_REF}${input.invoiceId}`,
        notification_url: `${env.API_URL}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${env.APP_URL}/painel/assinatura?pagamento=aprovado`,
          pending: `${env.APP_URL}/painel/assinatura?pagamento=pendente`,
          failure: `${env.APP_URL}/painel/assinatura?pagamento=recusado`,
        },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: input.expiresAt.toISOString(),
        payment_methods: {
          excluded_payment_types: EXCLUDED_TYPES[input.billingType].map((id) => ({ id })),
          installments: 1,
        },
        statement_descriptor: env.APP_NAME.slice(0, 13),
      },
      `checkout-${input.invoiceId}-${input.billingType}-${input.amountCents}-${input.expiresAt.getTime()}`,
    )
    return { checkoutId: pref.id, checkoutUrl: pref.init_point }
  }

  async createCardSubscription(input: CardSubscriptionInput) {
    const start =
      input.startDate.getTime() > Date.now() + 60_000
        ? input.startDate
        : new Date(Date.now() + 60_000)
    const sub = await this.call<{ id: string; init_point: string }>('POST', '/preapproval', {
      reason: input.description,
      external_reference: `${TENANT_REF}${input.tenantId}`,
      payer_email: input.payerEmail,
      back_url: `${env.APP_URL}/painel/assinatura?cartao=ok`,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: toReais(input.amountCents),
        currency_id: 'BRL',
        start_date: start.toISOString(),
      },
    })
    return { id: sub.id, checkoutUrl: sub.init_point }
  }

  async expireCheckout(checkoutId: string) {
    await this.call('PUT', `/checkout/preferences/${encodeURIComponent(checkoutId)}`, {
      expires: true,
      expiration_date_to: new Date().toISOString(),
    })
  }

  async updateCardSubscriptionAmount(id: string, amountCents: number) {
    await this.call('PUT', `/preapproval/${encodeURIComponent(id)}`, {
      auto_recurring: { transaction_amount: toReais(amountCents), currency_id: 'BRL' },
    })
  }

  async cancelCardSubscription(id: string) {
    await this.call('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' })
  }

  /**
   * x-signature: "ts=<timestamp>,v1=<hmac>". Manifesto assinado (HMAC-SHA256 com o segredo
   * do webhook): "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
   */
  verifyWebhook(req: WebhookRequest) {
    if (!env.MP_WEBHOOK_SECRET) return false
    const signature = String(req.headers['x-signature'] ?? '')
    const requestId = String(req.headers['x-request-id'] ?? '')
    const parts = Object.fromEntries(
      signature
        .split(',')
        .map((p) => p.trim().split('=') as [string, string])
        .filter((p) => p.length === 2),
    )
    const ts = parts.ts
    const v1 = parts.v1
    if (!ts || !v1) return false
    // Recusa notificações muito antigas. A janela é larga porque os reenvios do Mercado Pago
    // podem manter o ts original; repetir uma notificação legítima é inofensivo (idempotência +
    // o pagamento é sempre consultado na API).
    const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) return false
    const dataId = notificationDataId(req)
    let manifest = ''
    // O Mercado Pago assina o id em minúsculas quando ele é alfanumérico
    if (dataId) manifest += `id:${dataId.toLowerCase()};`
    if (requestId) manifest += `request-id:${requestId};`
    manifest += `ts:${ts};`
    const expected = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex')
    return safeEqual(expected, v1)
  }

  /** Notificações que dispensam processamento (e não trazem x-signature, no caso do IPN antigo). */
  shouldIgnore(req: WebhookRequest) {
    const topic = String(req.query.topic ?? req.query.type ?? '')
    const legacyIpn = req.query.topic !== undefined && !req.headers['x-signature']
    return legacyIpn || IGNORED_TOPICS.has(topic)
  }

  async resolveWebhook(req: WebhookRequest): Promise<BillingEvent | null> {
    const type = String(
      req.query.type ?? req.query.topic ?? (req.body as { type?: string })?.type ?? '',
    )
    const dataId = notificationDataId(req)
    if (!dataId) return null

    if (type === 'payment') {
      const p = await this.call<MpPayment>('GET', `/v1/payments/${encodeURIComponent(dataId)}`)
      const ref = p.external_reference ?? ''
      if (!ref.startsWith(INVOICE_REF)) return null // pagamento que não é de fatura nossa
      if (p.currency_id && p.currency_id !== 'BRL') return null
      return {
        eventId: `payment:${p.id}:${p.status}`,
        type: paymentEventType(p.status),
        invoiceId: ref.slice(INVOICE_REF.length),
        providerPaymentId: String(p.id),
        amountCents: toCents(p.transaction_amount),
        paidAt: p.date_approved ?? null,
        paymentMethod: p.payment_type_id ?? p.payment_method_id ?? null,
      }
    }

    if (type === 'subscription_preapproval') {
      const sub = await this.call<MpPreapproval>(
        'GET',
        `/preapproval/${encodeURIComponent(dataId)}`,
      )
      const kind: BillingEvent['type'] =
        sub.status === 'authorized'
          ? 'subscription_authorized'
          : sub.status === 'cancelled'
            ? 'subscription_canceled'
            : 'other'
      return {
        eventId: `preapproval:${sub.id}:${sub.status}`,
        type: kind,
        providerSubscriptionId: sub.id,
      }
    }

    if (type === 'subscription_authorized_payment') {
      const ap = await this.call<MpAuthorizedPayment>(
        'GET',
        `/authorized_payments/${encodeURIComponent(dataId)}`,
      )
      const status = ap.payment?.status ?? 'pending'
      return {
        eventId: `authorized_payment:${ap.id}:${status}`,
        type: paymentEventType(status),
        providerSubscriptionId: ap.preapproval_id,
        providerPaymentId: ap.payment?.id ? String(ap.payment.id) : `ap-${ap.id}`,
        amountCents: toCents(ap.transaction_amount),
        paidAt: ap.debit_date ?? ap.date_created ?? new Date().toISOString(),
        paymentMethod: 'credit_card',
      }
    }
    return null
  }
}

/** id do recurso notificado: query "data.id" (formato atual) ou "id" (formato antigo). */
export function notificationDataId(req: WebhookRequest) {
  const q = req.query
  const raw =
    q['data.id'] ??
    (q.data as { id?: unknown } | undefined)?.id ??
    q.id ??
    (req.body as { data?: { id?: unknown } })?.data?.id
  if (raw === undefined || raw === null) return null
  const id = String(raw)
  return /^[\w-]{1,64}$/.test(id) ? id : null
}
