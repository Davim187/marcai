import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { ChannelName, OutboundMessage } from './channels/types'

export interface EnqueueOptions {
  channel: ChannelName
  kind: string
  message: OutboundMessage & Record<string, unknown>
  runAt?: Date
  bookingId?: string
  dedupeKey?: string
  maxAttempts?: number
}

/**
 * Coloca um envio na fila (tabela NotificationJob). O worker processa com retry e backoff,
 * então uma falha no WhatsApp nunca quebra o agendamento.
 */
export async function enqueue(opts: EnqueueOptions) {
  try {
    return await prisma.notificationJob.create({
      data: {
        tenantId: opts.message.tenantId,
        channel: opts.channel,
        kind: opts.kind,
        payload: opts.message as unknown as Prisma.InputJsonValue,
        runAt: opts.runAt ?? new Date(),
        bookingId: opts.bookingId,
        dedupeKey: opts.dedupeKey,
        maxAttempts: opts.maxAttempts ?? 5,
      },
    })
  } catch (err) {
    // dedupeKey repetida = já agendado; ignora
    if ((err as { code?: string }).code === 'P2002') return null
    throw err
  }
}

/** Cancela envios futuros de um agendamento (ex.: lembrete ao remarcar/cancelar). */
export async function cancelJobs(bookingId: string, kinds: string[]) {
  await prisma.notificationJob.updateMany({
    where: { bookingId, kind: { in: kinds }, status: 'pending' },
    data: { status: 'canceled', dedupeKey: null },
  })
}
