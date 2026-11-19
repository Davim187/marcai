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

/** Palavras que não dizem o assunto da pergunta (já sem acento). */
const STOP = new Set(
  `a o e de da do das dos em no na nos nas num numa um uma uns umas para pra pro por pelo pela
  com sem como que se eu me meu minha meus minhas seu sua seus suas voce voces ele ela eles
  elas the ao aos as os ja mais menos muito qual quais onde quando porque por isso esse essa
  este esta isso aqui ali la nao sim tem ter tenho temos vou vai vamos quero queria quer
  gostaria preciso precisa posso pode consigo consegue faco faz fazer fazendo coloco colocar
  vejo ver tem ha hoje ainda so tambem tipo algum alguma alguem ou mas entao dar da deu
  esta estao estou ser sou foi era`.split(/\s+/),
)

/**
 * Radical simples: tira terminações comuns para "faltou" achar "falta" e "remarcação"
 * achar "remarcar". Nunca deixa menos de 4 letras.
 */
const SUFFIXES = [
  'amento',
  'imento',
  'mente',
  'coes',
  'cao',
  'ando',
  'endo',
  'indo',
  'aram',
  'eram',
  'iram',
  'avam',
  'ados',
  'idos',
  'adas',
  'idas',
  'ado',
  'ido',
  'ada',
  'ida',
  'ar',
  'er',
  'ir',
  'ou',
  'eu',
  'iu',
  'ei',
  'am',
  'em',
  'es',
  'as',
  'os',
  's',
  'a',
  'o',
  'e',
]
export function stem(w: string) {
  for (const suf of SUFFIXES)
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length)
  return w
}

function tokens(s: string) {
  return normalize(s)
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
}

interface Indexed {
  entry: HelpEntry
  /** Texto normalizado (para achar a frase inteira) */
  title: string
  keywords: string
  /** Palavras-chave de mais de uma palavra ("não vou atender"), normalizadas */
  phrases: string[]
  /** Radicais de cada campo */
  titleT: string[]
  keyT: string[]
  bodyT: string[]
  category?: HelpCategoryId
  audience: Audience
}

function entryTitle(e: HelpEntry) {
  return e.item.title
}

function indexed(
  entry: HelpEntry,
  title: string,
  keywords: string[],
  body: string,
  audience: Audience,
  category?: HelpCategoryId,
): Indexed {
  return {
    entry,
    title: normalize(title),
    keywords: normalize(keywords.join(' | ')),
    phrases: keywords
      .map((k) => normalize(k).replace(/\s+/g, ' ').trim())
      .filter((k) => k.includes(' ')),
    titleT: tokens(title),
    keyT: tokens(keywords.join(' ')),
    bodyT: tokens(body),
    audience,
    category,
  }
}

const INDEX: Indexed[] = [
  ...TUTORIALS.map((t) =>
    indexed(
      { type: 'tutorial', item: t },
      t.title,
      t.keywords,
      `${t.description} ${t.steps.map((s) => `${s.title} ${s.body}`).join(' ')}`,
      t.audience,
      t.category,
    ),
  ),
  ...ARTICLES.map((a) =>
    indexed(
      { type: 'article', item: a },
      a.title,
      a.keywords,
      `${a.summary} ${a.sections.map((s) => `${s.heading ?? ''} ${s.body}`).join(' ')}`,
      a.audience,
      a.category,
    ),
  ),
  ...TOURS.map((t) =>
    indexed(
      { type: 'tour', item: t },
      t.title,
      [],
      `${t.description} ${t.steps.map((s) => `${s.title} ${s.body}`).join(' ')}`,
      t.audience,
    ),
  ),
  ...DEMOS.map((d) =>
    indexed(
      { type: 'demo', item: d },
      d.title,
      [],
      `${d.description} ${d.scenes.map((s) => s.caption).join(' ')}`,
      d.audience,
      d.category,
    ),
  ),
]

const TYPE_WEIGHT: Record<HelpEntry['type'], number> = {
  tutorial: 1,
  article: 0.8,
  tour: 0.4,
  demo: 0.2,
}

/** Peso de cada campo: título diz mais sobre o assunto que palavra-chave, que diz mais que o texto. */
const FIELD_WEIGHT = { title: 3, key: 2.5, body: 1 }

/** O radical da pergunta casa com a palavra do texto se for igual ou começo dela ("remarc" → "remarcar"). */
const hasToken = (list: string[], q: string) =>
  list.some((t) => t === q || (q.length >= 3 && t.startsWith(q)))

export interface SearchHit {
  entry: HelpEntry
  score: number
}

/**
 * Busca da central e do assistente (sem dependência externa nem IA):
 * 1. a pergunta vira radicais, sem acento e sem palavras de preenchimento;
 * 2. cada radical vale pela raridade (IDF): "férias" decide mais que "semana" ou "cliente",
 *    que aparecem em quase tudo;
 * 3. vale mais no título, depois nas palavras-chave, depois no texto;
 * 4. bônus para a frase inteira (ou uma expressão das palavras-chave contida na pergunta) e
 *    para quem tem as palavras mais importantes da pergunta.
 */
export function searchHelp(query: string, role: string, limit = 12): SearchHit[] {
  const q = normalize(query).replace(/\s+/g, ' ').trim()
  const words = [...new Set(tokens(query))]
  if (!words.length) return []
  const visible = INDEX.filter((it) => canSee(it.audience, role))
  const n = visible.length
  const idf = new Map(
    words.map((w) => {
      const df = visible.filter(
        (it) => hasToken(it.titleT, w) || hasToken(it.keyT, w) || hasToken(it.bodyT, w),
      ).length
      return [w, Math.log((n + 1) / (df + 0.5))]
    }),
  )
  const totalIdf = words.reduce((s, w) => s + Math.max(0, idf.get(w)!), 0) || 1

  const hits: SearchHit[] = []
  for (const it of visible) {
    let score = 0
    let matchedIdf = 0
    for (const w of words) {
      const weight = hasToken(it.titleT, w)
        ? FIELD_WEIGHT.title
        : hasToken(it.keyT, w)
          ? FIELD_WEIGHT.key
          : hasToken(it.bodyT, w)
            ? FIELD_WEIGHT.body
            : 0
      if (!weight) continue
      const w2 = Math.max(0, idf.get(w)!)
      score += weight * w2
      matchedIdf += w2
    }
    if (!matchedIdf) continue
    // A pergunta inteira escrita igual a um título ou palavra-chave
    if (q.length > 3 && (it.title.includes(q) || it.keywords.includes(q))) score += 6
    // Uma expressão inteira das palavras-chave dentro da pergunta ("não vou atender amanhã")
    else if (it.phrases.some((p) => ` ${q} `.includes(` ${p} `))) score += 6
    // Quem tem as palavras que mais importam na pergunta sobe
    score += (matchedIdf / totalIdf) * 6
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
