import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { bookingPayload, createOwner, getApp, loginAsProfessional, nextFreeSlots } from './helpers'

/** Testes de regressão dos achados da banca de revisão (hacker e usuário confuso). */
async function setup() {
  const o = await createOwner()
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  return { ...o, service, slots, app: await getApp() }
}

describe('segurança: página de prévia (Open Graph)', () => {
  it('não reflete HTML/script vindo da URL nem redireciona para fora', async () => {
    const app = await getApp()
    const xss = await app.inject({
      method: 'GET',
      url: '/api/public/og?path=/x%22%3E%3Cscript%3Ealert(1)%3C/script%3E',
    })
    expect(xss.body).not.toContain('<script>alert(1)</script>')
    expect(xss.headers['content-security-policy']).toContain("default-src 'none'")
    const external = await app.inject({
      method: 'GET',
      url: '/api/public/og?path=https://evil.example',
    })
    expect(external.body).not.toContain('evil.example')
  })

  it('escapa o nome do estabelecimento (XSS armazenado)', async () => {
    const { tenant, slug } = await createOwner()
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: '<svg onload=alert(1)>' },
    })
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: `/api/public/og?path=/${slug}` })
    expect(res.body).not.toContain('<svg onload')
    expect(res.body).toContain('&lt;svg onload=alert(1)&gt;')
  })

  it('envia headers de segurança e o cookie de CSRF é httpOnly', async () => {
    const { agent } = await createOwner()
    const res = await agent.get('/api/auth/me')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    const app = await getApp()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'x@x.com', password: 'y' },
    })
    void login
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Teste Cookie',
        email: `cookie-${Date.now()}@teste.com`,
        password: 'senha12345',
        acceptTerms: true,
      },
    })
    const csrf = reg.cookies.find((c) => c.name === 'marcai_csrf')!
    expect(csrf.httpOnly).toBe(true)
    expect(reg.json().csrfToken).toBeTruthy()
  })
})

describe('segurança: webhook de cobrança', () => {
  it('recusa notificação sem assinatura válida', async () => {
    const { tenant } = await createOwner()
    const app = await getApp()
    const payload = { eventId: 'x1', type: 'subscription_authorized', providerSubscriptionId: 'x' }
    for (const sig of ['fake-token', '', 'test-mp-webhook-secret ']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/mercadopago',
        headers: { 'x-fake-signature': sig },
        payload,
      })
      expect(res.statusCode).toBe(403)
    }
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).status,
    ).toBe('trial')
    expect(await prisma.webhookEvent.count()).toBe(0)
  })
})

