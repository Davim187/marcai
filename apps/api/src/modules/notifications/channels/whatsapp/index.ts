import { env } from '../../../../config/env'
import { prisma } from '../../../../lib/prisma'
import { PermanentChannelError, type NotificationChannel, type OutboundMessage } from '../types'
import { ConsoleWhatsAppProvider } from './console'
import { EvolutionApiProvider } from './evolution'
import { MetaCloudApiProvider } from './meta'
import type { WhatsAppProvider } from './provider'

let provider: WhatsAppProvider | null = null
export function whatsappProvider(): WhatsAppProvider {
  if (!provider) {
    provider =
      env.WHATSAPP_PROVIDER === 'evolution'
        ? new EvolutionApiProvider()
        : env.WHATSAPP_PROVIDER === 'meta'
          ? new MetaCloudApiProvider()
          : new ConsoleWhatsAppProvider()
  }
  return provider
}

export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp' as const
  async send(msg: OutboundMessage) {
    if (!msg.to) throw new PermanentChannelError('Telefone de destino ausente')
    const p = whatsappProvider()
    if (p.perTenantNumber && p.name !== 'console') {
      const conn = await prisma.whatsAppConnection.findUnique({ where: { tenantId: msg.tenantId } })
      if (conn?.status !== 'connected')
        throw new PermanentChannelError('WhatsApp do estabelecimento não está conectado')
    }
    await p.sendText({ tenantId: msg.tenantId, to: msg.to, text: msg.body })
  }
}

export type { WhatsAppProvider }
