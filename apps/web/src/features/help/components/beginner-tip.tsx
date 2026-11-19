import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen, Lightbulb, Play } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/lib/session'
import { beginnerTipFor, canSee, tourById, tutorialBySlug } from '../content'
import { useBeginnerMode } from '../state/help-state'
import { useTour } from '../tour/tour-context'

/**
 * Dica do modo iniciante no topo da página: o que é a página, com atalho para o guia
 * interativo e o tutorial. Some quando o modo iniciante está desligado.
 */
export function BeginnerTip() {
  const beginner = useBeginnerMode()
  const { pathname } = useLocation()
  const { tenant } = useTenant()
  const { start } = useTour()
  const reduce = useReducedMotion()
  const tip = beginnerTipFor(pathname)
  if (!beginner || !tip) return null
  const guide = tip.guideId ? tourById(tip.guideId) : undefined
  const tutorial = tip.tutorial ? tutorialBySlug(tip.tutorial) : undefined
  return (
    <motion.aside
      key={tip.route}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-accent text-accent-foreground mb-5 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center"
      aria-label="Dica do modo iniciante"
    >
      <Lightbulb className="h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{tip.title}</p>
        <p className="text-accent-foreground/85 mt-0.5">{tip.body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {guide && canSee(guide.audience, tenant.role) && (
          <Button size="sm" variant="inverse" onClick={() => start(guide.id, { restart: true })}>
            <Play /> Mostrar na tela
          </Button>
        )}
        {tutorial && canSee(tutorial.audience, tenant.role) && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/painel/ajuda/${tutorial.slug}`}>
              <BookOpen /> Passo a passo
            </Link>
          </Button>
        )}
      </div>
    </motion.aside>
  )
}
