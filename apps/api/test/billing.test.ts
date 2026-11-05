import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../src/config/env'
import { prisma } from '../src/lib/prisma'
import { runBillingTick } from '../src/modules/billing/billing.tick'
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
    // Simula o webhook (mesmo fluxo do Mercado Pago) duas vezes: só aplica uma.
    await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    const again = await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    expect(again.json().duplicated).toBe(true)
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 25 * day)
  })

  it('webhook exige assinatura; pagamento menor que a fatura é ignorado', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'essencial', billingType: 'BOLETO' })
    const invoice = (await agent.get('/api/billing')).json().invoices[0]
    expect(invoice.amountCents).toBe(6900)
    expect(invoice.billingType).toBe('BOLETO')
    const app = await getApp()
    const payload = (amountCents: number, id: string) => ({
      eventId: id,
      type: 'payment_confirmed',
      invoiceId: invoice.id,
      providerPaymentId: id,
      amountCents,
    })
    const noSig = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago',
      payload: payload(6900, 'a'),
    })
    expect(noSig.statusCode).toBe(403)
    const cheap = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago',
      headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
      payload: payload(1, 'b'),
    })
    expect(cheap.json()).toEqual({ ignored: true })
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('trial')
    const ok = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago',
      headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
      payload: payload(6900, 'c'),
    })
    expect(ok.json()).toEqual({ ok: true })
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    // Pago durante o teste: o período começa a contar depois do fim do teste
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(sub.trialEndsAt!.getTime() + 27 * day)
  })

  it('link de pagamento da fatura é gerado sob demanda e reaproveitado', async () => {
    const { agent } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const invoice = (await agent.get('/api/billing')).json().invoices[0]
    const first = (await agent.post(`/api/billing/invoices/${invoice.id}/checkout`)).json()
    expect(first.checkoutUrl).toContain(`simular=${invoice.id}`)
    const second = (await agent.post(`/api/billing/invoices/${invoice.id}/checkout`)).json()
    expect(second.checkoutUrl).toBe(first.checkoutUrl)
    // Fatura de outro salão não é acessível
    const other = await createOwner()
    expect(
      (await other.agent.post(`/api/billing/invoices/${invoice.id}/checkout`)).statusCode,
    ).toBe(404)
    // Paga: não gera mais link
    await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    expect((await agent.post(`/api/billing/invoices/${invoice.id}/checkout`)).statusCode).toBe(400)
  })

  it('trocar de plano atualiza a fatura em aberto (sem duplicar)', async () => {
    const { agent } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    await agent.post('/api/billing/subscribe', { plan: 'essencial', billingType: 'BOLETO' })
    const { invoices, subscription } = (await agent.get('/api/billing')).json()
    expect(invoices).toHaveLength(1)
    expect(invoices[0].amountCents).toBe(6900)
    expect(invoices[0].billingType).toBe('BOLETO')
    expect(subscription.plan).toBe('essencial')
  })

  it('cartão: cria assinatura automática, autoriza e cada cobrança estende o período', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const res = (
      await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    ).json()
    expect(res.checkoutUrl).toBeTruthy()
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.providerSubscriptionId).toMatch(/^preapproval_fake_/)
    // Enquanto o cartão não é autorizado, a fatura PIX continua valendo
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id, status: 'pending' } })).toBe(
      1,
    )
    expect((await agent.get('/api/billing')).json().cardCheckoutUrl).toBe(res.checkoutUrl)

    const app = await getApp()
    const send = (payload: object) =>
      app.inject({
        method: 'POST',
        url: '/api/webhooks/mercadopago',
        headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
        payload,
      })
    await send({
      eventId: 'pre:1:authorized',
      type: 'subscription_authorized',
      providerSubscriptionId: sub.providerSubscriptionId,
    })
    expect((await agent.get('/api/billing')).json().cardCheckoutUrl).toBeNull()
    // Cartão autorizado: agora sim a fatura avulsa deixa de valer
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id, status: 'pending' } })).toBe(
      0,
    )
    await send({
      eventId: 'ap:1:approved',
      type: 'payment_confirmed',
      providerSubscriptionId: sub.providerSubscriptionId,
      providerPaymentId: 'mp_1',
      amountCents: 9900,
    })
    sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    const firstEnd = sub.currentPeriodEnd!.getTime()
    await send({
      eventId: 'ap:2:approved',
      type: 'payment_confirmed',
      providerSubscriptionId: sub.providerSubscriptionId,
      providerPaymentId: 'mp_2',
      amountCents: 9900,
    })
    sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(firstEnd + 27 * day)
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id, status: 'paid' } })).toBe(2)

    // Cancelada no Mercado Pago
    await send({
      eventId: 'pre:1:cancelled',
      type: 'subscription_canceled',
      providerSubscriptionId: sub.providerSubscriptionId,
    })
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('canceled')
  })

  it('rotina gera a fatura PIX perto do vencimento, uma vez só, e marca atraso', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const invoice = (await agent.get('/api/billing')).json().invoices[0]
    await agent.post(`/api/billing/fake/pay/${invoice.id}`)
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    // Longe do vencimento: nada novo
    await runBillingTick()
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id } })).toBe(1)
    // 3 dias antes do fim do período: gera a próxima
    const near = new Date(sub.currentPeriodEnd!.getTime() - 3 * day)
    await runBillingTick(near)
    await runBillingTick(near)
    const open = await prisma.invoice.findMany({
      where: { tenantId: tenant.id, status: 'pending' },
    })
    expect(open).toHaveLength(1)
    expect(open[0]!.dueDate.toISOString().slice(0, 10)).toBe(
      sub.currentPeriodEnd!.toISOString().slice(0, 10),
    )
    // Passou do vencimento sem pagar: fatura vencida e assinatura em atraso
    await runBillingTick(new Date(sub.currentPeriodEnd!.getTime() + 2 * day))
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: open[0]!.id } })).status).toBe(
      'overdue',
    )
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('past_due')
  })

  it('cancelar encerra a assinatura e as faturas em aberto', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    expect((await agent.post('/api/billing/cancel')).statusCode).toBe(200)
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('canceled')
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id, status: 'pending' } })).toBe(
      0,
    )
    // Reativar durante o teste mantém os dias de teste que sobraram
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('trial')
    // Sem teste nem período pago: reativar exige pagamento
    await agent.post('/api/billing/cancel')
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { trialEndsAt: new Date(Date.now() - day) },
    })
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
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
