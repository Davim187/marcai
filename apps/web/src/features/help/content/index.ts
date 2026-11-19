import type { Article, Audience, Demo, HelpCategoryId, Tour, Tutorial } from '../types'
import { ARTICLES, articleBySlug } from './articles'
import { DEMOS } from './demos'
import { TOURS } from './tours'
import { TUTORIALS, tutorialBySlug } from './tutorials'

export { ARTICLES, DEMOS, TOURS, TUTORIALS }
export { CATEGORIES, categoryById } from './categories'
export { articleBySlug, tutorialBySlug }
export { demoById } from './demos'
export { guideForRoute, tourById } from './tours'
export { BEGINNER_TIPS, beginnerTipFor, HINTS, type HintId } from './hints'

/** Qualquer conteúdo que pode ser buscado e aberto pela central. */
export type HelpEntry =
  | { type: 'article'; item: Article }
  | { type: 'tutorial'; item: Tutorial }
  | { type: 'tour'; item: Tour }
  | { type: 'demo'; item: Demo }

export const canSee = (audience: Audience | undefined, role: string) =>
  audience !== 'owner' || role === 'owner'

/** Artigo ou tutorial pelo slug (os dois abrem em /painel/ajuda/:slug). */
export function entryBySlug(
  slug: string,
): Extract<HelpEntry, { type: 'article' | 'tutorial' }> | null {
  const t = tutorialBySlug(slug)
  if (t) return { type: 'tutorial', item: t }
  const a = articleBySlug(slug)
  if (a) return { type: 'article', item: a }
  return null
}

/** Minúsculas e sem acentos: "Remarcação" casa com "remarcacao". */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

const STOP = new Set(
  'a o e de da do das dos em no na nos nas um uma para por com como que se eu meu minha meus minhas the ao aos as os ja mais pra pro voce qual quais onde quando'.split(
    ' ',
  ),
)

function tokens(s: string) {
  return normalize(s)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
}

interface Indexed {
  entry: HelpEntry
  title: string
  keywords: string
  body: string
  category?: HelpCategoryId
  audience: Audience
}

function entryTitle(e: HelpEntry) {
  return e.item.title
}

const INDEX: Indexed[] = [
  ...TUTORIALS.map((t) => ({
    entry: { type: 'tutorial', item: t } as HelpEntry,
    title: normalize(t.title),
    keywords: normalize(t.keywords.join(' ')),
    body: normalize(`${t.description} ${t.steps.map((s) => `${s.title} ${s.body}`).join(' ')}`),
    category: t.category,
    audience: t.audience,
  })),
  ...ARTICLES.map((a) => ({
    entry: { type: 'article', item: a } as HelpEntry,
    title: normalize(a.title),
    keywords: normalize(a.keywords.join(' ')),
    body: normalize(
      `${a.summary} ${a.sections.map((s) => `${s.heading ?? ''} ${s.body}`).join(' ')}`,
    ),
    category: a.category,
    audience: a.audience,
  })),
  ...TOURS.map((t) => ({
    entry: { type: 'tour', item: t } as HelpEntry,
    title: normalize(t.title),
    keywords: '',
    body: normalize(`${t.description} ${t.steps.map((s) => `${s.title} ${s.body}`).join(' ')}`),
    audience: t.audience,
  })),
  ...DEMOS.map((d) => ({
    entry: { type: 'demo', item: d } as HelpEntry,
    title: normalize(d.title),
    keywords: '',
    body: normalize(`${d.description} ${d.scenes.map((s) => s.caption).join(' ')}`),
    category: d.category,
    audience: d.audience,
  })),
]

const TYPE_WEIGHT: Record<HelpEntry['type'], number> = {
  tutorial: 1,
  article: 0.8,
  tour: 0.4,
  demo: 0.2,
}

export interface SearchHit {
  entry: HelpEntry
  score: number
}

/**
 * Busca por palavras com pesos: título vale mais que palavra-chave, que vale mais que o
 * texto. Uma frase inteira contida no título ganha bônus. Sem dependência externa.
 */
export function searchHelp(query: string, role: string, limit = 12): SearchHit[] {
  const q = normalize(query).trim()
  const words = tokens(query)
  if (!words.length) return []
  const hits: SearchHit[] = []
  for (const it of INDEX) {
    if (!canSee(it.audience, role)) continue
    let score = 0
    let matched = 0
    for (const w of words) {
      // Prefixo também conta ("remarc" acha "remarcar")
      const re = new RegExp(`\\b${w}`)
      let m = 0
      if (re.test(it.title)) m = 6
      else if (re.test(it.keywords)) m = 4
      else if (re.test(it.body)) m = 1
      if (m) matched++
      score += m
    }
    if (!matched) continue
    if (q.length > 3 && (it.title.includes(q) || it.keywords.includes(q))) score += 8
    // Todas as palavras presentes valem mais que uma palavra muito repetida
    score += (matched / words.length) * 4
    // Em empate, o que ensina a fazer vem antes do que só mostra
    score += TYPE_WEIGHT[it.entry.type]
    hits.push({ entry: it.entry, score })
  }
  return hits
    .sort((a, b) => b.score - a.score || entryTitle(a.entry).localeCompare(entryTitle(b.entry)))
    .slice(0, limit)
}

/** Caminho de cada tipo de conteúdo dentro do painel. */
export function entryHref(e: HelpEntry) {
  if (e.type === 'article' || e.type === 'tutorial') return `/painel/ajuda/${e.item.slug}`
  return null
}
