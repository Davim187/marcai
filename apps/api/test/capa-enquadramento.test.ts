import { describe, expect, it } from 'vitest'
import { createOwner, getApp } from './helpers'

const profile = {
  name: 'Studio Teste',
  primaryColor: '#1F5F7A',
  timezone: 'America/Fortaleza',
  coverUrl: '/uploads/abc/capa.jpg',
}

describe('enquadramento da foto de capa', () => {
  it('começa centralizado, salva o ajuste e mostra na página pública', async () => {
    const { agent, slug } = await createOwner()
    const app = await getApp()

    const before = (await agent.get('/api/tenant')).json()
    expect([before.coverPositionX, before.coverPositionY, before.coverZoom]).toEqual([50, 50, 100])

    const r = await agent.put('/api/tenant/profile', {
      ...profile,
      coverPositionX: 20,
      coverPositionY: 80,
      coverZoom: 150,
    })
    expect(r.statusCode).toBe(200)

    const pub = (await app.inject({ method: 'GET', url: `/api/public/t/${slug}` })).json()
    expect([pub.coverPositionX, pub.coverPositionY, pub.coverZoom]).toEqual([20, 80, 150])

    // Quem não manda o enquadramento (cliente antigo do painel) não mexe nele
    expect((await agent.put('/api/tenant/profile', profile)).statusCode).toBe(200)
    const after = (await agent.get('/api/tenant')).json()
    expect([after.coverPositionX, after.coverPositionY, after.coverZoom]).toEqual([20, 80, 150])
  })

  it('recusa valores fora da faixa', async () => {
    const { agent } = await createOwner()
    for (const bad of [
      { coverPositionX: -1 },
      { coverPositionY: 101 },
      { coverZoom: 99 },
      { coverZoom: 300 },
      { coverPositionX: 12.5 },
    ]) {
      const r = await agent.put('/api/tenant/profile', { ...profile, ...bad })
      expect(r.statusCode).toBe(400)
    }
  })
})
