import { describe, expect, it } from 'vitest'
import { WEEK_MS } from '@marcai/shared'
import { prisma } from '../src/lib/prisma'
import { extendActiveSeries } from '../src/modules/booking/series.service'
import { bookingPayload, createOwner, getApp, nextFreeSlots, type TestAgent } from './helpers'

const RULES = {
  minAdvanceMinutes: 0,
  maxAdvanceDays: 30,
  slotIntervalMinutes: 30,
  cancelMinHours: 12,
  requireConfirmation: false,
  reminderHours: 24,
  dailySummaryEnabled: false,
  loadHolidays: false,
}

async function setRules(agent: TestAgent, extra: Record<string, unknown> = {}) {
  const r = await agent.put('/api/tenant/booking-rules', { ...RULES, ...extra })
  expect(r.statusCode).toBe(200)
}

/** Terapeuta com horário fixo ligado (padrão das áreas de saúde) e 4 semanas à frente. */
async function setup(extra: Record<string, unknown> = {}) {
  const o = await createOwner({ businessType: 'massoterapia' })
  expect(o.tenant.recurringEnabled).toBe(true)
  await setRules(o.agent, { recurringWeeks: 4, ...extra })
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Massagem relaxante' },
  })
  const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  return { ...o, service, startsAt: slots[0]!.startsAt }
}

async function book(slug: string, payload: Record<string, unknown>) {
  const app = await getApp()
  return app.inject({ method: 'POST', url: `/api/public/t/${slug}/bookings`, payload })
}

