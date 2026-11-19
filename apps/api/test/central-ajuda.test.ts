import { describe, expect, it } from 'vitest'
import { createOwner, getApp, TestAgent } from './helpers'

describe('central de ajuda: preferências e progresso', () => {
  it('exige login', async () => {
    const anon = new TestAgent(await getApp())
    expect((await anon.get('/api/help/state')).statusCode).toBe(401)
  })

  it('começa sem progresso, com a boas-vindas por mostrar', async () => {
    const { agent } = await createOwner()
    const s = (await agent.get('/api/help/state')).json()
    expect(s).toEqual({ beginnerMode: false, introSeenAt: null, progress: [] })
  })

  it('salva modo iniciante e boas-vindas vista', async () => {
    const { agent } = await createOwner()
    const r = await agent.put('/api/help/preferences', { beginnerMode: true, introSeen: true })
    expect(r.statusCode).toBe(200)
    expect(r.json().beginnerMode).toBe(true)
    expect(r.json().introSeenAt).not.toBeNull()
    // Mexer só no modo iniciante não esquece a boas-vindas
    const r2 = (await agent.put('/api/help/preferences', { beginnerMode: false })).json()
    expect(r2.beginnerMode).toBe(false)
    expect(r2.introSeenAt).not.toBeNull()
  })

  it('guarda a etapa, conclui e conta quantas vezes concluiu', async () => {
    const { agent } = await createOwner()
    const url = '/api/help/progress/tutorial:criar-servico'
    expect((await agent.put(url, { step: 2, status: 'started' })).json().step).toBe(2)
    const done = (await agent.put(url, { step: 4, status: 'completed' })).json()
    expect(done.status).toBe('completed')
    expect(done.timesCompleted).toBe(1)
    expect(done.completedAt).not.toBeNull()
    // Concluir de novo sem recomeçar não conta em dobro (clique repetido)
    expect((await agent.put(url, { step: 4, status: 'completed' })).json().timesCompleted).toBe(1)
    // Repetir o tutorial conta mais uma conclusão
    await agent.put(url, { step: 0, status: 'started' })
    expect((await agent.put(url, { step: 4, status: 'completed' })).json().timesCompleted).toBe(2)

    const state = (await agent.get('/api/help/state')).json()
    expect(state.progress).toHaveLength(1)
    expect(state.progress[0].itemId).toBe('tutorial:criar-servico')
  })

  it('cada usuário vê só o próprio progresso', async () => {
    const a = await createOwner()
    const b = await createOwner()
    await a.agent.put('/api/help/progress/tour:sistema', { step: 3, status: 'started' })
    expect((await b.agent.get('/api/help/state')).json().progress).toEqual([])
  })

  it('recusa item ou etapa inválidos', async () => {
    const { agent } = await createOwner()
    const bad = await agent.put('/api/help/progress/qualquer-coisa', { step: 0, status: 'started' })
    expect(bad.statusCode).toBe(400)
    const badStep = await agent.put('/api/help/progress/tour:sistema', {
      step: -1,
      status: 'started',
    })
    expect(badStep.statusCode).toBe(400)
    const badStatus = await agent.put('/api/help/progress/tour:sistema', {
      step: 0,
      status: 'feito',
    })
    expect(badStatus.statusCode).toBe(400)
  })

  it('recomeçar tudo zera o progresso e mostra a boas-vindas de novo', async () => {
    const { agent } = await createOwner()
    await agent.put('/api/help/preferences', { introSeen: true, beginnerMode: true })
    await agent.put('/api/help/progress/demo:link', { step: 5, status: 'completed' })
    const r = (await agent.delete('/api/help/progress')).json()
    expect(r.progress).toEqual([])
    expect(r.introSeenAt).toBeNull()
    expect(r.beginnerMode).toBe(true) // preferência fica
  })
})
