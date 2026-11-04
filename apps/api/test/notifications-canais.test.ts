import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../src/config/env'
import { prisma } from '../src/lib/prisma'
import { resetWhatsappProvider } from '../src/modules/notifications/channels/whatsapp'
import { processDueJobs } from '../src/modules/notifications/worker'
import { scheduleDailySummaries } from '../src/modules/notifications/worker'
import { bookingPayload, createOwner, getApp, nextFreeSlots } from './helpers'

const saved = { ...env }
afterEach(() => {
  Object.assign(env, saved)
  resetWhatsappProvider()
  vi.unstubAllGlobals()
})

async function setup() {
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
  return { ...o, service, slots }
}

async function book(
  slug: string,
  serviceId: string,
  professionalId: string,
  startsAt: string,
  extra = {},
) {
  const app = await getApp()
  const res = await app.inject({
    method: 'POST',
    url: `/api/public/t/${slug}/bookings`,
    payload: bookingPayload(serviceId, professionalId, startsAt, extra),
  })
  expect(res.statusCode).toBe(201)
  return res.json()
}

describe('notificações: todos os canais', () => {
  it('novo agendamento: WhatsApp E e-mail para a profissional; WhatsApp E e-mail para a cliente', async () => {
    const { slug, service, professional, slots } = await setup()
    // Horário a mais de 2 dias para o lembrete ficar agendado
    const later =
      slots.find((s) => new Date(s.startsAt).getTime() > Date.now() + 48 * 3_600_000) ??
      slots.at(-1)!
    const b = await book(slug, service.id, professional.id, later.startsAt, {
      customerEmail: 'cliente@exemplo.com',
    })
    const jobs = await prisma.notificationJob.findMany({ where: { bookingId: b.id } })
    const kinds = jobs.map((j) => `${j.channel}:${j.kind}`)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'whatsapp:professional_booking_created',
        'email:professional_booking_created',
        'whatsapp:customer_confirmation',
        'email:customer_confirmation',
        'whatsapp:customer_reminder',
        'email:customer_reminder_email',
        'push:booking_created',
      ]),
    )
    const emailToCustomer = jobs.find(
      (j) => j.channel === 'email' && j.kind === 'customer_confirmation',
    )!
    expect((emailToCustomer.payload as { to: string }).to).toBe('cliente@exemplo.com')
  })

  it('cancelar pelo painel cancela os dois lembretes (WhatsApp e e-mail)', async () => {
    const { slug, service, professional, slots, agent } = await setup()
    const later =
      slots.find((s) => new Date(s.startsAt).getTime() > Date.now() + 48 * 3_600_000) ??
      slots.at(-1)!
    const b = await book(slug, service.id, professional.id, later.startsAt, {
      customerEmail: 'cliente@exemplo.com',
    })
    const r = await agent.patch(`/api/bookings/${b.id}/status`, {
      status: 'canceled',
      reason: 'Imprevisto',
    })
    expect(r.statusCode).toBe(200)
    const pending = await prisma.notificationJob.count({
      where: {
        bookingId: b.id,
        kind: { in: ['customer_reminder', 'customer_reminder_email'] },
        status: 'pending',
      },
    })
    expect(pending).toBe(0)
  })

  it('resumo do dia também vai por e-mail para a dona', async () => {
    const { tenant } = await setup()
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { dailySummaryEnabled: true, timezone: 'UTC' },
    })
    const nineAm = new Date()
    nineAm.setUTCHours(9, 0, 0, 0)
    await scheduleDailySummaries(nineAm)
    await scheduleDailySummaries(nineAm)
    const emails = await prisma.notificationJob.count({
      where: { tenantId: tenant.id, kind: 'daily_summary', channel: 'email' },
    })
    expect(emails).toBe(1)
  })

  it('e-mail de teste e diagnóstico do serviço de e-mail', async () => {
    const { agent } = await setup()
    const settings = (await agent.get('/api/notifications/settings')).json()
    expect(settings.emailTransport).toBe('log')
    const r = await agent.post('/api/notifications/email/test')
    expect(r.statusCode).toBe(200)
    expect(r.json().to).toContain('@')
  })
})

