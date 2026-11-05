import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { handleBillingEvent } from '../src/modules/billing/billing.service'
import { FakeBillingProvider } from '../src/modules/billing/fake'
import { bookingPayload, createOwner, getApp, loginAsProfessional, nextFreeSlots } from './helpers'

let ipSeq = 0
const ip = () => `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`

async function setup() {
  const o = await createOwner()
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const other = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Esmaltação em gel' },
  })
  const { slots, date } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  const app = await getApp()
  return { ...o, app, service, other, slots, date }
}

async function publicBook(
  app: Awaited<ReturnType<typeof getApp>>,
  slug: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/api/public/t/${slug}/bookings`,
    payload,
    remoteAddress: ip(),
  })
}

describe('REVISAO reserva', () => {
  it('A1 remarcar para o próprio horário é aceito (não conflita consigo mesmo)', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Carla',
      customerPhone: '(85) 98888-1111',
    })
    const r = await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: slots[0]!.startsAt,
    })
    expect(r.statusCode).toBe(200)
  })

  it('A2 remarcar agendamento cancelado → 400', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Carla',
      customerPhone: '(85) 98888-1112',
    })
    await agent.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' })
    const r = await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: slots[1]!.startsAt,
    })
    expect(r.statusCode).toBe(400)
  })

  it('A3 cancelar 2x é idempotente e só gera um aviso para a cliente', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Carla',
      customerPhone: '(85) 98888-1113',
    })
    const c1 = await agent.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' })
    const c2 = await agent.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' })
    expect(c1.statusCode).toBe(200)
    expect(c2.statusCode).toBe(200)
    const jobs = await prisma.notificationJob.count({
      where: { bookingId: b.json().id, kind: 'customer_canceled' },
    })
    expect(jobs).toBe(1)
  })

  it('A4 confirmar presença em agendamento que já passou → 400', async () => {
    const { app, slug, service, professional, slots } = await setup()
    const res = await publicBook(
      app,
      slug,
      bookingPayload(service.id, professional.id, slots[0]!.startsAt),
    )
    expect(res.statusCode).toBe(201)
    const past = new Date(Date.now() - 3 * 86_400_000)
    await prisma.booking.update({
      where: { id: res.json().id },
      data: {
        startsAt: past,
        endsAt: new Date(past.getTime() + 3_600_000),
        blockedUntil: new Date(past.getTime() + 3_600_000),
      },
    })
    const c = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${res.json().token}/confirm`,
    })
    expect(c.statusCode).toBe(400)
  })

  it('A5 reserva pública com serviço inativo → 404', async () => {
    const { app, slug, agent, service, professional, slots } = await setup()
    await agent.patch(`/api/services/${service.id}/active`, { active: false })
    const res = await publicBook(
      app,
      slug,
      bookingPayload(service.id, professional.id, slots[0]!.startsAt),
    )
    expect(res.statusCode).toBe(404)
  })

  it('A6 reserva pública com profissional que não faz o serviço → 400 e nada gravado', async () => {
    const { app, slug, service, professional, slots, tenant } = await setup()
    await prisma.professionalService.deleteMany({ where: { serviceId: service.id } })
    const res = await publicBook(
      app,
      slug,
      bookingPayload(service.id, professional.id, slots[0]!.startsAt),
    )
    expect(res.statusCode).toBe(400)
    expect(await prisma.booking.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it('A7 resposta de seleção com opção inexistente → 400', async () => {
    const { app, slug, agent, service, professional, slots } = await setup()
    const f = await agent.post('/api/forms/fields', {
      label: 'Formato da unha',
      type: 'single_select',
      options: ['Quadrada', 'Redonda'],
      required: false,
    })
    expect(f.statusCode).toBe(201)
    const res = await publicBook(
      app,
      slug,
      bookingPayload(service.id, professional.id, slots[0]!.startsAt, {
        answers: [{ fieldId: f.json().id, value: 'Stiletto' }],
      }),
    )
    expect(res.statusCode).toBe(400)
  })

  it('A8 campo obrigatório que só vale para outro serviço não bloqueia a reserva', async () => {
    const { app, slug, agent, service, other, professional, slots } = await setup()
    const f = await agent.post('/api/forms/fields', {
      label: 'Cor do gel',
      type: 'short_text',
      required: true,
      appliesToAll: false,
      serviceIds: [other.id],
    })
    expect(f.statusCode).toBe(201)
    // Desativa os campos de preset obrigatórios que valem para todos, para isolar o caso
    await prisma.formField.updateMany({
      where: { tenantId: f.json().tenantId ?? undefined, appliesToAll: true },
      data: { required: false },
    })
    const res = await publicBook(
      app,
      slug,
      bookingPayload(service.id, professional.id, slots[0]!.startsAt),
    )
    expect(res.statusCode).toBe(201)
  })

  it('A9 GET slots com data inexistente (2026-11-33) → 400 (não 500)', async () => {
    const { app, slug, service, professional } = await setup()
    const r = await app.inject({
      method: 'GET',
      url: `/api/public/t/${slug}/slots?serviceId=${service.id}&professionalId=${professional.id}&date=2026-11-33`,
    })
    console.log('A9 BODY', r.body)
    expect({ status: r.statusCode, body: r.json() }).toMatchObject({ status: 400 })
  })
})

describe('REVISAO painel', () => {
  it('P1 profissional não consegue mudar status de agendamento de outra profissional', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Dani',
      customerPhone: '(85) 97777-0001',
    })
    const julia = await loginAsProfessional(agent, `julia-${Date.now()}@teste.com`)
    const r = await julia.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' })
    expect(r.statusCode).toBe(404)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.json().id } })).status).toBe(
      'confirmed',
    )
  })

  it('P2 dona não consegue mover agendamento para profissional de OUTRO estabelecimento (force)', async () => {
    const { agent, service, professional, slots } = await setup()
    const outro = await createOwner()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Eva',
      customerPhone: '(85) 97777-0002',
    })
    const r = await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: slots[1]!.startsAt,
      professionalId: outro.professional.id,
      force: true,
    })
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: b.json().id } })
    expect({ status: r.statusCode, professionalId: row.professionalId }).toEqual({
      status: 404,
      professionalId: professional.id,
    })
  })

  it('P2b efeito colateral: agendamento movido bloqueia a agenda do OUTRO estabelecimento', async () => {
    const { agent, service, professional, slots } = await setup()
    const outro = await createOwner()
    const outroService = await prisma.service.findFirstOrThrow({
      where: { tenantId: outro.tenant.id, name: 'Manicure simples' },
    })
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Eva',
      customerPhone: '(85) 97777-0012',
    })
    await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: slots[1]!.startsAt,
      professionalId: outro.professional.id,
      force: true,
    })
    // O outro estabelecimento ainda vê o horário como livre…
    const app = await getApp()
    const date = slots[1]!.startsAt.slice(0, 10)
    const free = await app.inject({
      method: 'GET',
      url: `/api/public/t/${outro.slug}/slots?serviceId=${outroService.id}&professionalId=${outro.professional.id}&date=${date}`,
    })
    const offered = free
      .json()
      .slots.some((s: { startsAt: string }) => s.startsAt === slots[1]!.startsAt)
    // …mas não consegue reservar
    const res = await publicBook(
      app,
      outro.slug,
      bookingPayload(outroService.id, outro.professional.id, slots[1]!.startsAt),
    )
    expect({ offered, status: res.statusCode }).toEqual({ offered: true, status: 201 })
  })

  it('P3 PUT /api/tenant/booking-rules com valores fora do limite → 400', async () => {
    const { agent } = await createOwner()
    const good = {
      minAdvanceMinutes: 60,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 30,
      cancelMinHours: 12,
      cancellationPolicy: null,
      requireConfirmation: false,
      reminderHours: 24,
      dailySummaryEnabled: false,
      loadHolidays: false,
    }
    expect((await agent.put('/api/tenant/booking-rules', good)).statusCode).toBe(200)
    for (const bad of [
      { slotIntervalMinutes: 7 },
      { maxAdvanceDays: 0 },
      { minAdvanceMinutes: -1 },
      { reminderHours: 0 },
      { cancelMinHours: 1000 },
    ]) {
      const r = await agent.put('/api/tenant/booking-rules', { ...good, ...bad })
      expect([JSON.stringify(bad), r.statusCode]).toEqual([JSON.stringify(bad), 400])
    }
  })

  it('P4 importação CSV vazia / só cabeçalho / binária / aspas abertas → 400 com motivo claro', async () => {
    const { agent } = await createOwner()
    const empty = await agent.post('/api/customers/import', { csv: '' })
    expect([empty.statusCode, empty.json().message]).toEqual([400, 'O arquivo está vazio'])
    const header = await agent.post('/api/customers/import', { csv: 'Nome;WhatsApp;E-mail\n' })
    expect([header.statusCode, header.json().message]).toEqual([
      400,
      'A planilha não tem nenhuma linha de cliente',
    ])
    const binary = await agent.post('/api/customers/import', {
      csv: '\u0089PNG\r\n\u001a\n\u0000\u0000',
    })
    expect(binary.statusCode).toBe(400)
    const quotes = await agent.post('/api/customers/import', {
      csv: 'Nome;WhatsApp\n"Ana;85999990001\nBia;85999990002',
    })
    expect(quotes.json().message).toContain('aspas')
  })

  it('P5 criar serviço com duração 0 / negativa / string → 400', async () => {
    const { agent } = await createOwner()
    for (const d of [0, -30, '30', 2.5]) {
      const r = await agent.post('/api/services', {
        name: 'Teste',
        durationMinutes: d,
        priceCents: 1000,
      })
      expect([d, r.statusCode]).toEqual([d, 400])
    }
  })

  it('P6 bloqueio recorrente com fim antes do início (13:00–12:00) → 400', async () => {
    const { agent, professional } = await createOwner()
    const r = await agent.post('/api/schedule/recurring-blocks', {
      professionalId: professional.id,
      weekday: 3,
      start: '13:00',
      end: '12:00',
    })
    expect(r.statusCode).toBe(400)
  })

  it('P7 exportação CSV neutraliza fórmulas (CSV injection)', async () => {
    const { agent } = await createOwner()
    await agent.post('/api/customers', {
      name: '=HYPERLINK("http://x.y","clique")',
      phone: '(85) 95555-1234',
    })
    const exp = await agent.get('/api/customers/export.csv')
    expect(exp.statusCode).toBe(200)
    const line = exp.body.split(/\r?\n/).find((l) => l.includes('HYPERLINK'))!
    const firstCell = line.split(';')[0]!.replace(/^"/, '')
    expect(firstCell.startsWith('=')).toBe(false)
  })
})

