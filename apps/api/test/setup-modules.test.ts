import { describe, expect, it } from 'vitest'
import { createOwner } from './helpers'

describe('onboarding e configurações', () => {
  it('onboarding de manicure pré-carrega serviços, campos e expediente', async () => {
    const { agent, professional } = await createOwner({ businessType: 'manicure' })
    const services = (await agent.get('/api/services')).json()
    expect(services.map((s: { name: string }) => s.name)).toContain('Alongamento em gel')
    expect(
      services.every((s: { professionalIds: string[] }) =>
        s.professionalIds.includes(professional.id),
      ),
    ).toBe(true)
    const fields = (await agent.get('/api/forms/fields')).json()
    expect(fields.map((f: { label: string }) => f.label)).toEqual([
      'Tipo de unha',
      'É manutenção?',
      'Quer decoração?',
      'Foto de referência',
    ])
    expect(fields[0].options.map((o: { label: string }) => o.label)).toContain('Stiletto')
    const schedule = (await agent.get(`/api/schedule?professionalId=${professional.id}`)).json()
    expect(schedule.workingHours).toHaveLength(10)
    expect(schedule.holidays.length).toBeGreaterThan(0)
  })

  it('checa a disponibilidade do link em tempo real', async () => {
    const { agent } = await createOwner({ slug: 'studiovertice' })
    const taken = (await agent.get('/api/tenant/slug-availability?slug=studiovertice')).json()
    // O próprio tenant pode manter o slug
    expect(taken.available).toBe(true)
    const { agent: other } = await createOwner()
    const res = (await other.get('/api/tenant/slug-availability?slug=Studio Vertice')).json()
    expect(res.slug).toBe('studio-vertice')
    const res2 = (await other.get('/api/tenant/slug-availability?slug=studiovertice')).json()
    expect(res2.available).toBe(false)
    expect(res2.suggestion).toBeTruthy()
    expect((await other.get('/api/tenant/slug-availability?slug=painel')).json().valid).toBe(false)
  })

  it('CRUD de serviços com soft delete', async () => {
    const { agent } = await createOwner()
    const created = await agent.post('/api/services', {
      name: 'Blindagem',
      durationMinutes: 40,
      priceCents: 4500,
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().id
    const upd = await agent.put(`/api/services/${id}`, {
      name: 'Blindagem de unha',
      durationMinutes: 45,
      priceCents: 5000,
      priceFrom: true,
    })
    expect(upd.statusCode).toBe(200)
    expect((await agent.delete(`/api/services/${id}`)).statusCode).toBe(200)
    const list = (await agent.get('/api/services')).json()
    expect(list.find((s: { id: string }) => s.id === id)).toBeUndefined()
  })

  it('construtor de campos personalizados valida opções', async () => {
    const { agent } = await createOwner({ businessType: 'outro' })
    const bad = await agent.post('/api/forms/fields', {
      label: 'Cor favorita',
      type: 'single_select',
      options: ['Vermelho'],
    })
    expect(bad.statusCode).toBe(400)
    const ok = await agent.post('/api/forms/fields', {
      label: 'Cor favorita',
      type: 'single_select',
      options: ['Vermelho', 'Nude'],
      required: true,
    })
    expect(ok.statusCode).toBe(201)
    const preset = await agent.post('/api/forms/presets/manicure')
    expect(preset.json().created).toBe(4)
    expect((await agent.get('/api/forms/fields')).json()).toHaveLength(5)
  })

  it('bloqueios pontuais e recorrentes', async () => {
    const { agent, professional } = await createOwner()
    const t = await agent.post('/api/schedule/time-off', {
      professionalId: professional.id,
      startsAt: '2030-01-10T12:00:00Z',
      endsAt: '2030-01-10T15:00:00Z',
      reason: 'Médico',
    })
    expect(t.statusCode).toBe(201)
    const bad = await agent.post('/api/schedule/time-off', {
      startsAt: '2030-01-10T12:00:00Z',
      endsAt: '2030-01-10T11:00:00Z',
    })
    expect(bad.statusCode).toBe(400)
    const r = await agent.post('/api/schedule/recurring-blocks', {
      weekday: 3,
      start: '12:00',
      end: '13:00',
      reason: 'Almoço',
    })
    expect(r.statusCode).toBe(201)
  })
})
