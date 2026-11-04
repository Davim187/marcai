import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../src/config/env'
import { prisma } from '../src/lib/prisma'
import { createOwner, getApp } from './helpers'

const day = 86_400_000

afterEach(() => {
  env.APP_MODE = 'saas'
})

describe('assinatura e cobrança', () => {
  it('cadastro começa com 30 dias grátis, sem cartão', async () => {
    const { tenant } = await createOwner()
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('trial')
    expect(Math.round((sub.trialEndsAt!.getTime() - Date.now()) / day)).toBe(30)
  })

  it('contrata o Pro, recebe o webhook de pagamento e fica ativa (idempotente)', async () => {
    const { agent, tenant } = await createOwner()
    const res = await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    expect(res.statusCode).toBe(200)
    const overview = (await agent.get('/api/billing')).json()
    const invoice = overview.invoices[0]
    expect(invoice.amountCents).toBe(9900)
    expect(invoice.status).toBe('pending')
    // Simula o webhook (mesmo fluxo do Asaas) duas vezes: só aplica uma.
    await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    const again = await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    expect(again.json().duplicated).toBe(true)
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 25 * day)
  })

  it('webhook do Asaas exige o token e trata vencimento → past_due', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'essencial', billingType: 'BOLETO' })
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    const app = await getApp()
    const payload = {
      eventId: 'evt_1',
      rawType: 'PAYMENT_OVERDUE',
      type: 'payment_overdue',
      subscriptionId: sub.providerSubscriptionId,
      payment: {
        id: 'pay_x',
        subscriptionId: sub.providerSubscriptionId,
        value: 69,
        status: 'overdue',
        dueDate: '2030-01-01',
        paymentDate: null,
        invoiceUrl: null,
        billingType: 'BOLETO',
        externalReference: tenant.id,
      },
    }
    const noToken = await app.inject({ method: 'POST', url: '/api/webhooks/asaas', payload })
    expect(noToken.statusCode).toBe(403)
    const ok = await app.inject({
      method: 'POST',
      url: '/api/webhooks/asaas',
      headers: { 'asaas-access-token': 'test-asaas-token' },
      payload,
    })
    expect(ok.statusCode).toBe(200)
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('past_due')
  })

  it('vencida há mais de 7 dias: página pública indisponível e painel somente leitura', async () => {
    const { agent, tenant, slug } = await createOwner()
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        status: 'past_due',
        plan: 'pro',
        currentPeriodEnd: new Date(Date.now() - 8 * day),
        trialEndsAt: new Date(Date.now() - 40 * day),
      },
    })
    const app = await getApp()
    const pub = (await app.inject({ method: 'GET', url: `/api/public/t/${slug}` })).json()
    expect(pub.available).toBe(false)
    expect(pub.services).toEqual([])
    const me = (await agent.get('/api/auth/me')).json()
    expect(me.tenant.access).toBe('blocked')
    // Leitura funciona, escrita é bloqueada (exceto a própria assinatura)
    expect((await agent.get('/api/services')).statusCode).toBe(200)
    const write = await agent.post('/api/services', {
      name: 'Nova',
      durationMinutes: 30,
      priceCents: 1000,
    })
    expect(write.statusCode).toBe(402)
    expect(write.json().error).toBe('SOMENTE_LEITURA')
    expect(
      (await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })).statusCode,
    ).toBe(200)
  })

  it('vencida há menos de 7 dias: período de carência, tudo funciona', async () => {
    const { agent, tenant } = await createOwner()
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { status: 'past_due', currentPeriodEnd: new Date(Date.now() - 3 * day) },
    })
    expect((await agent.get('/api/auth/me')).json().tenant.access).toBe('grace')
    expect(
      (await agent.post('/api/services', { name: 'Nova', durationMinutes: 30, priceCents: 1000 }))
        .statusCode,
    ).toBe(201)
  })

  it('modo exclusivo: todos os recursos Pro liberados, sem cobrança e sem cadastro público', async () => {
    const { agent, tenant, slug } = await createOwner()
    await prisma.subscription.delete({ where: { tenantId: tenant.id } })
    env.APP_MODE = 'single_tenant'
    env.SINGLE_TENANT_SLUG = slug
    const me = (await agent.get('/api/auth/me')).json()
    expect(me.tenant.access).toBe('full')
    expect(me.tenant.features).toContain('whatsapp_customer')
    expect((await agent.get('/api/billing')).statusCode).toBe(404)
    const app = await getApp()
    const cfg = (await app.inject({ method: 'GET', url: '/api/public/config' })).json()
    expect(cfg.brand.name).toBe('Studio Teste')
    expect(cfg.appName).toBe('Studio Teste')
    const root = (await app.inject({ method: 'GET', url: '/api/public/t/_' })).json()
    expect(root.slug).toBe(slug)
    expect(root.whiteLabel).toBe(true)
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Xavier', email: 'x@x.com', password: 'senha12345', acceptTerms: true },
    })
    expect(reg.statusCode).toBe(403)
  })
})
