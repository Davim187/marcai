import { env } from '../../config/env'
import { safeEqual } from '../../lib/crypto'
import type {
  BillingEvent,
  BillingEventType,
  BillingProvider,
  BillingType,
  ProviderPayment,
} from './provider'

interface AsaasPayment {
  id: string
  subscription?: string | null
  value: number
  status: string
  dueDate: string
  paymentDate?: string | null
  clientPaymentDate?: string | null
  invoiceUrl?: string | null
  billingType?: string | null
  externalReference?: string | null
}

const STATUS_MAP: Record<string, ProviderPayment['status']> = {
  PENDING: 'pending',
  AWAITING_RISK_ANALYSIS: 'pending',
  CONFIRMED: 'paid',
  RECEIVED: 'paid',
  RECEIVED_IN_CASH: 'paid',
  OVERDUE: 'overdue',
  REFUNDED: 'refunded',
  REFUND_REQUESTED: 'refunded',
  CHARGEBACK_REQUESTED: 'refunded',
  DELETED: 'canceled',
}

const EVENT_MAP: Record<string, BillingEventType> = {
  PAYMENT_CREATED: 'payment_created',
  PAYMENT_UPDATED: 'payment_created',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_RECEIVED: 'payment_confirmed',
  PAYMENT_OVERDUE: 'payment_overdue',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYMENT_CHARGEBACK_REQUESTED: 'payment_refunded',
  PAYMENT_DELETED: 'payment_deleted',
  SUBSCRIPTION_DELETED: 'subscription_deleted',
  SUBSCRIPTION_INACTIVATED: 'subscription_deleted',
}

function toPayment(p: AsaasPayment): ProviderPayment {
  return {
    id: p.id,
    subscriptionId: p.subscription ?? null,
    value: p.value,
    status: STATUS_MAP[p.status] ?? 'pending',
    dueDate: p.dueDate,
    paymentDate: p.paymentDate ?? p.clientPaymentDate ?? null,
    invoiceUrl: p.invoiceUrl ?? null,
    billingType: p.billingType ?? null,
    externalReference: p.externalReference ?? null,
  }
}

/** Asaas: PIX, boleto e cartão com cobrança recorrente mensal. */
export class AsaasBillingProvider implements BillingProvider {
  readonly name = 'asaas' as const

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!env.ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada')
    const res = await fetch(`${env.ASAAS_API_URL.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        access_token: env.ASAAS_API_KEY,
        'user-agent': 'marcai',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await res.json().catch(() => ({}))) as T & {
      errors?: Array<{ description: string }>
    }
    if (!res.ok)
      throw new Error(
        `Asaas ${res.status}: ${data.errors?.map((e) => e.description).join('; ') ?? 'erro'}`,
      )
    return data
  }

  async createCustomer(input: {
    name: string
    email: string
    cpfCnpj?: string
    phone?: string | null
    externalReference: string
  }) {
    const r = await this.call<{ id: string }>('POST', '/customers', {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      mobilePhone: input.phone?.replace(/^55/, ''),
      externalReference: input.externalReference,
      notificationDisabled: false,
    })
    return { id: r.id }
  }

  async createSubscription(input: {
    customerId: string
    value: number
    billingType: BillingType
    nextDueDate: string
    description: string
    externalReference: string
  }) {
    const r = await this.call<{ id: string }>('POST', '/subscriptions', {
      customer: input.customerId,
      billingType: input.billingType,
      value: input.value,
      nextDueDate: input.nextDueDate,
      cycle: 'MONTHLY',
      description: input.description,
      externalReference: input.externalReference,
    })
    return { id: r.id }
  }

  async updateSubscription(
    id: string,
    input: { value?: number; billingType?: BillingType; description?: string },
  ) {
    await this.call('PUT', `/subscriptions/${id}`, { ...input, updatePendingPayments: true })
  }

  async cancelSubscription(id: string) {
    await this.call('DELETE', `/subscriptions/${id}`)
  }

  async listPayments(subscriptionId: string) {
    const r = await this.call<{ data: AsaasPayment[] }>(
      'GET',
      `/subscriptions/${subscriptionId}/payments?limit=50`,
    )
    return r.data.map(toPayment)
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>) {
    const token = String(headers['asaas-access-token'] ?? '')
    return Boolean(env.ASAAS_WEBHOOK_TOKEN) && safeEqual(token, env.ASAAS_WEBHOOK_TOKEN!)
  }

  parseWebhook(body: unknown): BillingEvent {
    const b = body as {
      id?: string
      event: string
      payment?: AsaasPayment
      subscription?: { id: string }
    }
    const payment = b.payment ? toPayment(b.payment) : undefined
    return {
      eventId:
        b.id ?? `${b.event}:${b.payment?.id ?? b.subscription?.id}:${b.payment?.status ?? ''}`,
      rawType: b.event,
      type: EVENT_MAP[b.event] ?? 'other',
      payment,
      subscriptionId: payment?.subscriptionId ?? b.subscription?.id ?? null,
    }
  }
}
