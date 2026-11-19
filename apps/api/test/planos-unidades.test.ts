import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { createOwner } from './helpers'

const SHIFTS = [{ weekday: 1, start: '09:00', end: '18:00' }]

async function activate(tenantId: string, plan: 'essencial' | 'pro' | 'premium') {
  await prisma.subscription.update({
    where: { tenantId },
    data: { plan, status: 'active', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) },
  })
}

function newUnit(agent: Awaited<ReturnType<typeof createOwner>>['agent'], slug: string) {
  return agent.post('/api/tenant/units', {
    businessName: `Unidade ${slug}`,
    slug,
    businessType: 'barbearia',
    shifts: SHIFTS,
  })
}

const rnd = () => Math.random().toString(36).slice(2, 8)

describe('planos e unidades', () => {
  it('Básico: só 1 profissional e 1 unidade', async () => {
    const { agent, tenant } = await createOwner()
    await activate(tenant.id, 'essencial')
    const p = await agent.post('/api/team/professionals', { name: 'Segundo Barbeiro' })
    expect(p.statusCode).toBe(402)
    expect(p.json().error).toBe('LIMITE_PROFISSIONAIS')
    const u = await newUnit(agent, `u-${rnd()}`)
    expect(u.statusCode).toBe(402)
    expect(u.json().error).toBe('LIMITE_UNIDADES')
  })

  it('Profissional: até 3 unidades, que usam a assinatura da principal', async () => {
    const { agent, tenant } = await createOwner()
    await activate(tenant.id, 'pro')
    const a = await newUnit(agent, `u-${rnd()}`)
    expect(a.statusCode).toBe(201)
    const unit = await prisma.tenant.findUniqueOrThrow({ where: { id: a.json().id } })
    expect(unit.parentTenantId).toBe(tenant.id)
    expect(await prisma.subscription.count({ where: { tenantId: unit.id } })).toBe(0)

    // A sessão já está na unidade nova: plano e acesso vêm da principal
    const me = (await agent.get('/api/auth/me')).json()
    expect(me.tenant.id).toBe(unit.id)
    expect(me.tenant.effectivePlan).toBe('pro')
    expect(me.tenant.access).toBe('full')
    expect(me.tenant.account).toMatchObject({ rootId: tenant.id, isUnit: true })
    expect(me.tenant.features).toContain('whatsapp_customer')

    // Assinatura só na principal
    expect((await agent.get('/api/billing')).statusCode).toBe(403)

    // Página pública da unidade no ar
    expect((await agent.get(`/api/public/t/${unit.slug}`)).json().available).toBe(true)

    expect((await newUnit(agent, `u-${rnd()}`)).statusCode).toBe(201)
    const fourth = await newUnit(agent, `u-${rnd()}`)
    expect(fourth.statusCode).toBe(402)

    const units = (await agent.get('/api/tenant/units')).json()
    expect(units).toHaveLength(3)
    expect(units.filter((x: { isMain: boolean }) => x.isMain)).toHaveLength(1)
  })

  it('não deixa trocar para um plano menor que o uso atual', async () => {
    const { agent, tenant } = await createOwner()
    await activate(tenant.id, 'pro')
    expect((await agent.post('/api/team/professionals', { name: 'Outro' })).statusCode).toBe(201)
    const r = await agent.post('/api/billing/subscribe', { plan: 'essencial', billingType: 'PIX' })
    expect(r.statusCode).toBe(402)
    expect(r.json().error).toBe('PLANO_PEQUENO')
  })

  it('sinal antecipado só no Premium', async () => {
    const { agent, tenant } = await createOwner()
    await activate(tenant.id, 'pro')
    const rules = {
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
    }
    const denied = await agent.put('/api/tenant/booking-rules', rules)
    expect(denied.statusCode).toBe(402)
    await activate(tenant.id, 'premium')
    expect((await agent.put('/api/tenant/booking-rules', rules)).statusCode).toBe(200)
    expect((await agent.get(`/api/public/t/${tenant.slug}`)).json().prepayment).toMatchObject({
      percent: 50,
    })
    // Voltando para um plano menor, a página para de cobrar sinal
    await activate(tenant.id, 'pro')
    expect((await agent.get(`/api/public/t/${tenant.slug}`)).json().prepayment).toBeNull()
  })

  it('Premium: profissionais sem limite', async () => {
    const { agent, tenant } = await createOwner()
    await activate(tenant.id, 'premium')
    for (let i = 0; i < 8; i++)
      expect(
        (await agent.post('/api/team/professionals', { name: `Barbeiro ${i}` })).statusCode,
      ).toBe(201)
  })
})
