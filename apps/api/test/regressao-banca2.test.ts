import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { hashToken } from '../src/lib/crypto'
import {
  bookingPayload,
  createOwner,
  getApp,
  loginAsProfessional,
  nextFreeSlots,
  TestAgent,
} from './helpers'

let ipSeq = 0
const ip = () => `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`
const RULES = {
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
async function setup() {
  const o = await createOwner()
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const { slots, date } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  return { ...o, app: await getApp(), service, slots, date }
}
type App = Awaited<ReturnType<typeof getApp>>
const book = async (app: App, slug: string, payload: ReturnType<typeof bookingPayload>) =>
  app.inject({
    method: 'POST',
    url: `/api/public/t/${slug}/bookings`,
    payload,
    remoteAddress: ip(),
  })

describe('REVISAO banca 2 (testador)', () => {
  it('T1 confirmação manual: a cliente recebe "pedido recebido", não "confirmado"', async () => {
    const s = await setup()
    expect(
      (await s.agent.put('/api/tenant/booking-rules', { ...RULES, requireConfirmation: true }))
        .statusCode,
    ).toBe(200)
    const r = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt, {
        customerEmail: 'ana@x.com',
      }),
    )
    expect(r.statusCode).toBe(201)
    expect(r.json().status).toBe('pending')
    const jobs = await prisma.notificationJob.findMany({
      where: { bookingId: r.json().id, kind: 'customer_confirmation' },
    })
    const bodies = jobs.map(
      (j) => (j.payload as { body?: string }).body ?? JSON.stringify(j.payload),
    )
    expect(bodies.some((b: string) => /está confirmado/.test(b))).toBe(false)
    expect(
      await prisma.notificationJob.count({
        where: { bookingId: r.json().id, kind: 'customer_pending' },
      }),
    ).toBeGreaterThan(0)
    expect(
      await prisma.notificationJob.count({
        where: { bookingId: r.json().id, kind: { startsWith: 'customer_reminder' } },
      }),
    ).toBe(0)
  })

  it('T2 dona aprova o pedido: a cliente recebe a confirmação e o lembrete é agendado', async () => {
    const s = await setup()
    await s.agent.put('/api/tenant/booking-rules', { ...RULES, requireConfirmation: true })
    const r = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt, {
        customerEmail: 'ana@x.com',
      }),
    )
    const id = r.json().id
    const before = await prisma.notificationJob.count({ where: { bookingId: id } })
    const st = await s.agent.patch(`/api/bookings/${id}/status`, { status: 'confirmed' })
    expect(st.statusCode).toBe(200)
    const after = await prisma.notificationJob.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'asc' },
    })
    expect(after.length).toBeGreaterThan(before)
    expect(after.some((j) => j.kind === 'customer_confirmation')).toBe(true)
    expect(
      after.some((j) => j.kind === 'customer_reminder_email' || j.kind === 'customer_reminder'),
    ).toBe(true)
  })

  it('T3 máquina de estados: concluído não volta a confirmado', async () => {
    const s = await setup()
    const r = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt),
    )
    const id = r.json().id
    const past = new Date(Date.now() - 3 * 86_400_000)
    await prisma.booking.update({
      where: { id },
      data: {
        startsAt: past,
        endsAt: new Date(past.getTime() + 3600e3),
        blockedUntil: new Date(past.getTime() + 3600e3),
      },
    })
    const a = await s.agent.patch(`/api/bookings/${id}/status`, { status: 'completed' })
    const b = await s.agent.patch(`/api/bookings/${id}/status`, { status: 'confirmed' })
    const c = await s.agent.patch(`/api/bookings/${id}/status`, { status: 'no_show' })
    const d = await s.agent.patch(`/api/bookings/${id}/status`, { status: 'completed' })
    // Concluído e falta podem ser trocados (corrigir engano); voltar a "confirmado", não
    expect([a.statusCode, b.statusCode, c.statusCode, d.statusCode]).toEqual([200, 400, 200, 200])
  })

  it('T4 importação CSV ignora e-mail inválido e grava em minúsculas', async () => {
    const { agent, tenant } = await createOwner()
    const res = await agent.post('/api/customers/import', {
      csv: 'Nome;WhatsApp;E-mail\nAna;85991234567;nao tem email\nBia;85991234568;BIA@X.COM',
    })
    expect(res.json().errors.join(' ')).toContain('ignorado')
    const cs = await prisma.customer.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: 'asc' },
    })
    expect(cs.map((c) => c.email)).toEqual([null, 'bia@x.com'])
    expect(
      cs.every(
        (c) =>
          c.email === null ||
          (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) && c.email === c.email.toLowerCase()),
      ),
    ).toBe(true)
  })

  it('T5 limite de 5 reservas/hora por telefone vale com requisições simultâneas', async () => {
    const s = await setup()
    const phone = '(85) 99777-1111'
    const res = await Promise.all(
      s.slots
        .slice(0, 8)
        .map((sl) =>
          book(
            s.app,
            s.slug,
            bookingPayload(s.service.id, s.professional.id, sl.startsAt, { customerPhone: phone }),
          ),
        ),
    )
    const ok = res.filter((r) => r.statusCode === 201).length
    expect(ok).toBeLessThanOrEqual(5)
  })

  it('T6 mesmo link de redefinir senha usado 2x em paralelo: só uma troca passa', async () => {
    const { email } = await createOwner()
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    const token = 'tok-' + 'a'.repeat(40)
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600e3),
      },
    })
    const app = await getApp()
    const mk = (p: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token, password: p },
        remoteAddress: ip(),
      })
    const [r1, r2] = await Promise.all([mk('senhaUm12345'), mk('senhaDois12345')])
    expect([r1.statusCode, r2.statusCode].filter((c) => c < 300).length).toBe(1)
  })

  it('T7 convite com "criar agenda": profissional nasce com expediente e serviços', async () => {
    const { agent, tenant } = await createOwner()
    const r = await agent.post('/api/team/members', {
      name: 'Júlia',
      email: 'julia@t.com',
      role: 'professional',
      createProfessional: true,
    })
    expect(r.statusCode).toBe(201)
    const p = await prisma.professional.findFirstOrThrow({
      where: { tenantId: tenant.id, name: 'Júlia' },
    })
    const wh = await prisma.workingHours.count({ where: { professionalId: p.id } })
    const sv = await prisma.professionalService.count({ where: { professionalId: p.id } })
    const viaPost = await agent.post('/api/team/professionals', {
      name: 'Carla',
      serviceIds: [],
      active: true,
    })
    expect(viaPost.statusCode).toBe(201)
    // Convite com agenda nasce igual ao cadastro pela equipe: expediente e serviços
    expect(wh).toBeGreaterThan(0)
    expect(sv).toBeGreaterThan(0)
  })

  it('T8 agenda bloqueada: a cliente não remarca pelo link', async () => {
    const s = await setup()
    const r = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt),
    )
    const token = r.json().token
    await prisma.subscription.update({
      where: { tenantId: s.tenant.id },
      data: {
        status: 'past_due',
        trialEndsAt: new Date(Date.now() - 20 * 86_400_000),
        currentPeriodEnd: null,
      },
    })
    const pub = await s.app.inject({ method: 'GET', url: `/api/public/t/${s.slug}` })
    expect(pub.json().available).toBe(false)
    const rs = await s.app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/reschedule`,
      payload: { startsAt: s.slots[3]!.startsAt },
      remoteAddress: ip(),
    })
    expect(rs.statusCode).toBe(403)
  })

  it('T9 profissional não vê as folgas das colegas', async () => {
    const s = await setup()
    const other = await prisma.professional.create({
      data: { tenantId: s.tenant.id, name: 'Colega' },
    })
    const from = new Date(Date.now() + 86_400_000),
      to = new Date(Date.now() + 2 * 86_400_000)
    await prisma.timeOff.create({
      data: {
        tenantId: s.tenant.id,
        professionalId: other.id,
        startsAt: from,
        endsAt: to,
        reason: 'Consulta médica particular',
      },
    })
    const prof = await loginAsProfessional(s.agent, 'julia2@t.com')
    const cal = await prof.get(
      `/api/bookings/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 5 * 86_400_000).toISOString()}`,
    )
    const leaks = cal
      .json()
      .timeOffs.filter((t: { professionalId: string }) => t.professionalId === other.id)
    expect(leaks.length).toBe(0)
  })

  it('T10 desativar profissional com agendamentos futuros é recusado', async () => {
    const s = await setup()
    await book(s.app, s.slug, bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt))
    const outra = await s.agent.post('/api/team/professionals', {
      name: 'Outra',
      serviceIds: [s.service.id],
      active: true,
    })
    expect(outra.statusCode).toBe(201)
    const r = await s.agent.put(`/api/team/professionals/${s.professional.id}`, {
      name: s.professional.name,
      serviceIds: [s.service.id],
      active: false,
    })
    expect(r.statusCode).toBe(409)
  })

  it('T5b limite 5/h por telefone com 8 reservas simultâneas em horários que não se sobrepõem', async () => {
    const o = await createOwner()
    const app = await getApp()
    const service = await prisma.service.findFirstOrThrow({
      where: { tenantId: o.tenant.id, name: 'Manicure simples' },
    })
    const picks: string[] = []
    for (let i = 1; i <= 14 && picks.length < 8; i++) {
      const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
      const r = await app.inject({
        method: 'GET',
        url: `/api/public/t/${o.slug}/slots?serviceId=${service.id}&professionalId=${o.professional.id}&date=${date}`,
      })
      const s = r.json().slots as Array<{ startsAt: string }>
      if (s.length) picks.push(s[0]!.startsAt)
    }
    let n = 0
    const res = await Promise.all(
      picks.map((st) =>
        app.inject({
          method: 'POST',
          url: `/api/public/t/${o.slug}/bookings`,
          payload: bookingPayload(service.id, o.professional.id, st, {
            customerPhone: '(85) 99777-1111',
          }),
          remoteAddress: `10.88.0.${++n}`,
        }),
      ),
    )
    const ok = res.filter((r) => r.statusCode === 201).length
    expect(ok).toBeLessThanOrEqual(5)
  })
})

describe('REVISAO banca 2 (hacker e usuário confuso)', () => {
  it('push: só aceita endereços dos serviços de push dos navegadores', async () => {
    const { agent } = await createOwner()
    const keys = { p256dh: 'x'.repeat(20), auth: 'y'.repeat(10) }
    for (const endpoint of [
      'http://localhost:8080/interno',
      'https://169.254.169.254/latest',
      'https://fcm.googleapis.com.evil.com/x',
    ]) {
      const r = await agent.post('/api/notifications/push/subscribe', { endpoint, keys })
      expect(r.statusCode).toBe(400)
    }
    const ok = await agent.post('/api/notifications/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys,
    })
    expect(ok.statusCode).toBeLessThan(300)
  })

  it('turno com fim antes do início (18:00–08:00) é recusado', async () => {
    const { agent, professional } = await createOwner()
    const r = await agent.put('/api/schedule/working-hours', {
      professionalId: professional.id,
      shifts: [{ weekday: 2, start: '18:00', end: '08:00' }],
    })
    expect(r.statusCode).toBe(400)
  })

  it('bloqueio em cima de agendamentos avisa antes e só cria com confirmação', async () => {
    const s = await setup()
    const b = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt),
    )
    const startsAt = new Date(new Date(b.json().startsAt).getTime() - 3600e3).toISOString()
    const endsAt = new Date(new Date(b.json().startsAt).getTime() + 3 * 3600e3).toISOString()
    const first = await s.agent.post('/api/schedule/time-off', {
      professionalId: s.professional.id,
      startsAt,
      endsAt,
    })
    expect(first.statusCode).toBe(409)
    expect(first.json().error).toBe('AGENDAMENTOS_NO_PERIODO')
    const again = await s.agent.post('/api/schedule/time-off', {
      professionalId: s.professional.id,
      startsAt,
      endsAt,
      confirmConflicts: true,
    })
    expect(again.statusCode).toBe(201)
  })

  it('remarcar 3x igual ao mesmo tempo pelo link gera um único aviso', async () => {
    const s = await setup()
    const b = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt),
    )
    const token = b.json().token
    const target = s.slots.at(-1)!.startsAt
    const res = await Promise.all(
      [1, 2, 3].map(() =>
        s.app.inject({
          method: 'POST',
          url: `/api/public/bookings/${token}/reschedule`,
          payload: { startsAt: target },
          remoteAddress: ip(),
        }),
      ),
    )
    expect(res.filter((r) => r.statusCode === 200).length).toBeGreaterThanOrEqual(1)
    const avisos = await prisma.notification.count({
      where: { bookingId: b.json().id, type: 'booking_rescheduled' },
    })
    expect(avisos).toBe(1)
  })

  it('confirmar presença 3x ao mesmo tempo gera um único aviso', async () => {
    const s = await setup()
    const b = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt),
    )
    await Promise.all(
      [1, 2, 3].map(() =>
        s.app.inject({
          method: 'POST',
          url: `/api/public/bookings/${b.json().token}/confirm`,
          remoteAddress: ip(),
        }),
      ),
    )
    expect(
      await prisma.notification.count({
        where: { bookingId: b.json().id, type: 'booking_confirmed' },
      }),
    ).toBe(1)
  })

  it('profissional não lista a base inteira na busca do agendamento manual', async () => {
    const s = await setup()
    await s.agent.post('/api/customers', { name: 'Ana Cliente Antiga', phone: '(85) 98888-1111' })
    const pro = await loginAsProfessional(s.agent, `busca-${Date.now()}@t.com`)
    const r = await pro.get('/api/bookings/customer-search?q=Ana')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(0)
    expect((await s.agent.get('/api/bookings/customer-search?q=Ana')).json()).toHaveLength(1)
  })

  it('reserva com o telefone de alguém não revela o nome cadastrado nem grava consentimento', async () => {
    const s = await setup()
    await s.agent.post('/api/customers', { name: 'Vítima Verdadeira', phone: '(85) 98888-2222' })
    const b = await book(
      s.app,
      s.slug,
      bookingPayload(s.service.id, s.professional.id, s.slots[0]!.startsAt, {
        customerName: 'Curioso',
        customerPhone: '(85) 98888-2222',
      }),
    )
    const area = await s.app.inject({
      method: 'GET',
      url: `/api/public/bookings/${b.json().token}`,
    })
    expect(area.json().customerName).toBe('Curioso')
    const c = await prisma.customer.findFirstOrThrow({
      where: { tenantId: s.tenant.id, phone: '5585988882222' },
    })
    expect(c.consentAt).toBeNull()
  })

  it('modo suporte: bloqueia exportar e mexer na cobrança, audita o admin e avisa a dona', async () => {
    const owner = await createOwner()
    const app = await getApp()
    const bcrypt = await import('bcryptjs')
    await prisma.user.create({
      data: {
        email: 'suporte@marcai.app',
        name: 'Suporte',
        passwordHash: await bcrypt.hash('admin12345', 4),
        isSuperAdmin: true,
      },
    })
    const admin = new TestAgent(app)
    await admin.post('/api/auth/login', { email: 'suporte@marcai.app', password: 'admin12345' })
    const c = (
      await owner.agent.post('/api/customers', { name: 'Cliente X', phone: '(85) 98888-3333' })
    ).json()
    expect((await admin.post(`/api/admin/tenants/${owner.tenant.id}/impersonate`)).statusCode).toBe(
      200,
    )
    expect((await admin.get('/api/customers/export.csv')).statusCode).toBe(403)
    expect(
      (await admin.post('/api/billing/subscribe', { plan: 'pro', billingType: 'PIX' })).statusCode,
    ).toBe(403)
    expect(
      (
        await admin.post('/api/team/members', {
          name: 'Intrusa',
          email: 'intrusa@x.com',
          role: 'owner',
        })
      ).statusCode,
    ).toBe(403)
    expect((await admin.delete(`/api/customers/${c.id}`)).statusCode).toBe(200)
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: owner.tenant.id, action: 'customer.deleted' },
    })
    expect(log.impersonatorId).toBeTruthy()
    expect(
      await prisma.notificationJob.count({
        where: { tenantId: owner.tenant.id, kind: 'support_access' },
      }),
    ).toBe(1)
  })

  it('trocar o endereço da página: o antigo continua levando para cá e fica reservado', async () => {
    const { agent, slug } = await createOwner()
    const novo = `${slug}-novo`
    expect((await agent.put('/api/tenant/slug', { slug: novo })).statusCode).toBe(200)
    const app = await getApp()
    const old = await app.inject({ method: 'GET', url: `/api/public/t/${slug}` })
    expect(old.statusCode).toBe(200)
    expect(old.json().slug).toBe(novo)
    const other = await createOwner()
    expect((await other.agent.put('/api/tenant/slug', { slug })).statusCode).toBe(403)
  })

  it('convite para conta que já existe fica pendente até a pessoa aceitar', async () => {
    const a = await createOwner()
    const b = await createOwner()
    const r = await a.agent.post('/api/team/members', {
      name: 'Dona B',
      email: b.email,
      role: 'professional',
    })
    expect(r.statusCode).toBe(201)
    let me = (await b.agent.get('/api/auth/me')).json()
    expect(me.memberships).toHaveLength(1)
    expect(me.invites.map((i: { tenantId: string }) => i.tenantId)).toEqual([a.tenant.id])
    expect(
      (await b.agent.post('/api/auth/switch-tenant', { tenantId: a.tenant.id })).statusCode,
    ).toBe(403)
    expect((await b.agent.post(`/api/auth/invites/${a.tenant.id}/accept`)).statusCode).toBe(200)
    me = (await b.agent.get('/api/auth/me')).json()
    expect(me.memberships).toHaveLength(2)
    expect(me.activeTenantId).toBe(a.tenant.id)
  })

  it('foto de referência: privada, sem acesso de outro estabelecimento, e só a do próprio vale', async () => {
    const s = await setup()
    // JPEG mínimo com um bloco EXIF (APP1) que precisa sumir
    const exif = Buffer.from([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00])
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      exif,
      Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
    ])
    const boundary = 'xx'
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      jpeg,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const up = await s.app.inject({
      method: 'POST',
      url: `/api/public/t/${s.slug}/uploads`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(up.statusCode).toBe(201)
    const url = up.json().url as string
    expect(url.startsWith('/api/uploads/private/')).toBe(true)
    // Não é pública
    expect((await s.app.inject({ method: 'GET', url })).statusCode).toBe(401)
    // A equipe do próprio estabelecimento vê, sem o EXIF
    const mine = await s.agent.get(url)
    expect(mine.statusCode).toBe(200)
    expect(mine.rawPayload.includes(Buffer.from('Exif'))).toBe(false)
    // Outro estabelecimento não vê
    const other = await createOwner()
    expect((await other.agent.get(url)).statusCode).toBe(404)
  })
})
