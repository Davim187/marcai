import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  GraduationCap,
  LifeBuoy,
  MessageCircleQuestion,
  Play,
  Printer,
  RotateCcw,
  Search,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { askConfirm } from '@/components/confirm-host'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'
import { useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'
import {
  ARTICLES,
  CATEGORIES,
  canSee,
  categoryById,
  DEMOS,
  entryHref,
  type HelpEntry,
  searchHelp,
  TOURS,
  TUTORIALS,
} from '../content'
import { useHelpUi } from '../help-ui'
import {
  type HelpProgressItem,
  useBeginnerMode,
  useHelpActions,
  useProgressMap,
} from '../state/help-state'
import { useTour } from '../tour/tour-context'
import type { HelpCategoryId } from '../types'

const TYPE_LABEL: Record<HelpEntry['type'], string> = {
  article: 'Artigo',
  tutorial: 'Passo a passo',
  tour: 'Guia na tela',
  demo: 'Demonstração',
}

function StatusTag({ p, total }: { p?: HelpProgressItem; total?: number }) {
  if (!p) return null
  if (p.status === 'completed')
    return (
      <span className="text-success inline-flex items-center gap-1 text-xs font-semibold">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Visto
      </span>
    )
  if (p.status === 'started' && total && p.step > 0)
    return (
      <span className="text-muted-foreground text-xs font-medium">
        Parou na etapa {p.step + 1} de {total}
      </span>
    )
  return null
}

export default function HelpCenterPage() {
  const { tenant } = useTenant()
  const role = tenant.role
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const category = params.get('categoria') as HelpCategoryId | null
  const searchRef = useRef<HTMLInputElement>(null)
  const progress = useProgressMap()
  const beginner = useBeginnerMode()
  const { setBeginnerMode, resetAll, resetting } = useHelpActions()
  const { start } = useTour()
  const { openDemo, openAssistant } = useHelpUi()

  // "/" foca a busca (como nos apps de documentação)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A busca fica na URL: voltar do artigo mantém os resultados
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params)
      if (query.trim()) next.set('q', query.trim())
      else next.delete('q')
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
    }, 250)
    return () => window.clearTimeout(t)
  }, [query, params, setParams])

  const results = useMemo(() => (query.trim() ? searchHelp(query, role, 20) : []), [query, role])
  const tutorials = TUTORIALS.filter(
    (t) => canSee(t.audience, role) && (!category || t.category === category),
  )
  const articles = ARTICLES.filter(
    (a) => canSee(a.audience, role) && (!category || a.category === category),
  )
  const guides = TOURS.filter((t) => t.kind === 'guide' && canSee(t.audience, role))
  const demos = DEMOS.filter(
    (d) => canSee(d.audience, role) && (!category || d.category === category),
  )
  const systemTour = TOURS.find((t) => t.id === 'tour:sistema')!
  const tourProgress = progress.get(systemTour.id)

  function openEntry(e: HelpEntry) {
    if (e.type === 'tour') start(e.item.id, { restart: true })
    else if (e.type === 'demo') openDemo(e.item.id)
  }

  async function resetProgress() {
    const ok = await askConfirm({
      title: 'Zerar o progresso da ajuda?',
      description:
        'Tours, tutoriais e demonstrações voltam a aparecer como não vistos, e a boas-vindas aparece de novo. O modo iniciante continua como está.',
      confirmLabel: 'Zerar progresso',
    })
    if (!ok) return
    await resetAll()
    toast.success('Progresso zerado')
  }

  const setCategory = (c: HelpCategoryId | null) => {
    const next = new URLSearchParams(params)
    if (c) next.set('categoria', c)
    else next.delete('categoria')
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        title="Central de ajuda"
        description="Guias na tela, passo a passo, demonstrações e respostas para as dúvidas mais comuns."
        actions={
          <Button variant="outline" onClick={() => openAssistant()}>
            <MessageCircleQuestion /> Perguntar ao assistente
          </Button>
        }
      />

      {/* Busca */}
      <div className="relative mb-8">
        <Search
          className="text-muted-foreground pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          aria-hidden
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="O que você quer fazer? Ex.: bloquear folga, cobrar sinal, lembrete"
          aria-label="Buscar na central de ajuda"
          className="bg-card shadow-soft focus-visible:border-primary h-14 w-full rounded-xl border pl-12 pr-14 text-base outline-none"
        />
        <kbd className="text-muted-foreground bg-muted absolute right-4 top-1/2 hidden -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-medium sm:block">
          /
        </kbd>
      </div>

      {query.trim() ? (
        <section aria-label="Resultados da busca">
          <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
            {results.length
              ? `${results.length} resultado${results.length > 1 ? 's' : ''} para “${query.trim()}”`
              : `Nada encontrado para “${query.trim()}”.`}
          </p>
          {results.length === 0 ? (
            <Card className="flex flex-col items-start gap-3 p-5 text-sm">
              <p>Tente outras palavras ou pergunte ao assistente.</p>
              <Button size="sm" onClick={() => openAssistant(query)}>
                <MessageCircleQuestion /> Perguntar “{query.trim()}”
              </Button>
            </Card>
          ) : (
            <Card className="divide-y overflow-hidden">
              {results.map(({ entry }) => {
                const href = entryHref(entry)
                const summary =
                  entry.type === 'article' ? entry.item.summary : entry.item.description
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{entry.item.title}</p>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{summary}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {TYPE_LABEL[entry.type]}
                    </Badge>
                  </>
                )
                const cls =
                  'hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none transition-colors'
                return href ? (
                  <Link key={`${entry.type}-${entry.item.title}`} to={href} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={`${entry.type}-${entry.item.title}`}
                    type="button"
                    onClick={() => openEntry(entry)}
                    className={cls}
                  >
                    {inner}
                  </button>
                )
              })}
            </Card>
          )}
        </section>
      ) : (
        <div className="space-y-10">
          {/* Comece por aqui */}
          {!category && (
            <section className="grid gap-4 md:grid-cols-3" aria-label="Comece por aqui">
              <div className="felt text-sidebar-foreground shadow-soft flex flex-col gap-3 rounded-lg p-5 md:col-span-2">
                <Compass className="text-mustard h-6 w-6" aria-hidden />
                <div>
                  <h2 className="letters text-2xl leading-none">Tour pelo Marcaí</h2>
                  <p className="text-sidebar-muted mt-1.5 text-sm">
                    {systemTour.description} Mostra cada página na tela, com o que dá para fazer em
                    cada uma.
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <Button
                    className="bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active/90"
                    onClick={() =>
                      start(systemTour.id, { restart: tourProgress?.status !== 'started' })
                    }
                  >
                    <Play />
                    {tourProgress?.status === 'started' && tourProgress.step > 0
                      ? 'Continuar o tour'
                      : tourProgress?.status === 'completed'
                        ? 'Fazer de novo'
                        : 'Começar o tour'}
                  </Button>
                  {tourProgress?.status === 'completed' && (
                    <span className="text-sidebar-muted inline-flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Você já fez o tour
                    </span>
                  )}
                </div>
              </div>
              <Card className="flex flex-col gap-3 p-5">
                <GraduationCap className="h-6 w-6" aria-hidden />
                <div className="flex-1">
                  <h2 className="font-semibold">Modo iniciante</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Dica no topo de cada página, explicações visíveis ao lado das opções e a
                    descrição de cada item no menu.
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  {beginner ? 'Ligado' : 'Desligado'}
                  <Switch
                    checked={beginner}
                    onCheckedChange={setBeginnerMode}
                    aria-label="Modo iniciante"
                  />
                </label>
              </Card>
            </section>
          )}

          {/* Categorias */}
          <section aria-labelledby="h-categorias">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="h-categorias" className="letters text-xl">
                {category ? categoryById(category)?.title : 'Assuntos'}
              </h2>
              {category && (
                <Button variant="ghost" size="sm" onClick={() => setCategory(null)}>
                  Ver todos os assuntos
                </Button>
              )}
            </div>
            {!category && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map((c) => {
                  const count =
                    TUTORIALS.filter((t) => t.category === c.id && canSee(t.audience, role))
                      .length +
                    ARTICLES.filter((a) => a.category === c.id && canSee(a.audience, role)).length
                  if (!count) return null
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className="bg-card shadow-soft hover:shadow-lift focus-visible:ring-ring group flex items-start gap-3 rounded-lg border p-4 text-left outline-none transition hover:-translate-y-px focus-visible:ring-2"
                    >
                      {c.id === 'problemas' ? (
                        <Wrench className="text-terra mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                      ) : (
                        <BookOpen className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{c.title}</span>
                        <span className="text-muted-foreground mt-0.5 block text-sm">
                          {c.description}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Guias na tela */}
          {!category && (
            <section aria-labelledby="h-guias">
              <h2 id="h-guias" className="letters mb-1 text-xl">
                Guias na tela
              </h2>
              <p className="text-muted-foreground mb-3 text-sm">
                Abre a página e destaca cada botão, com a explicação ao lado.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {guides.map((g) => (
                  <Card key={g.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{g.title.replace(/^Guia d[aoe]s? /, '')}</h3>
                      <StatusTag p={progress.get(g.id)} total={g.steps.length} />
                    </div>
                    <p className="text-muted-foreground flex-1 text-sm">{g.description}</p>
                    <Button
                      size="sm"
                      variant="soft"
                      className="self-start"
                      onClick={() => start(g.id, { restart: true })}
                    >
                      <Play /> Mostrar na tela
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Demonstrações */}
          {demos.length > 0 && (
            <section aria-labelledby="h-demos">
              <h2 id="h-demos" className="letters mb-1 text-xl">
                Demonstrações
              </h2>
              <p className="text-muted-foreground mb-3 text-sm">
                Animações curtas do que acontece do lado do cliente e do seu.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {demos.map((d) => {
                  const p = progress.get(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openDemo(d.id)}
                      className="bg-card shadow-soft hover:shadow-lift focus-visible:ring-ring group flex flex-col gap-2 rounded-lg border p-4 text-left outline-none transition hover:-translate-y-px focus-visible:ring-2"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="bg-inverse text-inverse-foreground flex h-9 w-9 items-center justify-center rounded-full">
                          {p?.status === 'completed' ? (
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          ) : (
                            <Play className="h-4 w-4" aria-hidden />
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {d.scenes.length} cenas ·{' '}
                          {Math.round(d.scenes.reduce((s, x) => s + x.duration, 0) / 1000)} s
                        </span>
                      </span>
                      <span className="font-semibold">{d.title}</span>
                      <span className="text-muted-foreground text-sm">{d.description}</span>
                      {p?.status === 'completed' && (
                        <span className="text-success inline-flex items-center gap-1 text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Assistida
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Tutoriais */}
          {tutorials.length > 0 && (
            <section aria-labelledby="h-tutoriais">
              <h2 id="h-tutoriais" className="letters mb-3 text-xl">
                Passo a passo
              </h2>
              <Card className="divide-y overflow-hidden">
                {tutorials.map((t) => (
                  <Link
                    key={t.slug}
                    to={`/painel/ajuda/${t.slug}`}
                    className="hover:bg-muted/60 focus-visible:bg-muted/60 flex items-center gap-4 px-4 py-3.5 outline-none transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-sm">{t.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {t.steps.length} etapas · {t.minutes} min
                        </span>
                        {t.plan && <Badge variant="outline">Plano {t.plan}</Badge>}
                        <StatusTag p={progress.get(`tutorial:${t.slug}`)} total={t.steps.length} />
                      </div>
                    </div>
                    <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                ))}
              </Card>
            </section>
          )}

          {/* Perguntas frequentes */}
          {articles.some((a) => a.kind === 'faq') && (
            <section aria-labelledby="h-faq">
              <h2 id="h-faq" className="letters mb-3 text-xl">
                Perguntas frequentes
              </h2>
              <div className="space-y-2">
                {articles
                  .filter((a) => a.kind === 'faq')
                  .map((a) => (
                    <details
                      key={a.slug}
                      className="bg-card group rounded-lg border px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                        {a.title}
                        <ArrowRight
                          className="text-muted-foreground h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                      </summary>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        {a.summary}
                      </p>
                      {a.related?.[0] && (
                        <Link
                          to={`/painel/ajuda/${a.related[0]}`}
                          className="text-cobalt mt-2 inline-block text-sm font-semibold underline-offset-4 hover:underline"
                        >
                          Ver o passo a passo
                        </Link>
                      )}
                    </details>
                  ))}
              </div>
            </section>
          )}

          {/* Artigos e problemas */}
          {articles.some((a) => a.kind !== 'faq') && (
            <section aria-labelledby="h-artigos">
              <h2 id="h-artigos" className="letters mb-3 text-xl">
                {category === 'problemas' ? 'Soluções' : 'Artigos e soluções'}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {articles
                  .filter((a) => a.kind !== 'faq')
                  .map((a) => (
                    <Link
                      key={a.slug}
                      to={`/painel/ajuda/${a.slug}`}
                      className="bg-card shadow-soft hover:shadow-lift focus-visible:ring-ring rounded-lg border p-4 outline-none transition hover:-translate-y-px focus-visible:ring-2"
                    >
                      <span className="flex items-center gap-2">
                        {a.kind === 'problem' && (
                          <Wrench className="text-terra h-4 w-4 shrink-0" aria-hidden />
                        )}
                        <span className="font-semibold">{a.title}</span>
                      </span>
                      <span className="text-muted-foreground mt-1 line-clamp-2 block text-sm">
                        {a.summary}
                      </span>
                    </Link>
                  ))}
              </div>
            </section>
          )}

          {/* Preferências */}
          {!category && (
            <section
              aria-labelledby="h-prefs"
              className={cn('flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center')}
            >
              <LifeBuoy className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden />
              <div className="flex-1 text-sm">
                <h2 id="h-prefs" className="font-semibold">
                  Seu progresso
                </h2>
                <p className="text-muted-foreground">
                  {[...progress.values()].filter((p) => p.status === 'completed').length} de{' '}
                  {guides.length + tutorials.length + demos.length + 1} itens vistos. O progresso
                  fica salvo na sua conta, em qualquer aparelho.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {role === 'owner' && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/guia.html" target="_blank" rel="noopener">
                      <Printer /> Guia para imprimir
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={resetProgress} loading={resetting}>
                  <RotateCcw /> Zerar progresso
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
