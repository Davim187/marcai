import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { bookingPayload, createOwner, fakePhone, getApp, nextFreeSlots } from './helpers'

async function setup() {
  const owner = await createOwner({ businessType: 'manicure' })
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: owner.tenant.id, name: 'Manicure simples' },
  })
  return { ...owner, service }
}

describe('página pública e reserva', () => {
  it('mostra o perfil público com serviços, profissionais e perguntas', async () => {
    const { slug } = await setup()
    const app = await getApp()
    const res = await app.inject({ method: 'GET', url: `/api/public/t/${slug}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.available).toBe(true)
    expect(body.services.length).toBeGreaterThan(0)
    expect(body.professionals).toHaveLength(1)
    expect(body.fields.map((f: { label: string }) => f.label)).toContain('Tipo de unha')
  })

  it('cria o agendamento, deduplica a cliente pelo telefone e tira o horário da agenda', async () => {
    const { slug, service, professional, tenant } = await setup()
    const app = await getApp()
    const { date, slots } = await nextFreeSlots(slug, service.id, professional.id)
    const phone = '(85) 99999-1234'
    const fields = await prisma.formField.findMany({
      where: { tenantId: tenant.id },
      include: { options: true },
    })
    const tipo = fields.find((f) => f.label === 'Tipo de unha')!
    const manut = fields.find((f) => f.label === 'É manutenção?')!
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, slots[0]!.startsAt, {
        customerPhone: phone,
        answers: [
          { fieldId: tipo.id, value: 'Quadrada' },
          { fieldId: manut.id, value: true },
        ],
      }),
    })
    expect(res.statusCode).toBe(201)
    const b = res.json()
    expect(b.manageUrl).toContain('/a/')
    expect(b.googleCalendarUrl).toContain('calendar.google.com')

    // O horário some da lista
    const after = await app.inject({
      method: 'GET',
      url: `/api/public/t/${slug}/slots?serviceId=${service.id}&professionalId=${professional.id}&date=${date}`,
    })
    expect(after.json().slots.map((s: { startsAt: string }) => s.startsAt)).not.toContain(
      slots[0]!.startsAt,
    )

    // Segunda reserva com o mesmo telefone reaproveita a cliente
    await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, slots.at(-1)!.startsAt, {
        customerPhone: '85999991234',
        customerName: 'Ana S.',
      }),
    })
    const customers = await prisma.customer.findMany({ where: { tenantId: tenant.id } })
    expect(customers).toHaveLength(1)
    expect(customers[0]!.phone).toBe('5585999991234')
    const answers = await prisma.bookingFieldAnswer.findMany({ where: { bookingId: b.id } })
    expect(answers.map((a) => a.value)).toEqual(expect.arrayContaining(['Quadrada', true]))

    // .ics
    const ics = await app.inject({ method: 'GET', url: `/api/public/bookings/${b.token}/ics` })
    expect(ics.headers['content-type']).toContain('text/calendar')
    expect(ics.body).toContain('BEGIN:VEVENT')
  })

  it('CONCORRÊNCIA: duas clientes no mesmo horário ao mesmo tempo → só uma consegue', async () => {
    const { slug, service, professional, tenant } = await setup()
    const app = await getApp()
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const startsAt = slots[1]!.startsAt
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: `/api/public/t/${slug}/bookings`,
          payload: bookingPayload(service.id, professional.id, startsAt),
        }),
      ),
    )
    const ok = attempts.filter((r) => r.statusCode === 201)
    const conflicts = attempts.filter((r) => r.statusCode === 409)
    expect(ok).toHaveLength(1)
    expect(conflicts).toHaveLength(5)
    expect(conflicts[0]!.json().message).toBe('Esse horário acabou de ser reservado, escolha outro')
    expect(await prisma.booking.count({ where: { tenantId: tenant.id } })).toBe(1)
  })

  it('CONCORRÊNCIA: horários diferentes que se sobrepõem também são barrados pelo banco', async () => {
    const { slug, professional, tenant } = await setup()
    const app = await getApp()
    const longService = await prisma.service.findFirstOrThrow({
      where: { tenantId: tenant.id, name: 'Alongamento em gel' },
    }) // 120 min
    const { slots } = await nextFreeSlots(slug, longService.id, professional.id)
    // 08:00 (120min) e 08:30 se sobrepõem; os dois aparecem livres antes da corrida.
    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/public/t/${slug}/bookings`,
        payload: bookingPayload(longService.id, professional.id, slots[0]!.startsAt),
      }),
      app.inject({
        method: 'POST',
        url: `/api/public/t/${slug}/bookings`,
        payload: bookingPayload(longService.id, professional.id, slots[1]!.startsAt),
      }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])
  })

  it('a constraint do banco impede sobreposição mesmo sem passar pela API', async () => {
    const { tenant, professional, service } = await setup()
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, name: 'X', phone: '5585999990000' },
    })
    const base = {
      tenantId: tenant.id,
      professionalId: professional.id,
      serviceId: service.id,
      customerId: customer.id,
      serviceName: 'X',
      durationMinutes: 60,
      priceCents: 100,
      status: 'confirmed' as const,
    }
    await prisma.booking.create({
      data: {
        ...base,
        cancelToken: 'a',
        startsAt: new Date('2031-01-01T12:00Z'),
        endsAt: new Date('2031-01-01T13:00Z'),
        blockedUntil: new Date('2031-01-01T13:00Z'),
      },
    })
    await expect(
      prisma.booking.create({
        data: {
          ...base,
          cancelToken: 'b',
          startsAt: new Date('2031-01-01T12:30Z'),
          endsAt: new Date('2031-01-01T13:30Z'),
          blockedUntil: new Date('2031-01-01T13:30Z'),
        },
      }),
    ).rejects.toThrow()
    // Encostado (13:00) pode; cancelado não bloqueia.
    await prisma.booking.create({
      data: {
        ...base,
        cancelToken: 'c',
        startsAt: new Date('2031-01-01T13:00Z'),
        endsAt: new Date('2031-01-01T14:00Z'),
        blockedUntil: new Date('2031-01-01T14:00Z'),
      },
    })
    await prisma.booking.create({
      data: {
        ...base,
        status: 'canceled',
        cancelToken: 'd',
        startsAt: new Date('2031-01-01T12:00Z'),
        endsAt: new Date('2031-01-01T13:00Z'),
        blockedUntil: new Date('2031-01-01T13:00Z'),
      },
    })
  })

  it('recusa horário fora do expediente e respostas obrigatórias faltando', async () => {
    const { slug, service, professional, tenant } = await setup()
    const app = await getApp()
    const outside = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, '2030-01-01T05:00:00.000Z'),
    })
    expect(outside.statusCode).toBe(409)
    await prisma.formField.updateMany({
      where: { tenantId: tenant.id, label: 'Tipo de unha' },
      data: { required: true },
    })
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const missing = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, slots[0]!.startsAt),
    })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().message).toBe('Responda as perguntas obrigatórias.')
  })

  it('valida o celular brasileiro e exige consentimento (LGPD)', async () => {
    const { slug, service, professional } = await setup()
    const app = await getApp()
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: bookingPayload(service.id, professional.id, slots[0]!.startsAt, {
        customerPhone: '(85) 3333-4444',
        consent: false,
      }),
    })
    expect(res.statusCode).toBe(400)
    expect(Object.keys(res.json().fields)).toEqual(
      expect.arrayContaining(['customerPhone', 'consent']),
    )
  })

  it('honeypot: robô recebe sucesso falso e nada é gravado', async () => {
    const { slug, service, professional, tenant } = await setup()
    const app = await getApp()
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/t/${slug}/bookings`,
      payload: {
        ...bookingPayload(service.id, professional.id, slots[0]!.startsAt),
        website: 'http://spam',
      },
    })
    expect(res.statusCode).toBe(201)
    expect(await prisma.booking.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it('rate limiting por IP e por telefone', async () => {
    const { slug, service, professional } = await setup()
    const app = await getApp()
    const { slots } = await nextFreeSlots(slug, service.id, professional.id)
    const phone = fakePhone()
    const results: number[] = []
    for (let i = 0; i < 7; i++) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/public/t/${slug}/bookings`,
        payload: bookingPayload(service.id, professional.id, slots[i * 2]!.startsAt, {
          customerPhone: phone,
        }),
      })
      results.push(r.statusCode)
    }
    expect(results.slice(0, 5).every((s) => s === 201)).toBe(true)
    expect(results[5]).toBe(429)

    let limited = false
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/public/t/${slug}/bookings`,
        headers: { 'x-test-rate-limit': '1' },
        payload: {},
      })
      if (r.statusCode === 429) limited = true
    }
    expect(limited).toBe(true)
  })
})
