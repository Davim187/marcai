import { isTrustedPushEndpoint } from '@marcai/shared'
import webpush from 'web-push'
import { env } from '../../../config/env'
import { logger } from '../../../lib/logger'
import { prisma } from '../../../lib/prisma'
import type { NotificationChannel, OutboundMessage } from './types'

export const pushEnabled = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
let configured = false

/** Web Push (VAPID): chega no celular mesmo com o app fechado. `to` = userId (ou todos do tenant). */
export class WebPushChannel implements NotificationChannel {
  readonly name = 'push' as const
  async send(msg: OutboundMessage) {
    if (!pushEnabled()) {
      logger.info(
        { title: msg.title },
        '🔔 [push simulado: configure VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY]',
      )
      return
    }
    if (!configured) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
      configured = true
    }
    const subs = (
      await prisma.pushSubscription.findMany({
        where: { tenantId: msg.tenantId, ...(msg.to ? { userId: msg.to } : {}) },
      })
    ).filter((s) => isTrustedPushEndpoint(s.endpoint))
    const payload = JSON.stringify({
      title: msg.title,
      body: msg.body,
      url: msg.url ?? '/painel',
      tag: msg.url,
    })
    const errors: string[] = []
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 3600 },
          )
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          // Inscrição expirada/removida: apaga para não tentar de novo
          if (status === 404 || status === 410)
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined)
          else errors.push(String((err as Error).message))
        }
      }),
    )
    if (errors.length && errors.length === subs.length)
      throw new Error(`Falha no push: ${errors[0]}`)
  }
}