describe('WhatsApp pela Evolution API', () => {
  function useEvolution(
    handler: (url: string, init: RequestInit) => { status?: number; body?: unknown },
  ) {
    env.WHATSAPP_PROVIDER = 'evolution'
    env.EVOLUTION_API_URL = 'http://evolution.test'
    env.EVOLUTION_API_KEY = 'chave'
    env.EVOLUTION_WEBHOOK_SECRET = 'segredo-evolution-123456'
    resetWhatsappProvider()
    const calls: { url: string; body: unknown; headers: Record<string, string> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: init.body ? JSON.parse(String(init.body)) : null,
        headers: init.headers as Record<string, string>,
      })
      const r = handler(url, init)
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
    })
    return calls
  }

  it('envia o texto pela instância do estabelecimento, com a apikey', async () => {
    const { tenant, agent } = await setup()
    await prisma.whatsAppConnection.create({
      data: { tenantId: tenant.id, provider: 'evolution', status: 'connected' },
    })
    const calls = useEvolution(() => ({ body: { key: { id: 'MSG1' } } }))
    const r = await agent.post('/api/notifications/whatsapp/test')
    expect(r.statusCode).toBe(200)
    const send = calls.find((c) => c.url.includes('/message/sendText/'))!
    expect(send.url).toBe(`http://evolution.test/message/sendText/marcai-${tenant.id}`)
    expect(send.headers.apikey).toBe('chave')
    expect(send.body).toMatchObject({ number: '5585988880000' })
  })

  it('status salvo desatualizado: confere na Evolution antes de desistir', async () => {
    const { tenant, agent } = await setup()
    await prisma.whatsAppConnection.create({
      data: { tenantId: tenant.id, provider: 'evolution', status: 'connecting' },
    })
    useEvolution((url) =>
      url.includes('/instance/connectionState/')
        ? { body: { instance: { state: 'open' } } }
        : { body: { key: { id: 'MSG1' } } },
    )
    expect((await agent.post('/api/notifications/whatsapp/test')).statusCode).toBe(200)
    expect(
      (await prisma.whatsAppConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } }))
        .status,
    ).toBe('connected')
  })

  it('número sem WhatsApp: falha definitiva (sem repetir)', async () => {
    const { tenant } = await setup()
    await prisma.whatsAppConnection.create({
      data: { tenantId: tenant.id, provider: 'evolution', status: 'connected' },
    })
    useEvolution(() => ({
      status: 400,
      body: {
        status: 400,
        error: 'Bad Request',
        response: { message: [{ exists: false, number: '5585911112222' }] },
      },
    }))
    const job = await prisma.notificationJob.create({
      data: {
        tenantId: tenant.id,
        channel: 'whatsapp',
        kind: 'customer_confirmation',
        payload: { tenantId: tenant.id, to: '5585911112222', title: 'x', body: 'Olá' },
      },
    })
    await processDueJobs()
    const after = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(after.status).toBe('failed')
    expect(after.lastError).toContain('não tem WhatsApp')
  })

  it('webhook de desconexão: marca desconectado e avisa a dona no painel e por e-mail', async () => {
    const { tenant, agent } = await setup()
    await prisma.whatsAppConnection.create({
      data: { tenantId: tenant.id, provider: 'evolution', status: 'connected' },
    })
    useEvolution(() => ({ body: {} }))
    const app = await getApp()
    const bad = await app.inject({
      method: 'POST',
      url: '/api/webhooks/evolution?token=errado',
      payload: {
        event: 'connection.update',
        instance: `marcai-${tenant.id}`,
        data: { state: 'close' },
      },
    })
    expect(bad.statusCode).toBe(403)
    const ok = await app.inject({
      method: 'POST',
      url: `/api/webhooks/evolution?token=${env.EVOLUTION_WEBHOOK_SECRET}`,
      payload: {
        event: 'connection.update',
        instance: `marcai-${tenant.id}`,
        data: { state: 'close' },
      },
    })
    expect(ok.statusCode).toBe(200)
    expect(
      (await prisma.whatsAppConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } }))
        .status,
    ).toBe('disconnected')
    const notif = (await agent.get('/api/notifications')).json()
    expect(notif.items[0].title).toBe('Seu WhatsApp desconectou')
    expect(
      await prisma.notificationJob.count({
        where: { tenantId: tenant.id, kind: 'whatsapp_disconnected', channel: 'email' },
      }),
    ).toBe(1)
  })

  it('conectar: cria a instância com o webhook e devolve o QR Code', async () => {
    const { tenant, agent } = await setup()
    const calls = useEvolution((url) =>
      url.endsWith('/instance/create')
        ? { body: { qrcode: { base64: 'data:image/png;base64,AAA' } } }
        : { body: {} },
    )
    const r = await agent.post('/api/notifications/whatsapp/connect')
    expect(r.json()).toMatchObject({ status: 'connecting', qrCode: 'data:image/png;base64,AAA' })
    const create = calls.find((c) => c.url.endsWith('/instance/create'))!.body as {
      instanceName: string
      webhook: { url: string }
    }
    expect(create.instanceName).toBe(`marcai-${tenant.id}`)
    expect(create.webhook.url).toContain('/api/webhooks/evolution?token=')
  })
})
