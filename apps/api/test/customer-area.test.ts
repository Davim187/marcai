import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { bookingPayload, createOwner, getApp, nextFreeSlots } from './helpers'

async function setup(cancelMinHours = 12) {
  const o = await createOwner()
  await prisma.tenant.update({
    where: { id: o.tenant.id },
    data: { cancelMinHours, notifyPhone: '5585988880000' },
  })
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const app = await getApp()
  const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  // Usa um horário de daqui a alguns dias para respeitar a política
  const later = await (async () => {
    for (let i = 3; i <= 10; i++) {
      const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
      const r = await app.inject({
        method: 'GET',
        url: `/api/public/t/${o.slug}/slots?serviceId=${service.id}&professionalId=${o.professional.id}&date=${date}`,
      })
      if (r.json().slots.length > 4) return r.json().slots as Array<{ startsAt: string }>
    }
    throw new Error('sem horários')
  })()
  const res = await app.inject({
    method: 'POST',
    url: `/api/public/t/${o.slug}/bookings`,
    payload: bookingPayload(service.id, o.professional.id, later[0]!.startsAt),
  })
  return { ...o, app, service, token: res.json().token as string, later, slots }
}

describe('área da cliente (link com token)', () => {
  it('mostra os detalhes e confirma presença', async () => {
    const { app, token, agent } = await setup()
    const d = await app.inject({ method: 'GET', url: `/api/public/bookings/${token}` })
    expect(d.statusCode).toBe(200)
    expect(d.json().canChange).toBe(true)
    expect(d.json().customerName).toBe('Ana')
    const c = await app.inject({ method: 'POST', url: `/api/public/bookings/${token}/confirm` })
    expect(c.statusCode).toBe(200)
    expect(
      (await app.inject({ method: 'GET', url: `/api/public/bookings/${token}` })).json()
        .customerConfirmedAt,
    ).toBeTruthy()
    const n = (await agent.get('/api/notifications')).json()
    expect(n.items.some((x: { title: string }) => x.title.startsWith('Presença confirmada'))).toBe(
      true,
    )
  })

  it('remarca para outro horário livre e o antigo volta a ficar disponível', async () => {
    const { app, token, later, slug, service, professional } = await setup()
    const r = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/reschedule`,
      payload: { startsAt: later.at(-1)!.startsAt },
    })
    expect(r.statusCode).toBe(200)
    const date = later[0]!.startsAt.slice(0, 10)
    const s = await app.inject({
      method: 'GET',
      url: `/api/public/t/${slug}/slots?serviceId=${service.id}&professionalId=${professional.id}&date=${date}`,
    })
    expect(s.json().slots.map((x: { startsAt: string }) => x.startsAt)).toContain(
      later[0]!.startsAt,
    )
  })

  it('cancela pelo link, avisa a profissional e cancela o lembrete', async () => {
    const { app, token } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/cancel`,
      payload: { reason: 'Imprevisto' },
    })
    expect(res.statusCode).toBe(200)
    const booking = await prisma.booking.findUniqueOrThrow({ where: { cancelToken: token } })
    expect(booking.status).toBe('canceled')
    expect(booking.canceledBy).toBe('customer')
    const reminder = await prisma.notificationJob.findFirst({
      where: { bookingId: booking.id, kind: 'customer_reminder' },
    })
    expect(reminder?.status).toBe('canceled')
    const msg = await prisma.notificationJob.findFirstOrThrow({
      where: { bookingId: booking.id, kind: 'professional_booking_canceled' },
    })
    expect((msg.payload as { body: string }).body).toContain('Imprevisto')
  })

  it('respeita a política: não deixa cancelar perto do horário', async () => {
    const { app, token } = await setup(24 * 14)
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${token}/cancel`,
      payload: {},
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('Fale direto')
  })

  it('token inválido não revela nada', async () => {
    const app = await getApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/public/bookings/token-que-nao-existe-123`,
    })
    expect(res.statusCode).toBe(404)
  })
})
