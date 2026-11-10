import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { mercadoPagoConnectSchema } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { encryptSecret } from '../../lib/crypto'
import { badRequest, notFound } from '../../lib/errors'
import { idParam } from '../../lib/route-schemas'
import { prisma } from '../../lib/prisma'
import { storage } from '../../lib/storage'
import { ctx, requireOwner, requireTenant } from '../../plugins/auth'
import { notificationDataId } from '../billing/mercadopago'
import { scopeWhere } from '../booking/panel.routes'
import { readImageUpload } from '../uploads/upload.routes'
import { deletePrivateFiles } from '../uploads/private-cleanup'
import {
  approvePrepayment,
  attachProof,
  handleTenantMpWebhook,
  publicPaymentView,
  rejectPrepayment,
  syncMpPayment,
  verifyMpToken,
} from './prepayment.service'

const tokenParam = z.object({ token: z.string().min(10).max(64) })

async function loadByToken(token: string) {
  const b = await prisma.booking.findUnique({
    where: { cancelToken: token },
    include: { tenant: true, payment: true },
  })
  if (!b || b.tenant.deletedAt) throw notFound('Agendamento não encontrado. Confira o link.')
  return b
}

/** Cliente final (link do agendamento): pagar, enviar comprovante, conferir pagamento. */
export const prepaymentPublicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/:token/payment/proof',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['cliente final'],
        summary: 'Envia o comprovante do PIX do sinal',
        params: tokenParam,
      },
    },
    async (request) => {
      const b = await loadByToken(request.params.token)
      if (b.status !== 'pending') throw badRequest('Esse agendamento não está esperando pagamento.')
      const { buffer, ext } = await readImageUpload(request)
      // Mesma pasta privada das fotos de referência: só a equipe do estabelecimento abre
      const url = await storage.savePrivate(`${b.tenantId}-ref`, buffer, ext).catch(() => {
        throw badRequest('Não conseguimos ler essa imagem. Tente outra foto.', 'ARQUIVO_INVALIDO')
      })
      try {
        const { previousProofUrl } = await attachProof(b.tenant, b.id, url)
        if (previousProofUrl) await deletePrivateFiles([previousProofUrl])
      } catch (err) {
        await deletePrivateFiles([url])
        throw err
      }
      const fresh = await prisma.bookingPayment.findUnique({ where: { bookingId: b.id } })
      return { payment: await publicPaymentView(b.tenant, b, fresh) }
    },
  )

  app.post(
    '/:token/payment/sync',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        tags: ['cliente final'],
        summary: 'Confere no Mercado Pago se o sinal já foi pago',
        params: tokenParam,
      },
    },
    async (request) => {
      const b = await loadByToken(request.params.token)
      if (b.payment?.status === 'awaiting_payment') await syncMpPayment(b.tenant, b.payment)
      const fresh = await loadByToken(request.params.token)
      return {
        status: fresh.status,
        payment: await publicPaymentView(fresh.tenant, fresh, fresh.payment),
      }
    },
  )
}

/** Painel: conferir o comprovante e aprovar ou recusar o sinal. */
export const prepaymentPanelRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireTenant)

  async function findBooking(request: Parameters<typeof ctx>[0], id: string) {
    const c = ctx(request)
    const b = await c.db.booking.findFirst({ where: { id, ...scopeWhere(c) } })
    if (!b) throw notFound('Agendamento não encontrado')
    return { c, b }
  }

  app.post(
    '/:id/payment/approve',
    { schema: { tags: ['agendamentos'], summary: 'Aprova o sinal (PIX)', params: idParam } },
    async (request) => {
      const { c, b } = await findBooking(request, request.params.id)
      await approvePrepayment(c.tenantId, b.id)
      return { ok: true }
    },
  )

  app.post(
    '/:id/payment/reject',
    {
      schema: {
        tags: ['agendamentos'],
        summary: 'Recusa o sinal e libera o horário',
        params: idParam,
        body: z.object({ reason: z.string().trim().min(3, 'Diga o motivo').max(300) }),
      },
    },
    async (request) => {
      const { c, b } = await findBooking(request, request.params.id)
      await rejectPrepayment(c.tenantId, b.id, request.body.reason)
      return { ok: true }
    },
  )
}

/** Conta do Mercado Pago do estabelecimento (recebe o sinal direto). */
export const mercadoPagoAccountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.put(
    '/mercadopago',
    {
      onRequest: requireOwner,
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['tenant'],
        summary: 'Conecta o Mercado Pago do estabelecimento (Access Token)',
        body: mercadoPagoConnectSchema,
      },
    },
    async (request) => {
      const { tenantId } = ctx(request)
      const { label } = await verifyMpToken(request.body.accessToken)
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          mpAccessTokenEnc: encryptSecret(request.body.accessToken),
          mpAccountLabel: label,
          mpConnectedAt: new Date(),
        },
      })
      await audit({
        action: 'tenant.mercadopago_connected',
        tenantId,
        actorUserId: request.auth!.user.id,
        metadata: { label, test: request.body.accessToken.startsWith('TEST-') },
      })
      return { connected: true, label }
    },
  )

  app.delete(
    '/mercadopago',
    { onRequest: requireOwner, schema: { tags: ['tenant'], summary: 'Desconecta o Mercado Pago' } },
    async (request) => {
      const { tenant, tenantId } = ctx(request)
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          mpAccessTokenEnc: null,
          mpAccountLabel: null,
          mpConnectedAt: null,
          // Sem conta, o sinal pelo Mercado Pago não funciona: desliga em vez de travar a agenda
          ...(tenant.prepaymentMethod === 'mercadopago' ? { requirePrepayment: false } : {}),
        },
      })
      await audit({
        action: 'tenant.mercadopago_disconnected',
        tenantId,
        actorUserId: request.auth!.user.id,
      })
      return { connected: false }
    },
  )
}

/**
 * Webhook do Mercado Pago na conta do estabelecimento. A notificação é assinada com o segredo
 * da aplicação DA DONA (que não temos), então o corpo é ignorado: o pagamento é sempre buscado
 * na API com o token do próprio estabelecimento e precisa ser um sinal dele.
 */
export const prepaymentWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/mercadopago/sinal/:tenantId',
    { schema: { hide: true }, config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const query = request.query as Record<string, unknown>
      const type = String(
        query.type ?? query.topic ?? (request.body as { type?: string })?.type ?? '',
      )
      const dataId = notificationDataId({
        headers: request.headers,
        query,
        body: request.body,
        rawBody: Buffer.alloc(0),
      })
      if (type !== 'payment' || !dataId || !/^[\w-]{1,40}$/.test(tenantId))
        return reply.status(200).send({ ignored: true })
      await handleTenantMpWebhook(tenantId, dataId)
      return reply.status(200).send({ ok: true })
    },
  )
}
