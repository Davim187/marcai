import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { channelEvents } from './channels/channel-events'
import { channels } from './channels/registry'
import { enqueue } from './queue'

/** Donas do estabelecimento (com e-mail). Único lugar com a regra "quem é dona". */
export function findOwners(tenantId: string) {
  return prisma.tenantMember.findMany({
    where: { tenantId, role: 'owner' },
    include: { user: { select: { id: true, email: true } } },
  })
}

/**
 * Avisa as donas no painel (sino) e por e-mail, pela fila (com repetição em caso de falha).
 * `dedupe` evita avisos repetidos do mesmo acontecimento.
 */
export async function notifyOwners(opts: {
  tenantId: string
  kind: string
  title: string
  body: string
  /** Caminho no painel, ex.: /painel/assinatura */
  path: string
  dedupe?: string
  inApp?: boolean
}) {
  try {
    if (opts.inApp !== false) {
      await channels.inapp.send({
        tenantId: opts.tenantId,
        title: opts.title,
        body: opts.body,
        url: opts.path,
        type: opts.kind,
      })
    }
    for (const owner of await findOwners(opts.tenantId)) {
      await enqueue({
        channel: 'email',
        kind: opts.kind,
        dedupeKey: opts.dedupe ? `${opts.kind}:${opts.dedupe}:${owner.userId}` : undefined,
        message: {
          tenantId: opts.tenantId,
          to: owner.user.email,
          title: opts.title,
          body: opts.body,
          url: `${env.APP_URL}${opts.path}`,
        },
      })
    }
  } catch (err) {
    logger.error({ err, tenantId: opts.tenantId, kind: opts.kind }, 'Falha ao avisar as donas')
  }
}

channelEvents.on('whatsapp.disconnected', (tenantId) => {
  void notifyOwners({
    tenantId,
    kind: 'whatsapp_disconnected',
    title: 'Seu WhatsApp desconectou',
    body: 'As mensagens de WhatsApp pararam de sair. No painel, abra Notificações e leia o QR Code de novo.',
    path: '/painel/notificacoes',
  })
})
