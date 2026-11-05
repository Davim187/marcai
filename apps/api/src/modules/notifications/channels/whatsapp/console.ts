import QRCode from 'qrcode'
import { isProd } from '../../../../config/env'
import { logger } from '../../../../lib/logger'
import { PermanentChannelError } from '../types'
import type { WhatsAppConnectResult, WhatsAppProvider } from './provider'

/** Provedor de desenvolvimento: só registra as mensagens no log. Útil sem Evolution/Meta. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'console' as const
  readonly perTenantNumber = true
  static sent: Array<{ tenantId: string; to: string; text: string }> = []

  async sendText(opts: { tenantId: string; to: string; text: string }) {
    // Em produção o modo simulado não "finge" envio nem grava telefone e links no log:
    // a mensagem falha de vez e o aviso cai para o e-mail.
    if (isProd) throw new PermanentChannelError('WhatsApp não configurado no servidor')
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