describe('REVISAO assinatura', () => {
  const day = 86_400_000

  it('B1 webhook com evento desconhecido: 200 e assinatura inalterada', async () => {
    const { tenant } = await createOwner()
    const app = await getApp()
    const before = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago',
      headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
      payload: { eventId: 'evt_x', type: 'other', providerSubscriptionId: null },
    })
    expect(r.statusCode).toBe(200)
    const after = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })
    expect(after.status).toBe(before.status)
  })

  it('B2 pagamento confirmado de tenant inexistente é ignorado', async () => {
    const res = await handleBillingEvent(
      {
        eventId: 'evt_ghost',
        type: 'payment_confirmed',
        providerSubscriptionId: 'preapproval_inexistente',
        providerPaymentId: 'pay_ghost',
        amountCents: 9900,
      },
      'mercadopago',
    )
    expect(res).toEqual({ ignored: true })
    const ghostInvoice = await handleBillingEvent(
      {
        eventId: 'evt_ghost2',
        type: 'payment_confirmed',
        invoiceId: 'fatura_inexistente',
        amountCents: 9900,
      },
      'mercadopago',
    )
    expect(ghostInvoice).toEqual({ ignored: true })
    expect(await prisma.invoice.count()).toBe(0)
  })

  it('B3 webhook com corpo vazio/malformado → 400 (não 500) e nada é gravado', async () => {
    await expect(
      new FakeBillingProvider().resolveWebhook({
        headers: {},
        query: {},
        body: {},
        rawBody: Buffer.alloc(0),
      }),
    ).rejects.toThrow()
    const app = await getApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/mercadopago',
      headers: { 'x-fake-signature': 'test-mp-webhook-secret' },
      payload: { nada: true },
    })
    expect(res.statusCode).toBe(400)
    expect(await prisma.webhookEvent.count()).toBe(0)
  })

  it('B4 acesso "blocked": leitura 200, escrita em agendamento 402', async () => {
    const { agent, tenant, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Gabi',
      customerPhone: '(85) 97777-0003',
    })
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: {
        status: 'past_due',
        currentPeriodEnd: new Date(Date.now() - 8 * day),
        trialEndsAt: new Date(Date.now() - 40 * day),
      },
    })
    expect((await agent.get('/api/bookings')).statusCode).toBe(200)
    expect((await agent.get(`/api/bookings/${b.json().id}`)).statusCode).toBe(200)
    const w = await agent.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' })
    expect(w.statusCode).toBe(402)
    const w2 = await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: slots[1]!.startsAt,
    })
    expect(w2.statusCode).toBe(402)
  })
})

describe('REVISAO notificações', () => {
  it('N1 remarcar 2x (A→B→A) deixa exatamente 1 lembrete pendente, no horário final', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Hel',
      customerPhone: '(85) 97777-0004',
    })
    const id = b.json().id
    expect(
      (await agent.post(`/api/bookings/${id}/reschedule`, { startsAt: slots[2]!.startsAt }))
        .statusCode,
    ).toBe(200)
    expect(
      (await agent.post(`/api/bookings/${id}/reschedule`, { startsAt: slots[0]!.startsAt }))
        .statusCode,
    ).toBe(200)
    const pend = await prisma.notificationJob.findMany({
      where: { bookingId: id, kind: 'customer_reminder', status: 'pending' },
    })
    expect(pend).toHaveLength(1)
    expect((pend[0]!.payload as { startsAt: string }).startsAt).toBe(slots[0]!.startsAt)
  })

  it('N2 template com variável desconhecida é recusado ao salvar', async () => {
    const { agent } = await createOwner()
    const r = await agent.put('/api/notifications/templates', {
      key: 'customer_reminder',
      body: 'Oi {nome_da_cliente}, seu horário é {hora}',
    })
    expect(r.statusCode).toBe(400)
  })
})
