import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { hmacSha256Hex, safeEqual } from '../../lib/crypto'
import { forbidden } from '../../lib/errors'
import { registerRawJsonBody } from '../../plugins/raw-json-body'
import { setConnectionStatus } from './channels/whatsapp'

/** Webhooks do WhatsApp. Todos verificam assinatura/segredo antes de processar. */
export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
  registerRawJsonBody(app)

  // ---------- Evolution API ----------
  app.post('/evolution', { schema: { hide: true } }, async (request) => {
    const token = (request.query as { token?: string }).token ?? ''
    if (!env.EVOLUTION_WEBHOOK_SECRET || !safeEqual(token, env.EVOLUTION_WEBHOOK_SECRET))
      throw forbidden('Assinatura inválida')
    const body = z
      .object({ event: z.string(), instance: z.string(), data: z.record(z.unknown()).optional() })
      .passthrough()
      .parse(request.body)
    const tenantId = body.instance.replace(/^marcai-/, '')
    if (body.event.toLowerCase().replace('_', '.') === 'connection.update') {
      const state = String(body.data?.state ?? '')
      const status =
        state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
      const phone = typeof body.data?.wuid === 'string' ? body.data.wuid.split('@')[0] : undefined
      await setConnectionStatus(tenantId, status, phone)
    }
    return { ok: true }
  })

  // ---------- Meta Cloud API ----------
  app.get('/meta', { schema: { hide: true } }, async (request, reply) => {
    const q = request.query as Record<string, string>
    if (
      q['hub.mode'] === 'subscribe' &&
      env.META_WA_VERIFY_TOKEN &&
      safeEqual(q['hub.verify_token'] ?? '', env.META_WA_VERIFY_TOKEN)
    ) {
      return reply.type('text/plain').send(q['hub.challenge'])
    }
    throw forbidden('Token de verificação inválido')
  })

  app.post('/meta', { schema: { hide: true } }, async (request) => {
    const signature = String(request.headers['x-hub-signature-256'] ?? '')
    const expected = `sha256=${hmacSha256Hex(env.META_WA_APP_SECRET ?? '', request.rawBody ?? Buffer.alloc(0))}`
    if (!env.META_WA_APP_SECRET || !safeEqual(signature, expected))
      throw forbidden('Assinatura inválida')
    // Status de entrega (sent/delivered/read/failed) ficam no log para auditoria.
    const statuses = (
      (request.body as { entry?: Array<{ changes?: Array<{ value?: { statuses?: unknown[] } }> }> })
        .entry ?? []
    )
      .flatMap((e) => e.changes ?? [])
      .flatMap((c) => c.value?.statuses ?? [])
    // Só id e status: o telefone da cliente não vai para o log
    if (statuses.length)
      request.log.info(
        {
          statuses: (statuses as Array<{ id?: string; status?: string }>).map((st) => ({
            id: st.id,
            status: st.status,
          })),
        },
        'Status de mensagens da Meta',
      )
    return { ok: true }
  })
}
