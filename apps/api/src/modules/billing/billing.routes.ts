import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { changePlanSchema } from '@marcai/shared'
import { env, isProd } from '../../config/env'
import { audit } from '../../lib/audit'
import { forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { ctx, requireOwner } from '../../plugins/auth'
import { registerRawJsonBody } from '../../plugins/raw-json-body'
import {
  billingOverview,
  billingProvider,
  cancelSubscription,
  handleBillingEvent,
  invoiceCheckout,
  payOnce,
  subscribe,
} from './billing.service'

/**
 * O "Simular pagamento" só existe com o provedor fake, fora de produção e com a API em
 * localhost (ou liberado explicitamente): um deploy sem NODE_ENV não vira cobrança grátis.
 */
function fakeBillingAllowed() {
  if (billingProvider().name !== 'fake' || isProd) return false
  return env.ALLOW_FAKE_BILLING || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.API_URL)
}

export const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', async (request) => {
    if (env.APP_MODE === 'single_tenant') throw notFound('Cobrança desativada no modo exclusivo')
    await requireOwner(request)
  })

  app.get(
    '/',
    { schema: { tags: ['assinatura'], summary: 'Plano, status e faturas' } },
    async (request) => billingOverview(ctx(request).tenantId),
  )

  app.post(
    '/subscribe',
    {
      schema: {
        tags: ['assinatura'],
        summary: 'Contratar/trocar de plano ou forma de pagamento',
        body: changePlanSchema,
      },
    },
    async (request) => {
      const c = ctx(request)
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: request.auth!.user.id } })
      const result = await subscribe({
        tenant: { ...c.tenant, subscription: c.subscription },
        owner,
        plan: request.body.plan,
        billingType: request.body.billingType,
        newCard: request.body.newCard,
      })
      await audit({
        action: 'subscription.plan_changed',
        tenantId: c.tenantId,
        actorUserId: owner.id,
        metadata: { plan: request.body.plan, billingType: request.body.billingType },
      })
      return result
    },
  )

  /** Gera (ou reaproveita) o link do Mercado Pago para pagar a fatura. */
  app.post(
    '/invoices/:id/checkout',
    { schema: { tags: ['assinatura'], params: z.object({ id: z.string().max(40) }) } },
    async (request) => {
      const c = ctx(request)
      return invoiceCheckout(c.tenantId, request.params.id, request.auth!.user.email)
    },
  )

  /** Paga este mês por PIX/boleto sem desligar o cartão (ex.: cartão recusado). */
  app.post(
    '/pay-once',
    {
      schema: {
        tags: ['assinatura'],
        body: z.object({ billingType: z.enum(['PIX', 'BOLETO']).default('PIX') }),
      },
    },
    async (request) => payOnce(ctx(request).tenantId, request.body.billingType),
  )

  app.post('/cancel', { schema: { tags: ['assinatura'] } }, async (request) => {
    await cancelSubscription(ctx(request).tenantId, request.auth!.user.id)
    return { ok: true }
  })

  /** Só no provedor simulado: dispara o mesmo fluxo do webhook de pagamento confirmado. */
  app.post(
    '/fake/pay/:invoiceId',
    {
      schema: {
        tags: ['assinatura'],
        hide: true,
        params: z.object({ invoiceId: z.string().max(40) }),
      },
    },
    async (request) => {
      if (!fakeBillingAllowed()) throw forbidden('Disponível só no modo de testes')
      const c = ctx(request)
      const inv = await c.db.invoice.findFirst({ where: { id: request.params.invoiceId } })
      if (!inv) throw notFound('Fatura não encontrada')
      return handleBillingEvent(
        {
          eventId: `fake:${inv.id}:paid`,
          type: 'payment_confirmed',
          invoiceId: inv.id,
          providerPaymentId: `pay_fake_${inv.id}`,
          amountCents: inv.amountCents,
          paidAt: new Date().toISOString(),
          paymentMethod: inv.billingType === 'BOLETO' ? 'ticket' : 'bank_transfer',
        },
        'fake',
      )
    },
  )
}

/**
 * Webhook do Mercado Pago: confere a assinatura (x-signature), busca o recurso na API
 * (o corpo da notificação nunca é confiável) e aplica o evento de forma idempotente.
 */
export const billingWebhookRoutes: FastifyPluginAsync = async (app) => {
  registerRawJsonBody(app)
  app.post('/mercadopago', { schema: { hide: true } }, async (request, reply) => {
    const p = billingProvider()
    const req = {
      headers: request.headers,
      query: request.query as Record<string, unknown>,
      body: request.body,
      rawBody: request.rawBody ?? Buffer.alloc(0),
    }
    if (p.shouldIgnore?.(req)) return reply.status(200).send({ ignored: true })
    if (!p.verifyWebhook(req)) throw forbidden('Assinatura do webhook inválida')
    const evt = await p.resolveWebhook(req)
    if (!evt) return reply.status(200).send({ ignored: true })
    request.log.info({ type: evt.type, eventId: evt.eventId }, 'Webhook de cobrança recebido')
    return handleBillingEvent(evt, p.name)
  })
}
