import { describe, expect, it, vi } from 'vitest'
import type * as Mailer from '../src/lib/mailer'
import { requestPasswordReset } from '../src/modules/auth/auth.service'
import { prisma } from '../src/lib/prisma'
import { createOwner, getApp, TestAgent } from './helpers'

const sent = vi.hoisted(() => [] as Array<{ to: string; text?: string }>)
vi.mock('../src/lib/mailer', async (importOriginal) => {
  const mod = await importOriginal<typeof Mailer>()
  return {
    ...mod,
    sendEmail: vi.fn(async (msg: { to: string; text?: string }) => {
      sent.push(msg)
      return { id: null }
    }),
  }
})

/** Pede o link e devolve o token que foi no e-mail. */
async function linkFor(email: string) {
  sent.length = 0
  await requestPasswordReset(email).sending
  const text = sent.find((m) => m.to === email)?.text ?? ''
  return text.match(/redefinir-senha\?token=([\w-]+)/)?.[1]
}

describe('redefinição de senha por e-mail', () => {
  it('envia o link, troca a senha, derruba as sessões e invalida o link', async () => {
    const { agent, email } = await createOwner()
    const app = await getApp()
    const anon = new TestAgent(app)

    const res = await anon.post('/api/auth/forgot-password', { email })
    expect(res.statusCode).toBe(200)

    const token = await linkFor(email)
    expect(token).toBeTruthy()

    const ok = await anon.post('/api/auth/reset-password', { token, password: 'novaSenha123' })
    expect(ok.statusCode).toBe(200)

    // Sessões antigas caem
    expect((await agent.get('/api/auth/me')).json().authenticated).toBe(false)
    // Senha nova vale, a antiga não
    const login = await anon.post('/api/auth/login', { email, password: 'novaSenha123' })
    expect(login.statusCode).toBe(200)
    const old = await new TestAgent(app).post('/api/auth/login', {
      email,
      password: 'senha12345',
    })
    expect(old.statusCode).toBe(401)

    // O link só vale uma vez
    const again = await anon.post('/api/auth/reset-password', { token, password: 'outra12345' })
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('TOKEN_INVALIDO')
  })

  it('responde igual para e-mail inexistente e não envia nada', async () => {
    const app = await getApp()
    const res = await new TestAgent(app).post('/api/auth/forgot-password', {
      email: 'ninguem@teste.com',
    })
    expect(res.statusCode).toBe(200)
    expect(await linkFor('ninguem@teste.com')).toBeUndefined()
  })

  it('segura pedidos repetidos, só o link mais recente vale e link expirado é recusado', async () => {
    const { email } = await createOwner()
    const app = await getApp()
    const anon = new TestAgent(app)
    const first = await linkFor(email)
    // Pedido repetido em menos de 1 minuto não manda outro e-mail
    expect(await linkFor(email)).toBeUndefined()
    await prisma.passwordResetToken.updateMany({
      data: { createdAt: new Date(Date.now() - 120_000) },
    })
    const second = await linkFor(email)
    expect(second).toBeTruthy()

    const r1 = await anon.post('/api/auth/reset-password', { token: first, password: 'nova12345' })
    expect(r1.statusCode).toBe(400)

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } })
    const r2 = await anon.post('/api/auth/reset-password', { token: second, password: 'nova12345' })
    expect(r2.statusCode).toBe(400)
    expect(r2.json().code).toBe('TOKEN_INVALIDO')
  })
})
