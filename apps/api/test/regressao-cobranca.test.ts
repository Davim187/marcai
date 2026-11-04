import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/config/env'
import { prisma } from '../src/lib/prisma'
import { addOneMonth } from '../src/modules/billing/billing.service'
import { EmailChannel } from '../src/modules/notifications/channels/email'
import { PermanentChannelError } from '../src/modules/notifications/channels/types'
import { resetWhatsappProvider } from '../src/modules/notifications/channels/whatsapp'
import { ConsoleWhatsAppProvider } from '../src/modules/notifications/channels/whatsapp/console'
import { processDueJobs, processJob } from '../src/modules/notifications/worker'
import { bookingPayload, createOwner, getApp, nextFreeSlots } from './helpers'

const saved = { ...env }
afterEach(() => {
  Object.assign(env, saved)
  resetWhatsappProvider()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function hook(payload: Record<string, unknown>) {
  const app = await getApp()
  const r = await app.inject({
    method: 'POST',
    url: '/api/webhooks/mercadopago',
    headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
    payload,
  })
  return { status: r.statusCode, body: r.json() }
}
const sub = (tenantId: string) => prisma.subscription.findUniqueOrThrow({ where: { tenantId } })

describe('REVISAO cobrança (banca)', () => {
  it('estorno de fatura PIX desconta o mês pago', async () => {
    const { agent, tenant } = await createOwner()
    // Pago durante o teste e estornado: volta para o teste grátis
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const inv = (await agent.get('/api/billing')).json().invoices[0]
    await hook({
      eventId: 'p1:ok',
      type: 'payment_confirmed',
      invoiceId: inv.id,
      providerPaymentId: 'p1',
      amountCents: 9900,
    })
    expect((await sub(tenant.id)).status).toBe('active')
    await hook({
      eventId: 'p1:refunded',
      type: 'payment_refunded',
      invoiceId: inv.id,
      providerPaymentId: 'p1',
    })
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
      'refunded',
    )
    expect((await sub(tenant.id)).status).toBe('trial')

    // Assinante antiga, com 10 dias de período: o estorno do último mês deixa em atraso
    const s = await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        status: 'active',
        trialEndsAt: new Date(Date.now() - 90 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
      },
    })
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: s.id,
        amountCents: 9900,
        status: 'paid',
        providerPaymentId: 'p2',
        dueDate: new Date(Date.now() - 20 * 86_400_000),
      },
    })
    await hook({ eventId: 'p2:refunded', type: 'payment_refunded', providerPaymentId: 'p2' })
    expect((await sub(tenant.id)).status).toBe('past_due')
  })

  it('estorno/contestação no cartão também é tratado', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    const s0 = await sub(tenant.id)
    await hook({
      eventId: 'c1:ok',
      type: 'payment_confirmed',
      providerSubscriptionId: s0.providerSubscriptionId,
      providerPaymentId: 'c1',
      amountCents: 9900,
    })
    const r = await hook({
      eventId: 'c1:back',
      type: 'payment_refunded',
      providerSubscriptionId: s0.providerSubscriptionId,
      providerPaymentId: 'c1',
    })
    expect(r.body).toEqual({ ok: true })
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { providerPaymentId: 'c1' } })).status,
    ).toBe('refunded')
    // Pago no teste e estornado: volta para o teste grátis
    expect((await sub(tenant.id)).status).toBe('trial')
  })

  it('pagamento de fatura cancelada pelo link antigo é aceito e deixa estado consistente', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const inv = (await agent.get('/api/billing')).json().invoices[0]
    await agent.post(`/api/billing/invoices/${inv.id}/checkout`)
    await agent.post('/api/billing/cancel')
    await hook({
      eventId: 'old:ok',
      type: 'payment_confirmed',
      invoiceId: inv.id,
      providerPaymentId: 'old',
      amountCents: 9900,
    })
    const s = await sub(tenant.id)
    expect(s.status).toBe('active')
    expect(s.canceledAt).toBeNull()
  })

  it('erro no meio do processamento não "queima" o evento: o reenvio aplica', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const inv = (await agent.get('/api/billing')).json().invoices[0]
    // O banco recusa a atualização da assinatura na primeira entrega (deadlock, deploy no meio...)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION falha_teste() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'deadlock simulado'; END; $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER falha_teste BEFORE UPDATE ON "Subscription" FOR EACH ROW EXECUTE FUNCTION falha_teste()`,
    )
    const ev = {
      eventId: 'p9:ok',
      type: 'payment_confirmed',
      invoiceId: inv.id,
      providerPaymentId: 'p9',
      amountCents: 9900,
    }
    expect((await hook(ev)).status).toBe(500)
    await prisma.$executeRawUnsafe(`DROP TRIGGER falha_teste ON "Subscription"`)
    // Nada ficou gravado pela metade: nem o evento, nem a fatura paga
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
      'pending',
    )
    expect((await hook(ev)).body).toEqual({ ok: true })
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('paid')
    expect((await sub(tenant.id)).status).toBe('active')
  })

  it('cobrança no cartão com o valor do plano anterior é registrada (não descartada)', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'essencial', billingType: 'CREDIT_CARD' })
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    const s0 = await sub(tenant.id)
    const r = await hook({
      eventId: 'c2:ok',
      type: 'payment_confirmed',
      providerSubscriptionId: s0.providerSubscriptionId,
      providerPaymentId: 'c2',
      amountCents: 6900,
    })
    expect(r.body).toEqual({ ok: true })
    expect(await prisma.invoice.count({ where: { tenantId: tenant.id, status: 'paid' } })).toBe(1)
  })

  it('o mesmo pagamento do cartão chegando duas vezes (authorized/approved) só estende uma vez', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    const s0 = await sub(tenant.id)
    await hook({
      eventId: 'ap:1:approved',
      type: 'payment_confirmed',
      providerSubscriptionId: s0.providerSubscriptionId,
      providerPaymentId: 'mp9',
      amountCents: 9900,
    })
    const end1 = (await sub(tenant.id)).currentPeriodEnd!.getTime()
    await hook({
      eventId: 'ap:1:approved-de-novo',
      type: 'payment_confirmed',
      providerSubscriptionId: s0.providerSubscriptionId,
      providerPaymentId: 'mp9',
      amountCents: 9900,
    })
    expect((await sub(tenant.id)).currentPeriodEnd!.getTime()).toBe(end1)
  })

  it('cadastrar outro cartão cancela o anterior; o aviso do cartão antigo não derruba a assinatura', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    const old = (await sub(tenant.id)).providerSubscriptionId
    await agent.post('/api/billing/subscribe', {
      plan: 'pro',
      billingType: 'CREDIT_CARD',
      newCard: true,
    })
    const now = await sub(tenant.id)
    expect(now.providerSubscriptionId).not.toBe(old)
    await hook({
      eventId: 'pre:old:cancelled',
      type: 'subscription_canceled',
      providerSubscriptionId: old,
    })
    expect((await sub(tenant.id)).status).toBe('trial')
  })

  it('pagar este mês por PIX sem desligar o cartão', async () => {
    const { agent, tenant } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'CREDIT_CARD' })
    const r = await agent.post('/api/billing/pay-once', { billingType: 'PIX' })
    expect(r.statusCode).toBe(200)
    expect(r.json().amountCents).toBe(9900)
    const s = await sub(tenant.id)
    expect(s.billingType).toBe('CREDIT_CARD')
    expect(s.providerSubscriptionId).toBeTruthy()
  })

  it('boleto em análise não vira "vencida"', async () => {
    const { agent } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'BOLETO' })
    const inv = (await agent.get('/api/billing')).json().invoices[0]
    await hook({
      eventId: 'b1:pending',
      type: 'payment_pending',
      invoiceId: inv.id,
      providerPaymentId: 'b1',
      paymentMethod: 'ticket',
    })
    const { runBillingTick } = await import('../src/modules/billing/billing.tick')
    await runBillingTick(new Date(new Date(inv.dueDate).getTime() + 3 * 86_400_000))
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
    expect(after.status).toBe('pending')
    expect(after.processingSince).not.toBeNull()
  })

  it('dia de cobrança 31 não escorrega para 28', () => {
    const d1 = addOneMonth(new Date('2027-01-31T12:00:00Z'), 31)
    const d2 = addOneMonth(d1, 31)
    expect(d1.toISOString().slice(0, 10)).toBe('2027-02-28')
    expect(d2.toISOString().slice(0, 10)).toBe('2027-03-31')
    expect(addOneMonth(new Date('2028-01-31T12:00:00Z'), 31).toISOString().slice(0, 10)).toBe(
      '2028-02-29',
    )
  })

  it('"Simular pagamento" só funciona com a API em localhost', async () => {
    const { agent } = await createOwner()
    await agent.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })
    const inv = (await agent.get('/api/billing')).json().invoices[0]
    env.API_URL = 'https://api.exemplo.com.br'
    expect((await agent.post(`/api/billing/fake/pay/${inv.id}`)).statusCode).toBe(403)
  })
})

