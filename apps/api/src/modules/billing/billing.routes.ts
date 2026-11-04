import type { FastifyPluginAsync } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { changePlanSchema } from '@marcai/shared'
import { env, isProd } from '../../config/env'
import { audit } from '../../lib/audit'
import { forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { ctx, requireOwner } from '../../plugins/auth'
import {
  billingOverview,
  billingProvider,
  cancelSubscription,
  handleBillingEvent,
  subscribe,
} from './billing.service'

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
        summary: 'Contratar/trocar de plano',
        body: changePlanSchema,
      },
    },
    async (request) => {
      const c = ctx(request)
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: request.auth!.user.id } })
      const sub = await subscribe({
        tenant: { ...c.tenant, subscription: c.subscription },
        owner,
        plan: request.body.plan,
        billingType: request.body.billingType,
        cpfCnpj: request.body.cpfCnpj,
      })
      await audit({
        action: 'subscription.plan_changed',
        tenantId: c.tenantId,
        actorUserId: owner.id,
        metadata: { plan: request.body.plan },
      })
      return sub
    },
  )

  app.post(
    '/change-payment',
    {
      schema: {
        tags: ['assinatura'],
        body: z.object({ billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED']) }),
      },
    },
    async (request) => {
      const c = ctx(request)
      if (!c.subscription?.providerSubscriptionId)
        throw notFound('Você ainda não tem uma assinatura paga')
      await billingProvider().updateSubscription(c.subscription.providerSubscriptionId, {
        billingType: request.body.billingType,
      })
      await prisma.subscription.update({
        where: { id: c.subscription.id },
        data: { billingType: request.body.billingType },
      })
      return { ok: true }
    },
  )

  app.post('/cancel', { schema: { tags: ['assinatura'] } }, async (request) => {
    await cancelSubscription(ctx(request).tenantId, request.auth!.user.id)
    return { ok: true }
  })

  /** Só no provedor simulado: dispara o mesmo fluxo do webhook de pagamento confirmado. */
  app.post(
    '/fake/pay/:invoiceId',
    { schema: { tags: ['assinatura'], hide: true, params: z.object({ invoiceId: z.string() }) } },
    async (request) => {
      if (billingProvider().name !== 'fake' || isProd)
        throw forbidden('Disponível só no modo de testes')
      const c = ctx(request)
      const inv = await c.db.invoice.findFirst({ where: { id: request.params.invoiceId } })
      if (!inv || !c.subscription) throw notFound('Fatura não encontrada')
      return handleBillingEvent(
        {
          eventId: `fake:${inv.id}:paid`,
          rawType: 'PAYMENT_CONFIRMED',
          type: 'payment_confirmed',
          subscriptionId: c.subscription.providerSubscriptionId,
          payment: {
            id: inv.providerPaymentId,
            subscriptionId: c.subscription.providerSubscriptionId,
            value: inv.amountCents / 100,
            status: 'paid',
            dueDate: inv.dueDate.toISOString().slice(0, 10),
            paymentDate: new Date().toISOString().slice(0, 10),
            invoiceUrl: null,
            billingType: inv.billingType,
            externalReference: c.tenantId,
          },
        },
        'fake',
      )
    },
  )
}

/** Webhook de pagamentos (Asaas): valida o token antes de qualquer coisa e é idempotente. */
export const billingWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer
    try {
      done(null, (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf8')) : {})
    } catch (err) {
      done(err as Error, undefined)
    }
  })
  app.post('/asaas', { schema: { hide: true } }, async (request) => {
    const p = billingProvider()
    if (!p.verifyWebhook(request.headers, request.rawBody ?? Buffer.alloc(0)))
      throw forbidden('Token do webhook inválido')
    const evt = p.parseWebhook(request.body)
    request.log.info({ event: evt.rawType, eventId: evt.eventId }, 'Webhook de cobrança recebido')
    return handleBillingEvent(evt, p.name)
  })
}
