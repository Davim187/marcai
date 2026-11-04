/**
 * Interface de cobrança. Implementações: Asaas (produção) e Fake (desenvolvimento).
 * Para trocar por Mercado Pago, basta implementar esta interface.
 */
export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'

export interface ProviderPayment {
  id: string
  subscriptionId: string | null
  value: number // em reais
  status: 'pending' | 'paid' | 'overdue' | 'refunded' | 'canceled'
  dueDate: string // YYYY-MM-DD
  paymentDate: string | null
  invoiceUrl: string | null
  billingType: string | null
  externalReference: string | null
}

export type BillingEventType =
  | 'payment_created'
  | 'payment_confirmed'
  | 'payment_overdue'
  | 'payment_refunded'
  | 'payment_deleted'
  | 'subscription_deleted'
  | 'other'

export interface BillingEvent {
  eventId: string
  type: BillingEventType
  rawType: string
  payment?: ProviderPayment
  subscriptionId?: string | null
}

export interface BillingProvider {
  readonly name: 'asaas' | 'fake'
  createCustomer(input: {
    name: string
    email: string
    cpfCnpj?: string
    phone?: string | null
    externalReference: string
  }): Promise<{ id: string }>
  createSubscription(input: {
    customerId: string
    value: number
    billingType: BillingType
    nextDueDate: string
    description: string
    externalReference: string
  }): Promise<{ id: string }>
  updateSubscription(
    id: string,
    input: { value?: number; billingType?: BillingType; description?: string },
  ): Promise<void>
  cancelSubscription(id: string): Promise<void>
  listPayments(subscriptionId: string): Promise<ProviderPayment[]>
  /** Valida a autenticidade do webhook (token/assinatura). */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): boolean
  parseWebhook(body: unknown): BillingEvent
}