describe('segurança: acesso da profissional (papel restrito)', () => {
  it('não vê a agenda dos colegas nem passando ?professionalId= na URL', async () => {
    const { agent, service, professional, slots } = await setup()
    await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Dani',
      customerPhone: '(85) 97777-1000',
    })
    const pro = await loginAsProfessional(agent, `pro-${Date.now()}@teste.com`)
    expect((await pro.get(`/api/bookings?professionalId=${professional.id}`)).json().total).toBe(0)
    const from = new Date(Date.now() - 86_400_000).toISOString()
    const to = new Date(Date.now() + 20 * 86_400_000).toISOString()
    const cal = await pro.get(
      `/api/bookings/calendar?from=${from}&to=${to}&professionalId=${professional.id}`,
    )
    expect(cal.json().bookings).toHaveLength(0)
  })

  it('não exporta, importa, edita nem exclui clientes; só vê os próprios', async () => {
    const { agent, service, professional, slots } = await setup()
    const created = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Eva Dona',
      customerPhone: '(85) 97777-2000',
    })
    const customerId = created.json().customerId
    const pro = await loginAsProfessional(agent, `pro2-${Date.now()}@teste.com`)
    expect((await pro.get('/api/customers/export.csv')).statusCode).toBe(403)
    expect(
      (await pro.post('/api/customers/import', { csv: 'Nome;WhatsApp\nX;85999990000' })).statusCode,
    ).toBe(403)
    expect((await pro.delete(`/api/customers/${customerId}`)).statusCode).toBe(403)
    expect((await pro.get(`/api/customers/${customerId}/export`)).statusCode).toBe(403)
    expect((await pro.get('/api/customers')).json().total).toBe(0)
    expect((await pro.get(`/api/customers/${customerId}`)).statusCode).toBe(404)
  })

  it('membro sem agenda vinculada não vê agendamento nenhum', async () => {
    const { agent, service, professional, slots, tenant } = await setup()
    await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Fia',
      customerPhone: '(85) 97777-3000',
    })
    const email = `semagenda-${Date.now()}@teste.com`
    const pro = await loginAsProfessional(agent, email)
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    await prisma.tenantMember.updateMany({
      where: { tenantId: tenant.id, userId: user.id },
      data: { professionalId: null },
    })
    expect((await pro.get('/api/bookings')).json().total).toBe(0)
  })

  it('profissional não altera o valor do atendimento', async () => {
    const { agent, tenant, service, slots } = await setup()
    const pro = await loginAsProfessional(agent, `pro3-${Date.now()}@teste.com`)
    const proId = (
      await prisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenant.id, role: 'professional' },
      })
    ).professionalId!
    await prisma.professionalService.create({
      data: { tenantId: tenant.id, professionalId: proId, serviceId: service.id },
    })
    await prisma.workingHours.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId: tenant.id,
        professionalId: proId,
        weekday,
        start: '00:00',
        end: '23:59',
      })),
    })
    const b = await pro.post('/api/bookings', {
      serviceId: service.id,
      professionalId: proId,
      startsAt: slots[0]!.startsAt,
      customerName: 'Gil',
      customerPhone: '(85) 97777-4000',
      priceCents: 1,
    })
    expect(b.statusCode).toBe(201)
    expect(b.json().priceCents).toBe(service.priceCents)
    expect(
      (await pro.patch(`/api/bookings/${b.json().id}/notes`, { notes: null, priceCents: 1 }))
        .statusCode,
    ).toBe(403)
  })
})

describe('segurança: reserva pública não mexe em dados de cliente existente', () => {
  it('não troca o e-mail nem revela o nome cadastrado de quem tem o telefone', async () => {
    const { agent, slug, service, professional, slots, app } = await setup()
    const c = await agent.post('/api/customers', {
      name: 'Ana Verdadeira',
      phone: '(85) 98888-5000',
      email: 'ana@real.com',
    })
    expect(c.statusCode).toBe(201)
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, slots[0]!.startsAt, {
        customerPhone: '(85) 98888-5000',
        customerName: 'Fulano',
        customerEmail: 'atacante@evil.test',
      }),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().customerName).toBe('Fulano')
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.json().id } })
    expect([row.name, row.email]).toEqual(['Ana Verdadeira', 'ana@real.com'])
  })
})

