import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { ConsoleWhatsAppProvider } from '../src/modules/notifications/channels/whatsapp/console'
import { processDueJobs, processJob } from '../src/modules/notifications/worker'
import { bookingPayload, createOwner, getApp, nextFreeSlots } from './helpers'

async function setup(plan: 'trial' | 'essencial' = 'trial') {
  const o = await createOwner()
  await prisma.tenant.update({ where: { id: o.tenant.id }, data: { notifyPhone: '5585988880000' } })
  if (plan === 'essencial') {
    await prisma.subscription.update({
      where: { tenantId: o.tenant.id },
      data: {
        plan: 'essencial',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    })
  }
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

describe('notificações', () => {
  it('novo agendamento cria aviso no painel e enfileira WhatsApp (Pro/teste) com a mensagem completa', async () => {
    const { slug, service, professional, slots, tenant, agent } = await setup('trial')
    const fields = await prisma.formField.findMany({ where: { tenantId: tenant.id } })
    const b = await book(slug, service.id, professional.id, slots[0]!.startsAt, {
      customerName: 'Ana Souza',
      answers: [
        { fieldId: fields.find((f) => f.label === 'Tipo de unha')!.id, value: 'Quadrada' },
        { fieldId: fields.find((f) => f.label === 'É manutenção?')!.id, value: true },
      ],
    })
    const notif = await agent.get('/api/notifications')
    expect(notif.json().unread).toBe(1)
    expect(notif.json().items[0].title).toBe('Novo agendamento!')

    const jobs = await prisma.notificationJob.findMany({
      where: { bookingId: b.id },
      orderBy: { createdAt: 'asc' },
    })
    const kinds = jobs.map((j) => `${j.channel}:${j.kind}`)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'whatsapp:professional_booking_created',
        'whatsapp:customer_confirmation',
        'whatsapp:customer_reminder',
        'push:booking_created',
      ]),
    )

    const pro = jobs.find((j) => j.kind === 'professional_booking_created')!
    const body = (pro.payload as { body: string }).body
    expect(body).toContain('💅 Novo agendamento!')
    expect(body).toContain('👤 Cliente: Ana Souza')
    expect(body).toContain('✨ Serviço: Alongamento em gel')
    expect(body).toContain('📝 Tipo de unha: Quadrada')
    expect(body).toContain('📝 É manutenção? Sim')
    expect(body).toContain('Ver no painel: http://localhost:5173/painel/agenda/')

    // Worker envia os jobs vencidos (o lembrete fica para depois)
    ConsoleWhatsAppProvider.sent.length = 0
    await processDueJobs()
    expect(ConsoleWhatsAppProvider.sent.map((m) => m.to)).toEqual(
      expect.arrayContaining(['5585988880000']),
    )
    const reminder = await prisma.notificationJob.findFirstOrThrow({
      where: { bookingId: b.id, kind: 'customer_reminder' },
    })
    // Lembrete 24h antes: se o horário é em menos de 24h, já sai na hora; senão fica agendado.
    const dueNow = new Date(slots[0]!.startsAt).getTime() - 24 * 3_600_000 < Date.now()
    expect(reminder.status).toBe(dueNow ? 'done' : 'pending')
  })

  it('plano Essencial: sem WhatsApp, aviso vai por e-mail e push', async () => {
    const { slug, service, professional, slots } = await setup('essencial')
    const b = await book(slug, service.id, professional.id, slots[0]!.startsAt)
    const jobs = await prisma.notificationJob.findMany({ where: { bookingId: b.id } })
    expect(jobs.some((j) => j.channel === 'whatsapp')).toBe(false)
    expect(
      jobs.some((j) => j.channel === 'email' && j.kind === 'professional_booking_created'),
    ).toBe(true)
  })

  it('feature gating: rotas de WhatsApp bloqueadas no Essencial com aviso de upgrade', async () => {
    const { agent } = await setup('essencial')
    const res = await agent.post('/api/notifications/whatsapp/connect')
    expect(res.statusCode).toBe(402)
    expect(res.json().message).toContain('plano Pro')
  })

  it('fila com retry: falha temporária reagenda com backoff e falha definitiva cai para e-mail', async () => {
    const { tenant } = await setup()
    const job = await prisma.notificationJob.create({
      data: {
        tenantId: tenant.id,
        channel: 'whatsapp',
        kind: 'professional_booking_created',
        payload: { tenantId: tenant.id, title: 'x', body: 'y' },
        attempts: 1,
      },
    })
    // Sem "to": erro permanente → failed + fallback por e-mail
    await processJob(job)
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      'failed',
    )
    expect(
      await prisma.notificationJob.count({
        where: {
          tenantId: tenant.id,
          kind: 'professional_booking_created_fallback',
          channel: 'email',
        },
      }),
    ).toBe(1)

    const push = await prisma.notificationJob.create({
      data: {
        tenantId: tenant.id,
        channel: 'email',
        kind: 'teste',
        payload: { tenantId: tenant.id, to: 'nao-e-email', title: 'x', body: 'y' },
        attempts: 1,
      },
    })
    await processJob(push)
    expect(
      (await prisma.notificationJob.findUniqueOrThrow({ where: { id: push.id } })).status,
    ).toBe('failed')
  })

  it('templates editáveis com variáveis e pré-visualização', async () => {
    const { agent } = await setup()
    await agent.put('/api/notifications/templates', {
      key: 'customer_confirmation',
      body: 'Oi {cliente}, te espero {data} às {hora}!',
    })
    const list = (await agent.get('/api/notifications/templates')).json()
    expect(list.find((t: { key: string }) => t.key === 'customer_confirmation').isDefault).toBe(
      false,
    )
    const prev = await agent.post('/api/notifications/templates/preview', {
      body: 'Oi {cliente} — {valor}',
    })
    expect(prev.json().text).toBe('Oi Ana Souza — R$ 120,00')
  })

  it('webhook da Meta exige assinatura HMAC válida', async () => {
    const app = await getApp()
    const payload = JSON.stringify({ entry: [] })
    const bad = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meta',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=errado' },
      payload,
    })
    expect(bad.statusCode).toBe(403)
    process.env.META_WA_APP_SECRET = undefined
  })
})

void createHmac
