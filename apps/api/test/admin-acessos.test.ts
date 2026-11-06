import { describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { createOwner, getApp, TestAgent } from './helpers'

/** Conta sem negócio cujo e-mail está em SUPER_ADMIN_EMAILS (ver .env.test). */
async function configAdmin() {
  const app = await getApp()
  const agent = new TestAgent(app)
  const reg = await agent.post('/api/auth/register', {
    name: 'Admin Config',
    email: 'config-admin@marcai.app',
    password: 'senha12345',
    acceptTerms: true,
  })
  expect(reg.statusCode).toBe(201)
  return agent
}

describe('gestão de acessos (admin do sistema)', () => {
  it('e-mail em SUPER_ADMIN_EMAILS é admin sem precisar ter negócio', async () => {
    const admin = await configAdmin()
    const me = (await admin.get('/api/auth/me')).json()
    expect(me.user.isSuperAdmin).toBe(true)
    expect(me.tenant).toBeNull()
    expect((await admin.get('/api/admin/overview')).statusCode).toBe(200)
    // O banco também passa a marcar a conta como admin
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'config-admin@marcai.app' },
    })
    await expect
      .poll(
        async () => (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperAdmin,
      )
      .toBe(true)
  })

  it('lista usuários, desativa (derruba sessões e bloqueia login) e reativa', async () => {
    const admin = await configAdmin()
    const owner = await createOwner({ email: 'dona-acesso@teste.com' })
    const list = (await admin.get('/api/admin/users?q=dona-acesso')).json()
    expect(list).toHaveLength(1)
    expect(list[0].memberships[0].tenant.id).toBe(owner.tenant.id)
    expect(list[0].activeSessions).toBe(1)
    const target = list[0].id

    const off = await admin.post(`/api/admin/users/${target}/disable`, { disabled: true })
    expect(off.statusCode).toBe(200)
    expect((await owner.agent.get('/api/auth/me')).json().authenticated).toBe(false)
    const app = await getApp()
    const relogin = await new TestAgent(app).post('/api/auth/login', {
      email: 'dona-acesso@teste.com',
      password: 'senha12345',
    })
    expect(relogin.statusCode).toBe(403)
    expect(
      (await admin.get('/api/admin/users?filter=disabled')).json().map((u: { id: string }) => u.id),
    ).toEqual([target])

    await admin.post(`/api/admin/users/${target}/disable`, { disabled: false })
    const back = await new TestAgent(app).post('/api/auth/login', {
      email: 'dona-acesso@teste.com',
      password: 'senha12345',
    })
    expect(back.statusCode).toBe(200)
    const actions = (await prisma.auditLog.findMany({ where: { entityId: target } })).map(
      (l) => l.action,
    )
    expect(actions).toEqual(expect.arrayContaining(['admin.user_disabled', 'admin.user_enabled']))
  })

  it('dá e tira admin, encerra sessões e protege a própria conta', async () => {
    const admin = await configAdmin()
    const me = (await admin.get('/api/auth/me')).json()
    const owner = await createOwner({ email: 'futura-admin@teste.com' })
    const [target] = (await admin.get('/api/admin/users?q=futura-admin')).json()

    await admin.post(`/api/admin/users/${target.id}/super-admin`, { value: true })
    expect((await owner.agent.get('/api/admin/overview')).statusCode).toBe(200)
    await admin.post(`/api/admin/users/${target.id}/super-admin`, { value: false })
    expect((await owner.agent.get('/api/admin/overview')).statusCode).toBe(403)

    const sessions = (await admin.get(`/api/admin/users/${target.id}/sessions`)).json()
    expect(sessions).toHaveLength(1)
    expect((await admin.delete(`/api/admin/sessions/${sessions[0].id}`)).statusCode).toBe(200)
    expect((await owner.agent.get('/api/auth/me')).json().authenticated).toBe(false)

    // Não dá para se desativar nem tirar o próprio admin (nem o admin vindo da configuração)
    expect(
      (await admin.post(`/api/admin/users/${me.user.id}/disable`, { disabled: true })).statusCode,
    ).toBe(400)
    expect(
      (await admin.post(`/api/admin/users/${me.user.id}/super-admin`, { value: false })).statusCode,
    ).toBe(400)
    // Quem não é admin não acessa a gestão de acessos
    const other = await createOwner()
    expect((await other.agent.get('/api/admin/users')).statusCode).toBe(403)
  })
})

describe('gestão do sistema (admin)', () => {
  it('cria, edita e exclui usuário; recusa excluir a única dona', async () => {
    const admin = await configAdmin()
    const created = await admin.post('/api/admin/users', {
      name: 'Nova Pessoa',
      email: 'nova@teste.com',
      password: 'senha12345',
      isSuperAdmin: false,
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()
    const app = await getApp()
    const login = await new TestAgent(app).post('/api/auth/login', {
      email: 'nova@teste.com',
      password: 'senha12345',
    })
    expect(login.statusCode).toBe(200)
    expect(
      (
        await admin.patch(`/api/admin/users/${id}`, {
          name: 'Outro Nome',
          email: 'outro@teste.com',
        })
      ).statusCode,
    ).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).email).toBe('outro@teste.com')
    expect((await admin.delete(`/api/admin/users/${id}`)).statusCode).toBe(200)
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull()

    const owner = await createOwner({ email: 'unica-dona@teste.com' })
    const [ownerRow] = (await admin.get('/api/admin/users?q=unica-dona')).json()
    const refused = await admin.delete(`/api/admin/users/${ownerRow.id}`)
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toBe('UNICA_DONA')
    expect(await prisma.tenant.findUnique({ where: { id: owner.tenant.id } })).not.toBeNull()
  })

  it('ficha do estabelecimento, ajuste de assinatura e exclusão reversível', async () => {
    const admin = await configAdmin()
    const owner = await createOwner()
    const detail = (await admin.get(`/api/admin/tenants/${owner.tenant.id}`)).json()
    expect(detail.members).toHaveLength(1)
    expect(detail.subscription.status).toBe('trial')

    await admin.post(`/api/admin/tenants/${owner.tenant.id}/subscription`, {
      plan: 'essencial',
      status: 'active',
      until: '2030-01-31',
    })
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: owner.tenant.id },
    })
    expect(sub).toMatchObject({ plan: 'essencial', status: 'active' })
    expect(sub.currentPeriodEnd?.toISOString().slice(0, 10)).toBe('2030-01-31')

    await admin.post(`/api/admin/tenants/${owner.tenant.id}/delete`, { deleted: true })
    expect((await admin.get('/api/admin/tenants')).json()).toHaveLength(0)
    expect((await admin.get('/api/admin/tenants?deleted=true')).json()).toHaveLength(1)
    expect((await owner.agent.get('/api/auth/me')).json().tenant).toBeNull()
    await admin.post(`/api/admin/tenants/${owner.tenant.id}/delete`, { deleted: false })
    expect((await admin.get('/api/admin/tenants')).json()).toHaveLength(1)
  })

  it('financeiro e saúde do sistema respondem para o admin', async () => {
    const admin = await configAdmin()
    const fin = (await admin.get('/api/admin/finance')).json()
    expect(fin.mrrCents).toBe(0)
    const sys = (await admin.get('/api/admin/system')).json()
    expect(sys.superAdminEmails).toEqual(['config-admin@marcai.app'])
    expect(sys.integrations.email).toBe('log')
    expect((await admin.post('/api/admin/maintenance/cleanup')).statusCode).toBe(200)
  })
})
