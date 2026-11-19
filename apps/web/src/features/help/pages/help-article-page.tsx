import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Play,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'
import { canSee, categoryById, entryBySlug, tourById } from '../content'
import { UiChips } from '../components/ui-chip'
import { useHelpActions, useHelpState } from '../state/help-state'
import { useTour } from '../tour/tour-context'
import type { Article, Tutorial } from '../types'

export default function HelpArticlePage() {
  const { slug = '' } = useParams()
  const { tenant } = useTenant()
  const entry = entryBySlug(slug)

  if (!entry || !canSee(entry.item.audience, tenant.role)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="letters text-3xl">Conteúdo não encontrado</h1>
        <p className="text-muted-foreground mt-2">
          Esse artigo não existe ou é só para a dona da conta.
        </p>
        <Button asChild className="mt-6">
          <Link to="/painel/ajuda">Voltar para a central de ajuda</Link>
        </Button>
      </div>
    )
  }
  const cat = categoryById(entry.item.category)
  return (
    <div className="mx-auto max-w-3xl">
      <nav
        aria-label="Caminho"
        className="text-muted-foreground mb-4 flex items-center gap-1.5 text-sm"
      >
        <Link to="/painel/ajuda" className="hover:text-foreground font-medium">
          Central de ajuda
        </Link>
        {cat && (
          <>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <Link to={`/painel/ajuda?categoria=${cat.id}`} className="hover:text-foreground">
              {cat.title}
            </Link>
          </>
        )}
      </nav>
      {entry.type === 'tutorial' ? (
        <TutorialPlayer key={entry.item.slug} t={entry.item} />
      ) : (
        <ArticleView a={entry.item as Article} />
      )}
    </div>
  )
}

function ArticleView({ a }: { a: Article }) {
  const { tenant } = useTenant()
  const related = (a.related ?? [])
    .map((s) => entryBySlug(s))
    .filter((e) => e && canSee(e.item.audience, tenant.role))
  return (
    <article>
      <h1 className="letters text-[2.1rem] leading-none sm:text-[2.6rem]">{a.title}</h1>
      <p className="text-muted-foreground mt-3 text-lg leading-relaxed">{a.summary}</p>
      {a.sections.length > 0 && (
        <div className="mt-6 space-y-5">
          {a.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2 className="mb-1.5 text-lg font-semibold">{s.heading}</h2>}
              <p className="leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
      )}
      {a.route && (
        <Button asChild className="mt-8">
          <Link to={a.route}>
            Abrir no painel <ExternalLink />
          </Link>
        </Button>
      )}
      {related.length > 0 && (
        <section className="mt-10 border-t pt-6" aria-labelledby="h-related">
          <h2 id="h-related" className="letters mb-3 text-lg">
            Veja também
          </h2>
          <ul className="space-y-2">
            {related.map((e) => (
              <li key={e!.item.title}>
                <Link
                  to={`/painel/ajuda/${'slug' in e!.item ? e!.item.slug : ''}`}
                  className="text-cobalt font-semibold underline-offset-4 hover:underline"
                >
                  {e!.item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

/**
 * Tutorial com etapas numeradas: uma etapa por vez, com o desenho do que procurar na tela.
 * Guarda a etapa vista (para continuar depois) e a conclusão.
 */
function TutorialPlayer({ t }: { t: Tutorial }) {
  const itemId = `tutorial:${t.slug}`
  const { data } = useHelpState()
  const { saveProgress } = useHelpActions()
  const { start } = useTour()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const saved = data?.progress.find((p) => p.itemId === itemId)
  // Continua de onde parou (só se ficou no meio)
  const [index, setIndex] = useState(() =>
    saved?.status === 'started' ? Math.min(saved.step, t.steps.length - 1) : 0,
  )
  const [done, setDone] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const step = t.steps[index]!
  const last = index === t.steps.length - 1
  const guide = t.guideId ? tourById(t.guideId) : undefined

  useEffect(() => {
    if (done) return
    saveProgress(itemId, index, 'started')
    // Foco no título da etapa ao trocar (não na primeira renderização)
    if (first.current) first.current = false
    else headingRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  function finish() {
    saveProgress(itemId, index, 'completed')
    setDone(true)
  }

  return (
    <article>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="muted">Passo a passo</Badge>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {t.minutes} min
        </span>
        {t.plan && <Badge variant="outline">Plano {t.plan}</Badge>}
        {saved && saved.timesCompleted > 0 && (
          <span className="text-success inline-flex items-center gap-1 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Concluído {saved.timesCompleted > 1 ? `${saved.timesCompleted} vezes` : ''}
          </span>
        )}
      </div>
      <h1 className="letters mt-2 text-[2.1rem] leading-none sm:text-[2.6rem]">{t.title}</h1>
      <p className="text-muted-foreground mt-2 text-lg">{t.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {guide && (
          <Button variant="inverse" onClick={() => start(guide.id, { restart: true })}>
            <Play /> Mostrar na tela
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(t.route)}>
          Abrir a página <ExternalLink />
        </Button>
      </div>

      {done ? (
        <Card className="mt-8 flex flex-col items-center gap-3 p-8 text-center">
          <span className="bg-green text-green-foreground flex h-12 w-12 items-center justify-center rounded-full">
            <Check className="h-6 w-6" strokeWidth={3} aria-hidden />
          </span>
          <h2 className="letters text-2xl" tabIndex={-1}>
            Pronto!
          </h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Tutorial concluído. Ele fica marcado como visto na central de ajuda.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDone(false)
                setIndex(0)
              }}
            >
              <RotateCcw /> Ver de novo
            </Button>
            <Button asChild>
              <Link to="/painel/ajuda">Voltar para a central</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-[220px_1fr]">
          {/* Lista das etapas */}
          <ol className="space-y-1" aria-label="Etapas">
            {t.steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'focus-visible:ring-ring flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2',
                    i === index ? 'bg-card shadow-soft font-semibold' : 'hover:bg-muted/70',
                  )}
                >
                  <span
                    className={cn(
                      'letters flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                      i < index
                        ? 'bg-green text-green-foreground'
                        : i === index
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i < index ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className="pt-0.5">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {/* Etapa atual */}
          <motion.section
            key={index}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            aria-live="polite"
          >
            <Card className="p-5 sm:p-6">
              <p className="letters text-muted-foreground text-xs tracking-[0.12em]">
                Etapa {index + 1} de {t.steps.length}
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-xl font-semibold outline-none"
              >
                {step.title}
              </h2>
              <p className="mt-2 leading-relaxed">{step.body}</p>
              {step.ui && <UiChips chips={step.ui} className="mt-4" />}
              <div className="mt-6 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setIndex((i) => i - 1)}
                  disabled={index === 0}
                >
                  <ArrowLeft /> Voltar
                </Button>
                {last ? (
                  <Button onClick={finish}>
                    <Check /> Concluir
                  </Button>
                ) : (
                  <Button onClick={() => setIndex((i) => i + 1)}>
                    Próxima etapa <ArrowRight />
                  </Button>
                )}
              </div>
            </Card>
          </motion.section>
        </div>
      )}
    </article>
  )
}
