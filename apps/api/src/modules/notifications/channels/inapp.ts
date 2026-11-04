import { prisma } from '../../../lib/prisma'
import { sseHub } from './sse-hub'
import type { NotificationChannel, OutboundMessage } from './types'

/** Aviso no painel: grava na tabela `Notification` e avisa em tempo real via SSE. */
export class InAppChannel implements NotificationChannel {
  readonly name = 'inapp' as const
  async send(msg: OutboundMessage) {
    const n = await prisma.notification.create({
      data: {
        tenantId: msg.tenantId,
        userId: msg.userId ?? null,
        type: msg.type ?? 'info',
        title: msg.title,
        body: msg.body,
        link: msg.url,
        bookingId: msg.bookingId,
      },
    })
    sseHub.publish(msg.tenantId, { type: 'notification', notification: n })
  }
}
