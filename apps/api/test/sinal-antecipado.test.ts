import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { expireOverduePrepayments } from '../src/modules/prepayment/prepayment.service'
import { bookingPayload, createOwner, getApp, nextFreeSlots } from './helpers'

// PNG 1x1 válido (comprovante de mentira)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

function multipart(buffer: Buffer, filename = 'c.png', type = 'image/png') {
  const boundary = '----marcai-test'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

async function setup(percent = 50) {
  const o = await createOwner()
  const rules = await o.agent.put('/api/tenant/booking-rules', {
    minAdvanceMinutes: 0,
    maxAdvanceDays: 30,
    slotIntervalMinutes: 30,
    cancelMinHours: 12,
    requireConfirmation: false,
    reminderHours: 24,
    dailySummaryEnabled: false,
    loadHolidays: false,
    requirePrepayment: true,
    prepaymentPercent: percent,
    prepaymentMethod: 'pix_manual',
    prepaymentHoldMinutes: 30,
    pixKey: 'pix@exemplo.com',
    pixKeyHolder: 'Studio Teste',
  })
  expect(rules.statusCode).toBe(200)
  expect(rules.json().mpAccessTokenEnc).toBeUndefined()
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const app = await getApp()
  const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  const res = await app.inject({
    method: 'POST',
    url: `/api/public/t/${o.slug}/bookings`,
    payload: bookingPayload(service.id, o.professional.id, slots[0]!.startsAt),
  })
  expect(res.statusCode).toBe(201)
  return { ...o, app, service, booking: res.json() }
}

describe('sinal antecipado (PIX com comprovante)', () => {
  it('exige chave PIX para ligar', async () => {
    const o = await createOwner()
    const r = await o.agent.put('/api/tenant/booking-rules', {
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 30,
      cancelMinHours: 12,
      requireConfirmation: false,
      reminderHours: 24,
      dailySummaryEnabled: false,
      loadHolidays: false,
      requirePrepayment: true,
      prepaymentMethod: 'pix_manual',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().code).toBe('PIX_SEM_CHAVE')
  })

  it('reserva fica pendente com o PIX do sinal, comprovante e aprovação confirmam', async () => {
    const { app, agent, booking, service } = await setup(50)
    expect(booking.status).toBe('pending')
    expect(booking.payment.status).toBe('awaiting_payment')
    expect(booking.payment.amountCents).toBe(Math.ceil(service.priceCents / 2))
    expect(booking.payment.pix.copyPaste).toMatch(/^000201.*6304[0-9A-F]{4}$/)

    // "Confirmar presença" não pula o pagamento
    await app.inject({ method: 'POST', url: `/api/public/bookings/${booking.token}/confirm` })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'pending',
    )

    const up = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${booking.token}/payment/proof`,
      ...multipart(PNG),
    })
    expect(up.statusCode).toBe(200)
    expect(up.json().payment.status).toBe('under_review')

    const detail = (await agent.get(`/api/bookings/${booking.id}`)).json()
    expect(detail.payment.proofUrl).toMatch(/^\/api\/uploads\/private\//)
    const img = await agent.get(detail.payment.proofUrl)
    expect(img.statusCode).toBe(200)

    const ok = await agent.post(`/api/bookings/${booking.id}/payment/approve`)
    expect(ok.statusCode).toBe(200)
    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payment: true },
    })
    expect(after.status).toBe('confirmed')
    expect(after.payment?.status).toBe('paid')
  })

  it('usa a porcentagem escolhida pelo estabelecimento', async () => {
    const { booking, service } = await setup(30)
    expect(booking.payment.percent).toBe(30)
    expect(booking.payment.amountCents).toBe(Math.ceil((service.priceCents * 30) / 100))
  })

  it('recusa porcentagem fora da faixa', async () => {
    const o = await createOwner()
    const base = {
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 30,
      cancelMinHours: 12,
      requireConfirmation: false,
      reminderHours: 24,
      dailySummaryEnabled: false,
      loadHolidays: false,
      requirePrepayment: true,
      prepaymentMethod: 'pix_manual',
      pixKey: 'pix@exemplo.com',
      pixKeyHolder: 'Studio Teste',
    }
    for (const prepaymentPercent of [5, 101, 33.5]) {
      const r = await o.agent.put('/api/tenant/booking-rules', { ...base, prepaymentPercent })
      expect(r.statusCode).toBe(400)
    }
  })

  it('aceita comprovante em PDF e serve como application/pdf isolado', async () => {
    const { app, agent, booking } = await setup()
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
    const up = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${booking.token}/payment/proof`,
      ...multipart(pdf, 'c.pdf', 'application/pdf'),
    })
    expect(up.statusCode).toBe(200)
    const detail = (await agent.get(`/api/bookings/${booking.id}`)).json()
    expect(detail.payment.proofUrl).toMatch(/\.pdf$/)
    const file = await agent.get(detail.payment.proofUrl)
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('application/pdf')
    expect(String(file.headers['content-security-policy'])).toContain('sandbox')
  })

  it('recusa comprovante que não é PDF nem imagem', async () => {
    const { app, booking } = await setup()
    const up = await app.inject({
      method: 'POST',
      url: `/api/public/bookings/${booking.token}/payment/proof`,
      ...multipart(Buffer.from('<html>oi</html>'), 'c.html', 'text/html'),
    })
    expect(up.statusCode).toBe(400)
  })

  it('recusar o comprovante cancela e libera o horário', async () => {
    const { agent, booking } = await setup(100)
    const r = await agent.post(`/api/bookings/${booking.id}/payment/reject`, {
      reason: 'Valor não caiu',
    })
    expect(r.statusCode).toBe(200)
    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payment: true },
    })
    expect(after.status).toBe('canceled')
    expect(after.payment?.status).toBe('rejected')
  })

  it('sem pagamento no prazo, o horário é liberado', async () => {
    const { booking } = await setup()
    await prisma.bookingPayment.update({
      where: { bookingId: booking.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    await expireOverduePrepayments()
    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payment: true },
    })
    expect(after.status).toBe('canceled')
    expect(after.payment?.status).toBe('expired')
  })
})
