import { env } from '../../../../config/env'
import { PermanentChannelError } from '../types'
import type { WhatsAppConnectResult, WhatsAppProvider, WhatsAppStatus } from './provider'
import { bestEffort } from '../../../../lib/best-effort'
import { logger } from '../../../../lib/logger'

/** Evolution API (self-hosted): cada estabelecimento é uma instância conectada por QR Code. */
/** A instância não existe mais na Evolution: é preciso ler o QR Code de novo. */
export class InstanceGoneError extends PermanentChannelError {}

export class EvolutionApiProvider implements WhatsAppProvider {
  readonly name = 'evolution' as const
  readonly perTenantNumber = true

  private instance(tenantId: string) {
    return `marcai-${tenantId}`
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY)
      throw new Error('Evolution API não configurada')
    const res = await fetch(`${env.EVOLUTION_API_URL.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'content-type': 'application/json', apikey: env.EVOLUTION_API_KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (!res.ok) {
      const err = new Error(`Evolution API ${res.status}: ${text.slice(0, 300)}`)
      // Número sem WhatsApp: não adianta repetir
      if (res.status === 400 && /exists"?\s*:\s*false|not.*whatsapp/i.test(text))
        throw new PermanentChannelError(`Esse número não tem WhatsApp (${err.message})`)
      // Instância apagada no servidor da Evolution
      if (res.status === 404) throw new InstanceGoneError(err.message)
      throw err
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  async sendText({ tenantId, to, text }: { tenantId: string; to: string; text: string }) {
    const r = await this.call<{ key?: { id?: string } }>(
      'POST',
      `/message/sendText/${this.instance(tenantId)}`,
      {
        number: to,
        text,
      },
    )
    return { id: r.key?.id }
  }

  private webhookUrl() {
    return `${env.API_URL}/api/webhooks/evolution?token=${encodeURIComponent(env.EVOLUTION_WEBHOOK_SECRET ?? '')}`
  }

  /** Garante o webhook de status mesmo em instâncias criadas antes (ou por outra versão). */
  private async ensureWebhook(instanceName: string) {
    await this.call('POST', `/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: this.webhookUrl(),
        byEvents: false,
        base64: false,
        events: ['CONNECTION_UPDATE'],
      },
    }).catch((err) =>
      logger.warn({ err, instanceName }, 'Falha ao registrar o webhook da Evolution'),
    )
  }

  async connect(tenantId: string): Promise<WhatsAppConnectResult> {
    const instanceName = this.instance(tenantId)
    const webhookUrl = this.webhookUrl()
    try {
      const created = await this.call<{ qrcode?: { base64?: string } }>(
        'POST',
        '/instance/create',
        {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['CONNECTION_UPDATE'],
          },
        },
      )
      if (created.qrcode?.base64) return { status: 'connecting', qrCode: created.qrcode.base64 }
    } catch (err) {
      if (!/already|exists|in use/i.test(String((err as Error).message))) throw err
    }
    await this.ensureWebhook(instanceName)
    const r = await this.call<{ base64?: string }>('GET', `/instance/connect/${instanceName}`)
    return r.base64 ? { status: 'connecting', qrCode: r.base64 } : this.status(tenantId)
  }

  async status(tenantId: string): Promise<WhatsAppConnectResult> {
    try {
      const r = await this.call<{ instance?: { state?: string } }>(
        'GET',
        `/instance/connectionState/${this.instance(tenantId)}`,
      )
      const map: Record<string, WhatsAppStatus> = {
        open: 'connected',
        connecting: 'connecting',
        close: 'disconnected',
      }
      return { status: map[r.instance?.state ?? 'close'] ?? 'disconnected' }
    } catch {
      return { status: 'disconnected' }
    }
  }

  async disconnect(tenantId: string) {
    // Instância já desconectada/apagada não é erro para quem está desconectando
    await bestEffort(
      this.call('DELETE', `/instance/logout/${this.instance(tenantId)}`),
      'sair da Evolution',
      { tenantId },
    )
    await bestEffort(
      this.call('DELETE', `/instance/delete/${this.instance(tenantId)}`),
      'apagar instância da Evolution',
      { tenantId },
    )
  }
}
