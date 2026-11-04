import { env, isProd } from '../../config/env'
import { randomToken, safeEqual } from '../../lib/crypto'
import {
  billingEventSchema,
  type BillingEvent,
  type BillingProvider,
  type ProviderPayment,
} from './provider'

/**
 * Provedor de cobrança simulado para desenvolvimento e testes. As faturas são criadas
 * pela própria aplicação; o botão "Simular pagamento" dispara o mesmo fluxo do webhook.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly name = 'fake' as const
  async createCustomer() {
    return { id: `cus_fake_${randomToken(6)}` }
  }
  async createSubscription() {
    return { id: `sub_fake_${randomToken(6)}` }
  }
  async updateSubscription() {}
  async cancelSubscription() {}
  async listPayments(): Promise<ProviderPayment[]> {
    return []
  }
  /** Sem token padrão: só aceita se ASAAS_WEBHOOK_TOKEN estiver definido, e nunca em produção. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>) {
    if (isProd || !env.ASAAS_WEBHOOK_TOKEN) return false
    return safeEqual(String(headers['asaas-access-token'] ?? ''), env.ASAAS_WEBHOOK_TOKEN)
  }
  parseWebhook(body: unknown): BillingEvent {
    return billingEventSchema.parse(body)
  }
}
