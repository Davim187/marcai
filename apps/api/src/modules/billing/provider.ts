import { z } from 'zod'

/**
 * Interface de cobrança. Implementações: Mercado Pago (produção) e Fake (dev/testes).
 *
 * Modelo de cobrança:
 * - CREDIT_CARD: assinatura automática no cartão (a pessoa autoriza uma vez no provedor);
 * - PIX / BOLETO / UNDEFINED: o sistema gera a fatura do mês e um link de pagamento.
 */
export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'

export interface CheckoutInput {
  invoiceId: string
  description: string
  amountCents: number
  payerEmail: string
  billingType: BillingType
  /** Até quando o link aceita pagamento */
  expiresAt: Date
}

export interface CardSubscriptionInput {
  tenantId: string
  description: string
  amountCents: number
  payerEmail: string
  /** Primeira cobrança (fim do teste ou do período já pago) */
  startDate: Date
}

export const billingEventSchema = z.object({
  /** Chave de idempotência: o mesmo evento nunca é aplicado duas vezes */
  eventId: z.string().min(1).max(200),
  type: z.enum([
    'payment_confirmed',
    'payment_pending',
    'payment_failed',
    'payment_refunded',
    'subscription_authorized',
    'subscription_canceled',
    'other',
  ]),
  /** Fatura paga via checkout (PIX, boleto, cartão avulso) */
  invoiceId: z.string().max(100).nullish(),
  /** Assinatura automática no cartão */
  providerSubscriptionId: z.string().max(100).nullish(),
  providerPaymentId: z.string().max(100).nullish(),
  amountCents: z.number().int().nonnegative().nullish(),
  paidAt: z.string().max(40).nullish(),
  paymentMethod: z.string().max(50).nullish(),
})
export type BillingEvent = z.infer<typeof billingEventSchema>

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>
  query: Record<string, unknown>
  body: unknown
  rawBody: Buffer
}

export interface BillingProvider {
  readonly name: 'mercadopago' | 'fake'
  /** Link de pagamento de uma fatura (Checkout Pro no Mercado Pago). */
  createCheckout(input: CheckoutInput): Promise<{ checkoutId: string; checkoutUrl: string }>
  /** Assinatura automática no cartão. Devolve o link para a pessoa autorizar. */
  createCardSubscription(input: CardSubscriptionInput): Promise<{ id: string; checkoutUrl: string }>
  /** Invalida um link de pagamento (ex.: a fatura foi cancelada ou trocou de valor). */
  expireCheckout(checkoutId: string): Promise<void>
  updateCardSubscriptionAmount(id: string, amountCents: number): Promise<void>
  cancelCardSubscription(id: string): Promise<void>
  /** Notificações que não interessam e podem receber 200 direto (sem verificar). */
  shouldIgnore?(req: WebhookRequest): boolean
  /** Confere a autenticidade da notificação (assinatura/segredo). */
  verifyWebhook(req: WebhookRequest): boolean
  /**
   * Transforma a notificação em evento. No Mercado Pago o corpo NÃO é confiável:
   * o pagamento/assinatura é buscado na API pelo id, com o token da conta.
   * Devolve null para notificações que não interessam.
   */
  resolveWebhook(req: WebhookRequest): Promise<BillingEvent | null>
}