describe('horário fixo semanal', () => {
  it('reserva o mesmo dia e horário nas próximas semanas', async () => {
    const { slug, service, professional, startsAt, tenant } = await setup()
    const pub = (
      await (await getApp()).inject({ method: 'GET', url: `/api/public/t/${slug}` })
    ).json()
    expect(pub.recurring).toEqual({ weeks: 4 })

    const res = await book(
      slug,
      bookingPayload(service.id, professional.id, startsAt, { recurring: true }),
    )
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.series.created.length + body.series.skipped.length).toBeGreaterThanOrEqual(4)
    expect(body.series.created[0]).toBe(new Date(startsAt).toISOString())

    const sessions = await prisma.booking.findMany({
      where: { tenantId: tenant.id },
      orderBy: { startsAt: 'asc' },
    })
    expect(sessions.length).toBe(body.series.created.length)
    const first = sessions[0]!
    for (const [i, s] of sessions.entries()) {
      expect(s.seriesId).toBe(first.seriesId)
      expect(s.status).toBe('confirmed')
      expect(s.cancelToken).not.toBe(i ? first.cancelToken : '')
      // Mesmo dia da semana e mesmo horário
      expect((s.startsAt.getTime() - first.startsAt.getTime()) % WEEK_MS).toBe(0)
    }
    // Um aviso só para a profissional (não um por sessão)
    const notes = await prisma.notification.findMany({ where: { tenantId: tenant.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0]!.title).toBe('Novo horário fixo semanal!')
  })

  it('pula a semana bloqueada e avisa quais não couberam', async () => {
    const { agent, slug, service, professional, startsAt, tenant } = await setup()
    const blocked = new Date(new Date(startsAt).getTime() + 2 * WEEK_MS)
    const off = await agent.post('/api/schedule/time-off', {
      professionalId: professional.id,
      startsAt: new Date(blocked.getTime() - 60_000).toISOString(),
      endsAt: new Date(blocked.getTime() + 3_600_000).toISOString(),
      reason: 'Congresso',
    })
    expect(off.statusCode).toBe(201)
    const body = (
      await book(slug, bookingPayload(service.id, professional.id, startsAt, { recurring: true }))
    ).json()
    expect(body.series.skipped).toContain(blocked.toISOString())
    const count = await prisma.booking.count({ where: { tenantId: tenant.id, startsAt: blocked } })
    expect(count).toBe(0)
  })

  it('recusa horário fixo desligado ou com sinal antecipado', async () => {
    const { agent, slug, service, professional, startsAt } = await setup()
    await setRules(agent, { recurringEnabled: false })
    const off = await book(
      slug,
      bookingPayload(service.id, professional.id, startsAt, { recurring: true }),
    )
    expect(off.statusCode).toBe(400)
    expect(off.json().error).toBe('FIXO_DESATIVADO')

    await setRules(agent, {
      recurringEnabled: true,
      requirePrepayment: true,
      prepaymentMethod: 'pix_manual',
      pixKey: 'pix@exemplo.com',
    })
    const pub = (
      await (await getApp()).inject({ method: 'GET', url: `/api/public/t/${slug}` })
    ).json()
    expect(pub.recurring).toBeNull()
    const prepay = await book(
      slug,
      bookingPayload(service.id, professional.id, startsAt, { recurring: true }),
    )
    expect(prepay.statusCode).toBe(400)
    expect(prepay.json().error).toBe('FIXO_COM_SINAL')
  })

  it('cliente encerra o horário fixo: cancela as próximas sessões com um aviso só', async () => {
    const { slug, service, professional, startsAt, tenant } = await setup()
    const app = await getApp()
    const { token } = (
      await book(slug, bookingPayload(service.id, professional.id, startsAt, { recurring: true }))
    ).json()
    const area = (await app.inject({ method: 'GET', url: `/api/public/bookings/${token}` })).json()
    expect(area.series.active).toBe(true)
    expect(area.series.upcoming.length).toBeGreaterThanOrEqual(2)

    const before = await prisma.notification.count({ where: { tenantId: tenant.id } })
    const end = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/end-series`,
    })
    expect(end.statusCode).toBe(200)
    expect(end.json().canceled).toBeGreaterThanOrEqual(1)

    const open = await prisma.booking.findMany({
      where: { tenantId: tenant.id, status: 'confirmed' },
    })
    // Só fica o que estava dentro do prazo de cancelamento (12h)
    for (const b of open) expect(b.startsAt.getTime()).toBeLessThan(Date.now() + 12 * 3_600_000)
    expect(await prisma.notification.count({ where: { tenantId: tenant.id } })).toBe(before + 1)

    // Depois de encerrado, a renovação não reserva mais nada
    const total = await prisma.booking.count({ where: { tenantId: tenant.id } })
    await extendActiveSeries(new Date(Date.now() + 3 * WEEK_MS))
    expect(await prisma.booking.count({ where: { tenantId: tenant.id } })).toBe(total)
  })

  it('a renovação mantém as semanas reservadas à frente', async () => {
    const { slug, service, professional, startsAt, tenant } = await setup()
    await book(slug, bookingPayload(service.id, professional.id, startsAt, { recurring: true }))
    const series = await prisma.bookingSeries.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const before = series.nextStartsAt
    await extendActiveSeries(new Date(Date.now() + 2 * WEEK_MS))
    const after = await prisma.bookingSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(after.nextStartsAt.getTime()).toBe(before.getTime() + 2 * WEEK_MS)
    // Rodar de novo no mesmo instante não duplica nada
    const count = await prisma.booking.count({ where: { tenantId: tenant.id } })
    await extendActiveSeries(new Date(Date.now() + 2 * WEEK_MS))
    expect(await prisma.booking.count({ where: { tenantId: tenant.id } })).toBe(count)
  })

  it('com confirmação manual: aprovar aprova a série; recusar recusa todas', async () => {
    const { agent, slug, service, professional, startsAt, tenant } = await setup({
      requireConfirmation: true,
    })
    const first = (
      await book(slug, bookingPayload(service.id, professional.id, startsAt, { recurring: true }))
    ).json()
    expect(first.status).toBe('pending')
    const ok = await agent.patch(`/api/bookings/${first.id}/status`, { status: 'confirmed' })
    expect(ok.statusCode).toBe(200)
    const statuses = await prisma.booking.findMany({
      where: { tenantId: tenant.id },
      select: { status: true },
    })
    expect(statuses.every((s) => s.status === 'confirmed')).toBe(true)

    // Outro cliente pede um horário fixo e é recusado
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const other = (
      await book(
        slug,
        bookingPayload(service.id, professional.id, slots[3]!.startsAt, { recurring: true }),
      )
    ).json()
    const no = await agent.patch(`/api/bookings/${other.id}/status`, {
      status: 'canceled',
      reason: 'Agenda cheia',
    })
    expect(no.statusCode).toBe(200)
    const otherSeries = await prisma.booking.findFirstOrThrow({ where: { id: other.id } })
    expect(
      await prisma.booking.count({
        where: { seriesId: otherSeries.seriesId, status: { not: 'canceled' } },
      }),
    ).toBe(0)
    const s = await prisma.bookingSeries.findUniqueOrThrow({
      where: { id: otherSeries.seriesId! },
    })
    expect(s.endedAt).not.toBeNull()
  })

  it('painel: cria horário fixo manual e encerra a partir de uma sessão', async () => {
    const { agent, service, professional, startsAt, tenant } = await setup()
    await setRules(agent, { recurringEnabled: false }) // pelo painel vale mesmo desligado
    const res = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt,
      customerName: 'Paciente Fixo',
      customerPhone: '(85) 98888-7777',
      recurring: true,
      notifyCustomer: false,
    })
    expect(res.statusCode).toBe(201)
    const sessions = await prisma.booking.findMany({
      where: { tenantId: tenant.id },
      orderBy: { startsAt: 'asc' },
    })
    expect(sessions.length).toBeGreaterThanOrEqual(3)

    const detail = (await agent.get(`/api/bookings/${sessions[1]!.id}`)).json()
    expect(detail.series.active).toBe(true)
    const end = await agent.post(`/api/bookings/${sessions[1]!.id}/end-series`)
    expect(end.statusCode).toBe(200)
    expect(end.json().canceled).toBe(sessions.length - 1)
    const firstNow = await prisma.booking.findUniqueOrThrow({ where: { id: sessions[0]!.id } })
    expect(firstNow.status).toBe('confirmed')
  })

  it('um horário fixo conta como um agendamento no limite por telefone', async () => {
    const { slug, service, professional, startsAt } = await setup()
    const phone = '(85) 97777-1234'
    const res = await book(
      slug,
      bookingPayload(service.id, professional.id, startsAt, {
        recurring: true,
        customerPhone: phone,
      }),
    )
    expect(res.statusCode).toBe(201)
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const again = await book(
      slug,
      bookingPayload(service.id, professional.id, slots[2]!.startsAt, { customerPhone: phone }),
    )
    expect(again.statusCode).toBe(201)
  })

  it('valida o número de semanas', async () => {
    const { agent } = await createOwner()
    const r = await agent.put('/api/tenant/booking-rules', { ...RULES, recurringWeeks: 5 })
    expect(r.statusCode).toBe(400)
  })
})
