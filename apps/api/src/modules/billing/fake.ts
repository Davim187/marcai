import { env } from '../../config/env'
import { randomToken, safeEqual } from '../../lib/crypto'
import type { BillingEvent, BillingProvider, ProviderPayment } from './provider'

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
  verifyWebhook(headers: Record<string, string | string[] | undefined>) {
    return safeEqual(
      String(headers['asaas-access-token'] ?? ''),
      env.ASAAS_WEBHOOK_TOKEN ?? 'fake-token',
    )
  }
  parseWebhook(body: unknown): BillingEvent {
    return body as BillingEvent
  }
}
