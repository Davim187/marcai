import { env } from '../../../../config/env'
import { PermanentChannelError } from '../types'
import type { WhatsAppConnectResult, WhatsAppProvider } from './provider'

/**
 * WhatsApp Cloud API (oficial da Meta). As mensagens saem do número oficial da plataforma
 * usando um template aprovado com uma variável no corpo ({{1}}), que recebe o texto final.
 * Templates não aceitam quebras de linha nos parâmetros, então elas viram " · ".
 */
export class MetaCloudApiProvider implements WhatsAppProvider {
  readonly name = 'meta' as const
  readonly perTenantNumber = false

  async sendText({ to, text }: { tenantId: string; to: string; text: string }) {
    if (!env.META_WA_TOKEN || !env.META_WA_PHONE_NUMBER_ID)
      throw new Error('Meta Cloud API não configurada')
    const flat = text
      .replace(/\n{2,}/g, ' · ')
      .replace(/\n/g, ' · ')
      .replace(/\s{4,}/g, '   ')
      .slice(0, 1000)
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${env.META_WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.META_WA_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: env.META_WA_TEMPLATE_NAME,
            language: { code: env.META_WA_TEMPLATE_LANG },
            components: [{ type: 'body', parameters: [{ type: 'text', text: flat }] }],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>
      error?: { message: string; code: number }
    }
    if (!res.ok) {
      const msg = `Meta Cloud API ${res.status}: ${data.error?.message ?? 'erro'}`
      // 131026 = destinatário sem WhatsApp; 100 = parâmetro inválido
      if (data.error && [131026, 100, 132001].includes(data.error.code))
        throw new PermanentChannelError(msg)
      throw new Error(msg)
    }
    return { id: data.messages?.[0]?.id }
  }

  async connect(): Promise<WhatsAppConnectResult> {
    return this.status()
  }
  async status(): Promise<WhatsAppConnectResult> {
    return {
      status: env.META_WA_TOKEN && env.META_WA_PHONE_NUMBER_ID ? 'connected' : 'disconnected',
      phone: null,
    }
  }
  async disconnect() {}
}
