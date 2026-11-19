import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { createOwner, getApp, TestAgent } from './helpers'

/** Faz o access token atual vencer (como se a aba tivesse ficado parada). */
async function expireAccess(userId: string) {
  await prisma.session.updateMany({
    where: { userId },
    data: { accessExpiresAt: new Date(Date.now() - 1000) },
  })
}

describe('refresh token', () => {
  it('access vencido: /me pede renovação; refresh gira os tokens e a sessão volta', async () => {
    const { agent, email } = await createOwner()
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(agent.cookies.marcai_refresh).toBeTruthy()

    await expireAccess(user.id)
    const me = (await agent.get('/api/auth/me')).json()
    expect(me.authenticated).toBe(false)
    expect(me.canRefresh).toBe(true)
    expect((await agent.get('/api/tenant')).statusCode).toBe(401)

    const oldRefresh = agent.cookies.marcai_refresh
    const oldAccess = agent.cookies.marcai_session
    const ref = await agent.post('/api/auth/refresh')
    expect(ref.statusCode).toBe(200)
    expect(ref.json().csrfToken).toBe(agent.cookies.marcai_csrf)
    expect(agent.cookies.marcai_refresh).not.toBe(oldRefresh)
    expect(agent.cookies.marcai_session).not.toBe(oldAccess)

    const after = (await agent.get('/api/auth/me')).json()
    expect(after.authenticated).toBe(true)
    // Continua sendo a mesma sessão (o mesmo aparelho)
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1)
  })

  it('refresh já girado: dentro da janela é corrida entre abas; depois, encerra a sessão', async () => {
    const { agent, email } = await createOwner()
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    const app = await getApp()
    const old = agent.cookies.marcai_refresh!
    expect((await agent.post('/api/auth/refresh')).statusCode).toBe(200)

    const replay = () =>
      app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { marcai_refresh: old } })
    const raced = await replay()
    expect(raced.statusCode).toBe(200)
    expect(raced.json().raced).toBe(true)
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1)

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { refreshedAt: new Date(Date.now() - 5 * 60_000) },
    })
    expect((await replay()).statusCode).toBe(401)
    // Reuso fora da janela = token roubado: a sessão inteira cai
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
    expect((await agent.post('/api/auth/refresh')).statusCode).toBe(401)
  })

  it('sem refresh token ou com token inválido: 401', async () => {
    const app = await getApp()
    const a = new TestAgent(app)
    expect((await a.post('/api/auth/refresh')).statusCode).toBe(401)
    a.cookies.marcai_refresh = 'inventado'
    expect((await a.post('/api/auth/refresh')).statusCode).toBe(401)
  })

  it('sair com o access vencido ainda encerra a sessão pelo refresh token', async () => {
    const { agent, email } = await createOwner()
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    await expireAccess(user.id)
    await agent.post('/api/auth/logout')
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe('modo suporte ("entrar como")', () => {
  async function adminAgent() {
    const app = await getApp()
    const email = `root-${Math.random().toString(36).slice(2, 8)}@marcai.app`
    await prisma.user.create({
      data: {
        email,
        name: 'Root',
        passwordHash: await bcrypt.hash('admin12345', 4),
        isSuperAdmin: true,
      },
    })
    const a = new TestAgent(app)
    await a.post('/api/auth/login', { email, password: 'admin12345' })
    return a
  }

  it('"Encerrar" volta para a sessão do admin em vez de sair do sistema', async () => {
    const owner = await createOwner()
    const admin = await adminAgent()
    const adminSession = await prisma.session.findFirstOrThrow({
      where: { impersonatorId: null, user: { isSuperAdmin: true } },
      orderBy: { createdAt: 'desc' },
    })
    expect((await admin.post(`/api/admin/tenants/${owner.tenant.id}/impersonate`)).statusCode).toBe(
      200,
    )
    expect((await admin.get('/api/auth/me')).json().impersonating).toBe(true)

    const exit = await admin.post('/api/auth/support/exit')
    expect(exit.statusCode).toBe(200)
    expect(exit.json()).toMatchObject({ restored: true, tenantId: owner.tenant.id })

    const me = (await admin.get('/api/auth/me')).json()
    expect(me.authenticated).toBe(true)
    expect(me.impersonating).toBe(false)
    expect(me.user.isSuperAdmin).toBe(true)
    expect((await admin.get('/api/admin/overview')).statusCode).toBe(200)
    // A sessão de suporte some; a do admin é a mesma de antes
    expect(await prisma.session.count({ where: { impersonatorId: { not: null } } })).toBe(0)
    expect(me.csrfToken).toBe(adminSession.csrfToken)
    expect(
      await prisma.auditLog.count({
        where: { tenantId: owner.tenant.id, action: 'admin.impersonation_ended' },
      }),
    ).toBe(1)
  })

  it('sem o cookie de retorno, encerrar só sai (não reabre a sessão do admin)', async () => {
    const owner = await createOwner()
    const admin = await adminAgent()
    await admin.post(`/api/admin/tenants/${owner.tenant.id}/impersonate`)
    delete admin.cookies.marcai_support_return
    const exit = await admin.post('/api/auth/support/exit')
    expect(exit.json().restored).toBe(false)
    expect((await admin.get('/api/auth/me')).json().authenticated).toBe(false)
  })

  it('fora do modo suporte, encerrar é recusado', async () => {
    const { agent } = await createOwner()
    expect((await agent.post('/api/auth/support/exit')).statusCode).toBe(400)
  })
})
