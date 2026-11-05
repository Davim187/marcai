import { env, isProd } from '../../config/env'
import { randomToken, safeEqual } from '../../lib/crypto'
import {
  billingEventSchema,
  type BillingEvent,
  type BillingProvider,
  type WebhookRequest,
} from './provider'

/**
 * Provedor simulado (desenvolvimento e testes). O checkout leva para a própria tela de
 * assinatura com o botão "Simular pagamento", que dispara o mesmo fluxo do webhook.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly name = 'fake' as const
  async createCheckout(input: { invoiceId: string }) {
    return {
      checkoutId: `pref_fake_${randomToken(6)}`,
      checkoutUrl: `${env.APP_URL}/painel/assinatura?simular=${input.invoiceId}`,
    }
  }
  async createCardSubscription() {
    return {
      id: `preapproval_fake_${randomToken(6)}`,
      checkoutUrl: `${env.APP_URL}/painel/assinatura?cartao=ok`,
    }
  }
  async expireCheckout() {}
  async updateCardSubscriptionAmount() {}
  async cancelCardSubscription() {}
  /** Só aceita com MP_WEBHOOK_SECRET definido e nunca em produção. */
  verifyWebhook(req: WebhookRequest) {
    if (isProd || !env.MP_WEBHOOK_SECRET) return false
    return safeEqual(String(req.headers['x-fake-signature'] ?? ''), env.MP_WEBHOOK_SECRET)
  }
  async resolveWebhook(req: WebhookRequest): Promise<BillingEvent | null> {
    return billingEventSchema.parse(req.body)
  }
}
