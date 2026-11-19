import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCENES } from '../demo/scenes'
import {
  ARTICLES,
  BEGINNER_TIPS,
  DEMOS,
  entryBySlug,
  HINTS,
  normalize,
  searchHelp,
  tourById,
  TOURS,
  TUTORIALS,
} from './index'

/** Todos os valores de data-tour escritos no código do painel. */
function dataTourTargets() {
  const root = join(__dirname, '../../..')
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx')) {
        const src = readFileSync(p, 'utf8')
        for (const m of src.matchAll(/data-tour="([^"]+)"/g)) found.add(m[1]!)
        // data-tour={`nav:${item.to}`} no menu
        if (src.includes('data-tour={`nav:${item.to}`}')) found.add('nav:*')
      }
    }
  }
  walk(root)
  return found
}

describe('conteúdo da central de ajuda', () => {
  it('todo alvo de tour existe na interface', () => {
    const targets = dataTourTargets()
    const missing = TOURS.flatMap((t) =>
      t.steps.filter((s) => s.target && !targets.has(s.target)).map((s) => `${t.id} → ${s.target}`),
    )
    expect(missing).toEqual([])
  })

  it('referências entre conteúdos apontam para itens que existem', () => {
    const problems: string[] = []
    for (const t of TUTORIALS)
      if (t.guideId && !tourById(t.guideId)) problems.push(`tutorial ${t.slug} → ${t.guideId}`)
    for (const a of ARTICLES)
      for (const r of a.related ?? []) if (!entryBySlug(r)) problems.push(`artigo ${a.slug} → ${r}`)
    for (const d of DEMOS) {
      for (const s of d.scenes)
        if (!SCENES[s.scene]) problems.push(`demo ${d.id} → cena ${s.scene}`)
      if (d.tutorial && !entryBySlug(d.tutorial)) problems.push(`demo ${d.id} → ${d.tutorial}`)
    }
    for (const tip of BEGINNER_TIPS) {
      if (tip.guideId && !tourById(tip.guideId)) problems.push(`dica ${tip.route} → ${tip.guideId}`)
      if (tip.tutorial && !entryBySlug(tip.tutorial))
        problems.push(`dica ${tip.route} → ${tip.tutorial}`)
    }
    for (const [id, h] of Object.entries(HINTS))
      if ('more' in h && h.more && !entryBySlug(h.more)) problems.push(`dica ${id} → ${h.more}`)
    expect(problems).toEqual([])
  })

  it('slugs e ids são únicos e no formato salvo pela API', () => {
    const slugs = [...TUTORIALS.map((t) => t.slug), ...ARTICLES.map((a) => a.slug)]
    expect(new Set(slugs).size).toBe(slugs.length)
    const ids = [
      ...TOURS.map((t) => t.id),
      ...DEMOS.map((d) => d.id),
      ...TUTORIALS.map((t) => `tutorial:${t.slug}`),
    ]
    for (const id of ids) expect(id).toMatch(/^(tour|guide|tutorial|demo):[a-z0-9-]{1,60}$/)
  })

  it('a busca ignora acentos e acha o que importa', () => {
    expect(normalize('Remarcação')).toBe('remarcacao')
    const top = (q: string) => searchHelp(q, 'owner')[0]?.entry.item.title
    expect(top('bloquear folga')).toBe('Bloquear uma folga, viagem ou consulta')
    expect(top('cobrar sinal pix')).toBe('Cobrar sinal pelo PIX com comprovante')
    expect(top('horario fixo')).toBe('Horário fixo semanal (cliente fixo)')
    expect(searchHelp('xyzabc', 'owner')).toEqual([])
  })

  it('a equipe não vê conteúdo só da dona', () => {
    const titles = searchHelp('mercado pago access token', 'professional').map(
      (h) => h.entry.item.title,
    )
    expect(titles).not.toContain('Receber o sinal pelo Mercado Pago')
  })
})
