import { describe, expect, it } from 'vitest'
import { createOwner, getApp, TestAgent } from './helpers'

describe('autenticação', () => {
  it('cadastra, mantém sessão em cookie httpOnly e sai', async () => {
    const { agent } = await createOwner({ email: 'ana@teste.com' })
    const me = await agent.get('/api/auth/me')
    expect(me.json().authenticated).toBe(true)
    expect(me.json().tenant.subscription.status).toBe('trial')
    expect(me.json().tenant.subscription.trialDaysLeft).toBe(30)
    await agent.post('/api/auth/logout')
    expect((await agent.get('/api/auth/me')).json().authenticated).toBe(false)
  })

  it('recusa senha errada e e-mail duplicado', async () => {
    await createOwner({ email: 'bia@teste.com' })
    const app = await getApp()
    const a = new TestAgent(app)
    const bad = await a.post('/api/auth/login', { email: 'bia@teste.com', password: 'errada123' })
    expect(bad.statusCode).toBe(401)
    expect(bad.json().message).toBe('E-mail ou senha incorretos')
    const dup = await a.post('/api/auth/register', {
      name: 'Bia',
      email: 'bia@teste.com',
      password: 'senha12345',
      acceptTerms: true,
    })
    expect(dup.statusCode).toBe(409)
    const ok = await a.post('/api/auth/login', { email: 'bia@teste.com', password: 'senha12345' })
    expect(ok.statusCode).toBe(200)
  })

  it('exige CSRF em requisições que alteram dados', async () => {
    const { agent } = await createOwner()
    const csrf = agent.cookies.marcai_csrf
    delete agent.cookies.marcai_csrf
    const res = await agent.put('/api/tenant/booking-rules', {})
    expect(res.statusCode).toBe(403)
    agent.cookies.marcai_csrf = csrf!
  })

  it('valida os campos com mensagens em português', async () => {
    const app = await getApp()
    const res = await new TestAgent(app).post('/api/auth/register', {
      name: 'A',
      email: 'x',
      password: '1',
      acceptTerms: false,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().fields.email).toBe('Informe um e-mail válido')
  })
})
