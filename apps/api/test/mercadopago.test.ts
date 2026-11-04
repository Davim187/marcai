import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/config/env'
import { prisma } from '../src/lib/prisma'
import { resetBillingProvider } from '../src/modules/billing/billing.service'
import { MercadoPagoBillingProvider } from '../src/modules/billing/mercadopago'
import { createOwner, getApp } from './helpers'

const SECRET = 'segredo-do-webhook-mp-123'

function sign(dataId: string, requestId: string, ts = Date.now()) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  return `ts=${ts},v1=${createHmac('sha256', SECRET).update(manifest).digest('hex')}`
}

type Handler = (url: string, init: RequestInit) => unknown
function mockMp(handler: Handler) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
    })
    const data = handler(url, init)
    return new Response(JSON.stringify(data ?? {}), { status: data === undefined ? 404 : 200 })
  })
  return calls
}

const saved = { ...env }
beforeEach(() => {
  env.BILLING_PROVIDER = 'mercadopago'
  env.MP_ACCESS_TOKEN = 'TEST-token'
  env.MP_WEBHOOK_SECRET = SECRET
  resetBillingProvider()
})
afterEach(() => {
  Object.assign(env, saved)
  resetBillingProvider()
  vi.unstubAllGlobals()
})

describe('Mercado Pago: assinatura do webhook', () => {
  const p = () => new MercadoPagoBillingProvider()
  const req = (headers: Record<string, string>, id = '123') => ({
    headers,
    query: { 'data.id': id, type: 'payment' },
    body: {},
    rawBody: Buffer.alloc(0),
  })

  it('aceita a assinatura correta (id alfanumérico assinado em minúsculas)', () => {
    expect(p().verifyWebhook(req({ 'x-signature': sign('123', 'r1'), 'x-request-id': 'r1' }))).toBe(
      true,
    )
    expect(
      p().verifyWebhook(req({ 'x-signature': sign('ABC9', 'r1'), 'x-request-id': 'r1' }, 'ABC9')),
    ).toBe(true)
  })

  it('recusa assinatura errada, de outro id, sem cabeçalho ou antiga (replay)', () => {
    expect(p().verifyWebhook(req({}))).toBe(false)
    expect(p().verifyWebhook(req({ 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r1' }))).toBe(
      false,
    )
    expect(p().verifyWebhook(req({ 'x-signature': sign('999', 'r1'), 'x-request-id': 'r1' }))).toBe(
      false,
    )
    expect(p().verifyWebhook(req({ 'x-signature': sign('123', 'r1'), 'x-request-id': 'r2' }))).toBe(
      false,
    )
    const old = Date.now() - 60 * 60_000
    expect(
      p().verifyWebhook(req({ 'x-signature': sign('123', 'r1', old), 'x-request-id': 'r1' })),
    ).toBe(false)
  })
})

describe('Mercado Pago: fluxo completo com a API simulada', () => {
  it('PIX: cria o checkout, recebe a notificação, busca o pagamento na API e ativa', async () => {
    const { agent, tenant } = await createOwner()
    let paymentStatus = 'pending'
    let invoiceId = ''
    const calls = mockMp((url) => {
      if (url.endsWith('/checkout/preferences'))
        return { id: 'pref_1', init_point: 'https://mp.test/checkout/pref_1' }
      if (url.endsWith('/v1/payments/555'))
        return {
          id: 555,
          status: paymentStatus,
          external_reference: `inv:${invoiceId}`,
          transaction_amount: 99,
          date_approved: '2026-11-04T12:00:00Z',
          payment_type_id: 'bank_transfer',
        }
      return undefined
    })
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    invoiceId = (await agent.get('/api/billing')).json().invoices[0].id
    const checkout = (await agent.post(`/api/billing/invoices/${invoiceId}/checkout`)).json()
    expect(checkout.checkoutUrl).toBe('https://mp.test/checkout/pref_1')
    const pref = calls.find((c) => c.url.endsWith('/checkout/preferences'))!.body as {
      external_reference: string
      items: { unit_price: number }[]
      payment_methods: { excluded_payment_types: { id: string }[] }
    }
    expect(pref.external_reference).toBe(`inv:${invoiceId}`)
    expect(pref.items[0]!.unit_price).toBe(99)
    expect(pref.payment_methods.excluded_payment_types.map((t) => t.id)).toContain('credit_card')

    const app = await getApp()
    const notify = () =>
      app.inject({
        method: 'POST',
        url: '/api/webhooks/mercadopago?data.id=555&type=payment',
        headers: { 'x-signature': sign('555', 'req-1'), 'x-request-id': 'req-1' },
        // O corpo é ignorado: o valor e o status vêm da API
        payload: { type: 'payment', data: { id: '555' }, transaction_amount: 0.01 },
      })
    expect((await notify()).statusCode).toBe(200)
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('trial')
    paymentStatus = 'approved'
    expect((await notify()).json()).toEqual({ ok: true })
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(inv.status).toBe('paid')
    expect(inv.providerPaymentId).toBe('555')
    expect(inv.paymentMethod).toBe('bank_transfer')
    // Reenvio da mesma notificação não aplica de novo
    expect((await notify()).json()).toEqual({ duplicated: true })
  })

  it('ignora pagamentos que não são de faturas do sistema', async () => {
    mockMp((url) =>
      url.endsWith('/v1/payments/777')
        ? { id: 777, status: 'approved', external_reference: 'outra-coisa', transaction_amount: 99 }
        : undefined,
    )
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago?data.id=777&type=payment',
      headers: { 'x-signature': sign('777', 'r'), 'x-request-id': 'r' },
      payload: {},
    })
    expect(res.json()).toEqual({ ignored: true })
    expect(await prisma.webhookEvent.count()).toBe(0)
  })

  it('cartão: cria o preapproval e trata a cobrança mensal autorizada', async () => {
    const { agent, tenant } = await createOwner()
    const calls = mockMp((url, init) => {
      if (url.endsWith('/preapproval') && init.method === 'POST')
        return { id: 'PA1', init_point: 'https://mp.test/sub/PA1' }
      if (url.endsWith('/preapproval/PA1')) return { id: 'PA1', status: 'authorized' }
      if (url.endsWith('/authorized_payments/42'))
        return {
          id: 42,
          preapproval_id: 'PA1',
          transaction_amount: 99,
          payment: { id: 9001, status: 'approved' },
        }
      return undefined
    })
    const res = (
      await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    ).json()
    expect(res.checkoutUrl).toBe('https://mp.test/sub/PA1')
    const body = calls[0]!.body as {
      external_reference: string
      auto_recurring: { transaction_amount: number }
    }
    expect(body.external_reference).toBe(`ten:${tenant.id}`)
    expect(body.auto_recurring.transaction_amount).toBe(99)

    const app = await getApp()
    await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago?data.id=PA1&type=subscription_preapproval',
      headers: { 'x-signature': sign('PA1', 'a'), 'x-request-id': 'a' },
      payload: {},
    })
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago?data.id=42&type=subscription_authorized_payment',
      headers: { 'x-signature': sign('42', 'b'), 'x-request-id': 'b' },
      payload: {},
    })
    expect(r.json()).toEqual({ ok: true })
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(sub.status).toBe('active')
    expect(sub.providerCheckoutUrl).toBeNull()
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { tenantId: tenant.id, status: 'paid' },
    })
    expect(inv.providerPaymentId).toBe('9001')

    // Troca para PIX: cancela o cartão no Mercado Pago
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const cancel = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/preapproval/PA1'))
    expect(cancel?.body).toEqual({ status: 'cancelled' })
  })
})