describe('robustez: ações repetidas e horários inválidos', () => {
  it('5 cancelamentos simultâneos geram 1 único aviso para o cliente', async () => {
    const { agent, service, professional, slots } = await setup()
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Zé',
      customerPhone: '(85) 97777-6000',
      notifyCustomer: false,
    })
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent.patch(`/api/bookings/${b.json().id}/status`, { status: 'canceled' }),
      ),
    )
    expect(results.every((r) => r.statusCode === 200)).toBe(true)
    expect(
      await prisma.notificationJob.count({
        where: { bookingId: b.json().id, kind: 'customer_canceled' },
      }),
    ).toBe(1)
  })

  it('não agenda nem remarca no passado, mesmo com encaixe (force)', async () => {
    const { agent, service, professional, slots } = await setup()
    const past = '2020-01-01T12:00:00.000Z'
    const manual = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: past,
      customerName: 'Ivo',
      customerPhone: '(85) 97777-7000',
      allowOutsideHours: true,
    })
    expect([manual.statusCode, manual.json().error]).toEqual([400, 'HORARIO_PASSADO'])
    const b = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Ivo',
      customerPhone: '(85) 97777-7000',
    })
    const r = await agent.post(`/api/bookings/${b.json().id}/reschedule`, {
      startsAt: past,
      force: true,
    })
    expect(r.json().error).toBe('HORARIO_PASSADO')
  })

  it('mensagem certa: horário fora da agenda ≠ horário ocupado', async () => {
    const { slug, service, professional, app } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(
        service.id,
        professional.id,
        new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) + 'T06:17:00.000Z',
      ),
    })
    expect([res.statusCode, res.json().error]).toEqual([409, 'HORARIO_INDISPONIVEL'])
  })

  it('bloqueio de conta após 10 senhas erradas, mesmo trocando de IP', async () => {
    const { email } = await createOwner()
    const app = await getApp()
    const codes: number[] = []
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: `10.0.0.${i + 1}`,
        payload: { email, password: 'errada-123' },
      })
      codes.push(r.statusCode)
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
    expect(codes[10]).toBe(429)
  })

  it('forjar X-Forwarded-For não fura o limite de tentativas de login', async () => {
    const app = await getApp()
    let limited = false
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '10.2.2.2',
        headers: { 'x-forwarded-for': `1.2.3.${i}`, 'x-test-rate-limit': '1' },
        // e-mails diferentes: o que barra aqui é o limite por IP, não o bloqueio da conta
        payload: { email: `naoexiste${i}@teste.com`, password: 'qualquer1' },
      })
      if (r.statusCode === 429) limited = true
    }
    expect(limited).toBe(true)
  })

  it('pausa fixa atravessando a meia-noite é recusada com explicação', async () => {
    const { agent, professional } = await createOwner()
    const r = await agent.post('/api/schedule/recurring-blocks', {
      professionalId: professional.id,
      weekday: 3,
      start: '22:00',
      end: '02:00',
    })
    expect(r.statusCode).toBe(400)
    expect(Object.values(r.json().fields).join(' ')).toContain('meia-noite')
    const ok = await agent.post('/api/schedule/recurring-blocks', {
      professionalId: professional.id,
      weekday: 3,
      start: '18:00',
      end: '00:00',
    })
    expect(ok.statusCode).toBe(201)
  })

  it('remover profissional avisa sobre serviços que ficariam sem ninguém', async () => {
    const { agent } = await createOwner()
    const other = await agent.post('/api/team/professionals', {
      name: 'Segundo Pro',
      serviceIds: [],
    })
    const owner = (await agent.get('/api/team/professionals'))
      .json()
      .find((p: { id: string }) => p.id !== other.json().id)
    const first = await agent.delete(`/api/team/professionals/${owner.id}`)
    expect([first.statusCode, first.json().error]).toEqual([409, 'SERVICOS_SEM_PROFISSIONAL'])
    const confirmed = await agent.delete(`/api/team/professionals/${owner.id}?confirmar=1`)
    expect(confirmed.statusCode).toBe(200)
  })

  it('área do cliente: agendamento cancelado explica o motivo certo', async () => {
    const { slug, service, professional, app } = await setup()
    const later = await (async () => {
      for (let i = 3; i <= 10; i++) {
        const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
        const r = await app.inject({
          method: 'GET',
          url: `/api/public/t/${slug}/slots?serviceId=${service.id}&professionalId=${professional.id}&date=${date}`,
        })
        if (r.json().slots.length) return r.json().slots[0].startsAt as string
      }
      throw new Error('sem horário')
    })()
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, later),
    })
    const token = res.json().token
    await app.inject({ method: 'POST', url: `/api/public/bookings/${token}/cancel`, payload: {} })
    const r = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/reschedule`,
      payload: { startsAt: later },
    })
    expect(r.json().message).toBe('Esse agendamento já foi cancelado.')
  })

  it('senha só com espaços é recusada; mensagens de validação em português', async () => {
    const app = await getApp()
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Teste',
        email: `esp-${Date.now()}@t.com`,
        password: '        ',
        acceptTerms: true,
      },
    })
    expect(r.json().fields.password).toBe('A senha não pode ser só espaços')
    const { agent } = await createOwner()
    const s = await agent.post('/api/services', {
      name: 'X serviço',
      durationMinutes: 'abc',
      priceCents: 100,
    })
    expect(s.json().fields.durationMinutes).toBe('Informe a duração em minutos')
  })
})