describe('REVISAO notificações (banca)', () => {
  it('LGPD: cliente excluída não recebe o que estava na fila e os dados saem do payload', async () => {
    const o = await createOwner()
    await prisma.tenant.update({
      where: { id: o.tenant.id },
      data: {
        notifyPhone: '5585988880000',
        notifyWhatsappProfessional: true,
        notifyWhatsappCustomer: true,
      },
    })
    const service = await prisma.service.findFirstOrThrow({
      where: { tenantId: o.tenant.id, name: 'Alongamento em gel' },
    })
    const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${o.slug}/bookings`,
      payload: bookingPayload(service.id, o.professional.id, slots.at(-1)!.startsAt, {
        customerEmail: 'cli@exemplo.com',
      }),
    })
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: res.json().id },
      include: { customer: true },
    })
    const phone = b.customer.phone
    expect((await o.agent.delete(`/api/customers/${b.customerId}`)).statusCode).toBe(200)
    await prisma.notificationJob.updateMany({
      where: { bookingId: b.id },
      data: { runAt: new Date(Date.now() - 1000) },
    })
    ConsoleWhatsAppProvider.sent.length = 0
    await processDueJobs()
    expect(ConsoleWhatsAppProvider.sent.filter((s) => s.to === phone)).toHaveLength(0)
    const jobs = await prisma.notificationJob.findMany({
      where: { bookingId: b.id, kind: { startsWith: 'customer_' } },
    })
    expect(
      jobs.filter(
        (j) =>
          JSON.stringify(j.payload).includes(phone) ||
          JSON.stringify(j.payload).includes('cli@exemplo.com'),
      ),
    ).toHaveLength(0)
  })

  it('Evolution fora do ar: tenta de novo com espera crescente e desiste na 5ª', async () => {
    const { tenant } = await createOwner()
    env.WHATSAPP_PROVIDER = 'evolution'
    env.EVOLUTION_API_URL = 'http://evolution.test'
    env.EVOLUTION_API_KEY = 'k'
    env.EVOLUTION_WEBHOOK_SECRET = 'segredo-evolution-123456'
    resetWhatsappProvider()
    await prisma.whatsAppConnection.create({
      data: { tenantId: tenant.id, provider: 'evolution', status: 'connected' },
    })
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed (ECONNREFUSED)')
    })
    let job = await prisma.notificationJob.create({
      data: {
        tenantId: tenant.id,
        channel: 'whatsapp',
        kind: 'customer_confirmation',
        payload: { tenantId: tenant.id, to: '5585999990000', title: 't', body: 'b' },
      },
    })
    const delays: number[] = []
    for (let i = 1; i <= 5; i++) {
      job = await prisma.notificationJob.update({
        where: { id: job.id },
        data: { attempts: i, status: 'processing' },
      })
      const t0 = Date.now()
      await processJob(job)
      job = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } })
      delays.push(Math.round((job.runAt.getTime() - t0) / 1000))
    }
    expect(delays.slice(0, 4)).toEqual([30, 60, 120, 240])
    expect(job.status).toBe('failed')
  })

  it('SMTP 550 (caixa inexistente) vira falha definitiva, sem repetir', async () => {
    const srv = net.createServer((s) => {
      s.write('220 fake ESMTP\r\n')
      s.on('data', (d) => {
        for (const line of d.toString().split('\r\n').filter(Boolean)) {
          if (/^EHLO|^HELO/i.test(line)) s.write('250 fake\r\n')
          else if (/^RCPT/i.test(line)) s.write('550 5.1.1 mailbox unavailable\r\n')
          else if (/^QUIT/i.test(line)) {
            s.write('221 bye\r\n')
            s.end()
          } else s.write('250 ok\r\n')
        }
      })
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    env.SMTP_HOST = '127.0.0.1'
    env.SMTP_PORT = (srv.address() as net.AddressInfo).port
    env.SMTP_SECURE = false
    env.RESEND_API_KEY = undefined
    const err = await new EmailChannel()
      .send({ tenantId: 'x', to: 'nao@existe.com', title: 't', body: 'b' })
      .catch((e: unknown) => e)
    srv.close()
    expect(err).toBeInstanceOf(PermanentChannelError)
  })
})
