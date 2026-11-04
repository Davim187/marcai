import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { metaForPath } from '../src/modules/seo/meta'
import { createOwner, getApp, TestAgent } from './helpers'

describe('SEO / Open Graph', () => {
  it('gera meta tags da landing e da página pública do estabelecimento', async () => {
    const { tenant, slug } = await createOwner({ name: 'Studio Rosa' })
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { bio: 'Unhas lindas em Fortaleza', logoUrl: '/uploads/x/logo.png' },
    })
    const landing = await metaForPath('/')
    expect(landing.title).toContain('Marcaí')
    const page = await metaForPath(`/${slug}`)
    expect(page.title).toBe('Studio Rosa — Agende seu horário online')
    expect(page.description).toBe('Unhas lindas em Fortaleza')
    expect(page.image).toBe('http://localhost:5173/uploads/x/logo.png')
    expect((await metaForPath('/painel/agenda')).noindex).toBe(true)
  })

  it('endpoint para robôs e sitemap', async () => {
    const { slug } = await createOwner()
    const app = await getApp()
    const og = await app.inject({ method: 'GET', url: `/api/public/og?path=/${slug}` })
    expect(og.body).toContain('og:title')
    const sm = await app.inject({ method: 'GET', url: '/sitemap.xml' })
    expect(sm.body).toContain(`/${slug}</loc>`)
  })
})

describe('super admin', () => {
  async function adminAgent() {
    const app = await getApp()
    await prisma.user.create({
      data: {
        email: 'root@marcai.app',
        name: 'Root',
        passwordHash: await bcrypt.hash('admin12345', 4),
        isSuperAdmin: true,
      },
    })
    const a = new TestAgent(app)
    await a.post('/api/auth/login', { email: 'root@marcai.app', password: 'admin12345' })
    return a
  }

  it('só o super admin acessa; vê MRR, estende teste, bloqueia e entra como (com auditoria)', async () => {
    const owner = await createOwner()
    expect((await owner.agent.get('/api/admin/overview')).statusCode).toBe(403)
    const admin = await adminAgent()
    const ov = (await admin.get('/api/admin/overview')).json()
    expect(ov.tenants).toBe(1)
    expect(ov.byStatus.trial).toBe(1)
    const ext = await admin.post(`/api/admin/tenants/${owner.tenant.id}/extend-trial`, { days: 15 })
    expect(ext.statusCode).toBe(200)
    await admin.post(`/api/admin/tenants/${owner.tenant.id}/block`, {
      blocked: true,
      reason: 'Fraude',
    })
    const app = await getApp()
    expect(
      (await app.inject({ method: 'GET', url: `/api/public/t/${owner.slug}` })).json().available,
    ).toBe(false)
    await admin.post(`/api/admin/tenants/${owner.tenant.id}/block`, { blocked: false })
    const imp = await admin.post(`/api/admin/tenants/${owner.tenant.id}/impersonate`)
    expect(imp.statusCode).toBe(200)
    const me = (await admin.get('/api/auth/me')).json()
    expect(me.impersonating).toBe(true)
    expect(me.tenant.id).toBe(owner.tenant.id)
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: owner.tenant.id, action: { startsWith: 'admin.' } },
    })
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        'admin.trial_extended',
        'admin.tenant_blocked',
        'admin.impersonated',
      ]),
    )
  })
})

describe('conta (LGPD)', () => {
  it('exporta e exclui a conta com o estabelecimento', async () => {
    const { agent, tenant } = await createOwner()
    const exp = await agent.get('/api/account/export')
    expect(exp.json().tenants[0].id).toBe(tenant.id)
    const bad = await agent.post('/api/account/delete', { password: 'errada', confirm: 'EXCLUIR' })
    expect(bad.statusCode).toBe(400)
    const ok = await agent.post('/api/account/delete', {
      password: 'senha12345',
      confirm: 'EXCLUIR',
    })
    expect(ok.statusCode).toBe(200)
    expect(await prisma.tenant.findUnique({ where: { id: tenant.id } })).toBeNull()
  })

  it('relatórios agregam faturamento e serviços', async () => {
    const { agent } = await createOwner()
    const today = new Date().toISOString().slice(0, 10)
    const r = await agent.get(`/api/reports?from=${today}&to=${today}`)
    expect(r.statusCode).toBe(200)
    expect(r.json().totals.bookings).toBe(0)
    expect(r.json().peakWeekdays).toHaveLength(7)
  })
})
