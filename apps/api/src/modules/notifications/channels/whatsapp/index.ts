import { env } from '../../../../config/env'
import { prisma } from '../../../../lib/prisma'
import { PermanentChannelError, type NotificationChannel, type OutboundMessage } from '../types'
import { ConsoleWhatsAppProvider } from './console'
import { channelEvents } from '../channel-events'
import { EvolutionApiProvider, InstanceGoneError } from './evolution'
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
/** Testes: volta a escolher o provedor pela configuração atual. */
export function resetWhatsappProvider() {
  provider = null
}

export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp' as const
  async send(msg: OutboundMessage) {
    if (!msg.to) throw new PermanentChannelError('Telefone de destino ausente')
    if (!msg.body.trim()) throw new PermanentChannelError('Mensagem vazia')
    const p = whatsappProvider()
    if (p.perTenantNumber && p.name !== 'console') {
      const conn = await prisma.whatsAppConnection.findUnique({ where: { tenantId: msg.tenantId } })
      if (!conn) throw new PermanentChannelError('WhatsApp do estabelecimento não está conectado')
      if (conn.status !== 'connected') {
        // O status salvo pode estar velho (webhook perdido): confere na hora
        const live = await p.status(msg.tenantId)
        if (live.status !== 'connected')
          throw new PermanentChannelError('WhatsApp do estabelecimento não está conectado')
        await setConnectionStatus(msg.tenantId, 'connected')
      }
    }
    try {
      await p.sendText({ tenantId: msg.tenantId, to: msg.to, text: msg.body })
    } catch (err) {
      if (err instanceof InstanceGoneError) await setConnectionStatus(msg.tenantId, 'disconnected')
      throw err
    }
  }
}

/**
 * Atualiza o status da conexão. Quando cai (estava conectado e desconectou), avisa a dona
 * no painel e por e-mail: sem isso, as mensagens param de sair sem ninguém perceber.
 */
export async function setConnectionStatus(
  tenantId: string,
  status: 'connected' | 'connecting' | 'disconnected',
  phone?: string,
) {
  // Atualização condicional: só a chamada que derrubou uma conexão ativa dispara o alerta
  const dropped =
    status === 'disconnected'
      ? await prisma.whatsAppConnection.updateMany({
          where: { tenantId, status: 'connected' },
          data: { status },
        })
      : { count: 0 }
  await prisma.whatsAppConnection.updateMany({
    where: { tenantId, status: { not: status } },
    data: { status, ...(status === 'connected' ? { connectedAt: new Date() } : {}) },
  })
  if (phone) await prisma.whatsAppConnection.updateMany({ where: { tenantId }, data: { phone } })
  if (dropped.count) channelEvents.emit('whatsapp.disconnected', tenantId)
}

export type { WhatsAppProvider }
