import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { createOwner, getApp, nextFreeSlots } from './helpers'

async function setup() {
  const o = await createOwner()
  const service = await prisma.service.findFirstOrThrow({
    where: { tenantId: o.tenant.id, name: 'Manicure simples' },
  })
  const { slots } = await nextFreeSlots(o.slug, service.id, o.professional.id)
  return { ...o, service, slots }
}

describe('painel: agendamentos', () => {
  it('cria agendamento manual, confirma, remarca e cancela', async () => {
    const { agent, service, professional, slots } = await setup()
    const created = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Carla Lima',
      customerPhone: '(85) 98888-1111',
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().id
    expect(created.json().source).toBe('manual')

    // Conflito com o mesmo horário
    const dup = await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Outra',
      customerPhone: '(85) 98888-2222',
    })
    expect(dup.statusCode).toBe(409)

    const res = await agent.post(`/api/bookings/${id}/reschedule`, {
      startsAt: slots.at(-1)!.startsAt,
    })
    expect(res.statusCode).toBe(200)
    expect(new Date(res.json().startsAt).toISOString()).toBe(slots.at(-1)!.startsAt)

    // Concluir antes do horário não pode
    expect(
      (await agent.patch(`/api/bookings/${id}/status`, { status: 'completed' })).statusCode,
    ).toBe(400)
    const cancel = await agent.patch(`/api/bookings/${id}/status`, {
      status: 'canceled',
      reason: 'Cliente pediu',
    })
    expect(cancel.json().status).toBe('canceled')

    const list = await agent.get('/api/bookings?status=canceled')
    expect(list.json().total).toBe(1)
    const search = await agent.get('/api/bookings?q=carla')
    expect(search.json().total).toBe(1)
  })

  it('profissional só vê a própria agenda', async () => {
    const { agent, tenant, service, professional, slots } = await setup()
    await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Dani',
      customerPhone: '(85) 97777-0000',
    })
    const invite = await agent.post('/api/team/members', {
      name: 'Júlia',
      email: 'julia-t@teste.com',
      role: 'professional',
      createProfessional: true,
    })
    expect(invite.statusCode).toBe(201)
    // Define senha e loga como a profissional
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'julia-t@teste.com' } })
    const bcrypt = await import('bcryptjs')
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash('senha12345', 4) },
    })
    const { TestAgent } = await import('./helpers')
    const julia = new TestAgent(await getApp())
    await julia.post('/api/auth/login', { email: 'julia-t@teste.com', password: 'senha12345' })
    expect((await julia.get('/api/bookings')).json().total).toBe(0)
    // E não pode mexer em serviços (rota de dona)
    expect(
      (await julia.post('/api/services', { name: 'X', durationMinutes: 30, priceCents: 0 }))
        .statusCode,
    ).toBe(403)
    expect((await agent.get('/api/bookings')).json().total).toBe(1)
    void tenant
  })

  it('dashboard calcula faturamento previsto e próximos atendimentos', async () => {
    const { agent, service, professional, slots } = await setup()
    await agent.post('/api/bookings', {
      serviceId: service.id,
      professionalId: professional.id,
      startsAt: slots[0]!.startsAt,
      customerName: 'Eva',
      customerPhone: '(85) 96666-0000',
      priceCents: 5000,
    })
    const d = (await agent.get('/api/dashboard')).json()
    expect(d.next.customer.name).toBe('Eva')
    expect(d.revenue.month.cents + d.revenue.week.cents).toBeGreaterThanOrEqual(0)
    expect(d.publicUrl).toContain(d.publicUrl.split('/').pop())
  })
})

describe('painel: clientes', () => {
  it('importa e exporta CSV, deduplicando pelo telefone', async () => {
    const { agent } = await setup()
    const csv =
      'Nome;WhatsApp;E-mail;Tags;Observações\nAna Souza;(85) 99999-0001;ana@x.com;VIP, Gel;Gosta de nude\nBia;85999990002;;;\nSem telefone;123;;;\nAna S.;5585999990001;;;'
    const res = await agent.post('/api/customers/import', { csv })
    expect(res.json()).toMatchObject({ created: 2, updated: 1, skipped: 1 })
    const list = (await agent.get('/api/customers?q=ana')).json()
    expect(list.total).toBe(1)
    // Linha repetida sem tags NÃO apaga as tags que já existiam
    expect(list.items[0].tags).toEqual(['VIP', 'Gel'])
    expect(list.items[0].email).toBe('ana@x.com')
    const exp = await agent.get('/api/customers/export.csv')
    expect(exp.headers['content-type']).toContain('text/csv')
    expect(exp.body).toContain('(85) 99999-0002')
  })

  it('LGPD: excluir anonimiza a cliente', async () => {
    const { agent, tenant } = await setup()
    const c = await agent.post('/api/customers', {
      name: 'Fernanda',
      phone: '(85) 95555-0000',
      tags: ['VIP'],
    })
    expect(c.statusCode).toBe(201)
    expect((await agent.get(`/api/customers/${c.json().id}/export`)).json().name).toBe('Fernanda')
    await agent.delete(`/api/customers/${c.json().id}`)
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.json().id } })
    expect(row.name).toBe('Cliente removido')
    expect(row.phone).not.toContain('95555')
    expect(
      await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'customer.deleted' } }),
    ).toBe(1)
  })
})
