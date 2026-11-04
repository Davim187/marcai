import QRCode from 'qrcode'
import { logger } from '../../../../lib/logger'
import type { WhatsAppConnectResult, WhatsAppProvider } from './provider'

/** Provedor de desenvolvimento: só registra as mensagens no log. Útil sem Evolution/Meta. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'console' as const
  readonly perTenantNumber = true
  static sent: Array<{ tenantId: string; to: string; text: string }> = []

  async sendText(opts: { tenantId: string; to: string; text: string }) {
    ConsoleWhatsAppProvider.sent.push(opts)
    if (ConsoleWhatsAppProvider.sent.length > 200) ConsoleWhatsAppProvider.sent.shift()
    logger.info({ to: opts.to }, `💬 [WhatsApp simulado]\n${opts.text}`)
    return { id: `console-${Date.now()}` }
  }
  async connect(): Promise<WhatsAppConnectResult> {
    return { status: 'connecting', qrCode: await QRCode.toDataURL('marcai-whatsapp-simulado') }
  }
  async status(): Promise<WhatsAppConnectResult> {
    return { status: 'connected', phone: null }
  }
  async disconnect() {}
}
