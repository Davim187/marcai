import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { demoById } from '../content'
import { useHelpUi } from '../help-ui'
import { useHelpActions } from '../state/help-state'
import { SCENES } from './scenes'

/** Diálogo da demonstração aberta (`openDemo(id)` em qualquer lugar do painel). */
export function DemoDialog() {
  const { demoId, closeDemo } = useHelpUi()
  const demo = demoId ? demoById(demoId) : undefined
  return (
    <Dialog open={!!demo} onOpenChange={(o) => !o && closeDemo()}>
      <DialogContent wide className="gap-3">
        {demo && <DemoPlayer key={demo.id} id={demo.id} onLeave={closeDemo} />}
      </DialogContent>
    </Dialog>
  )
}

function DemoPlayer({ id, onLeave }: { id: string; onLeave: () => void }) {
  const demo = demoById(id)!
  const reduce = useReducedMotion()
  const { saveProgress } = useHelpActions()
  const [index, setIndex] = useState(0)
  // Com "reduzir movimento", não troca de cena sozinho: a pessoa avança no próprio ritmo
  const [playing, setPlaying] = useState(!reduce)
  const [ended, setEnded] = useState(false)
  // Faz a barra da cena atual reiniciar quando volta a tocar
  const [cycle, setCycle] = useState(0)
  const saved = useRef(false)
  const scene = demo.scenes[index]!
  const Scene = SCENES[scene.scene]
  const last = index === demo.scenes.length - 1

  useEffect(() => {
    saveProgress(demo.id, 0, 'started')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.id])

  // Chegou à última cena: conta como vista (uma vez por abertura)
  useEffect(() => {
    if (last && !saved.current) {
      saved.current = true
      saveProgress(demo.id, index, 'completed')
    }
  }, [last, index, demo.id, saveProgress])

  useEffect(() => {
    if (!playing || ended) return
    const t = window.setTimeout(() => {
      if (last) {
        setEnded(true)
        setPlaying(false)
      } else setIndex((i) => i + 1)
    }, scene.duration)
    return () => window.clearTimeout(t)
  }, [playing, ended, index, last, scene.duration, cycle])

  const goTo = (i: number) => {
    setEnded(false)
    setIndex(Math.min(Math.max(0, i), demo.scenes.length - 1))
    setCycle((c) => c + 1)
  }
  const replay = () => {
    setEnded(false)
    setIndex(0)
    setPlaying(true)
    setCycle((c) => c + 1)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="pr-8">
        <p className="letters text-muted-foreground text-xs tracking-[0.12em]">Demonstração</p>
        <DialogTitle className="letters text-2xl leading-tight">{demo.title}</DialogTitle>
        <DialogDescription>{demo.description}</DialogDescription>
      </div>

      <div
        className="bg-muted/50 relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-lg p-3"
        // A cena é ilustração: o texto que importa está na legenda
        aria-hidden
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${cycle}`}
            className="w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {Scene ? <Scene /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progresso por cena (clicável) */}
      <div className="flex gap-1.5" role="group" aria-label="Cenas">
        {demo.scenes.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full"
            aria-label={`Cena ${i + 1}: ${s.caption}`}
            aria-current={i === index ? 'step' : undefined}
          >
            <span
              key={i === index ? `${cycle}-${playing}` : 'static'}
              className={cn(
                'bg-primary absolute inset-0 origin-left rounded-full',
                // Pausado no meio, a barra da cena atual volta ao começo (recomeça ao tocar)
                i < index || (i === index && (ended || (reduce && !playing)))
                  ? 'scale-x-100'
                  : 'scale-x-0',
              )}
              style={
                i === index && playing && !ended
                  ? { animation: `demo-fill ${s.duration}ms linear forwards` }
                  : undefined
              }
            />
          </button>
        ))}
      </div>

      <p className="min-h-[2.75rem] text-sm leading-relaxed" aria-live="polite">
        <span className="letters text-muted-foreground mr-2 text-xs tabular-nums">
          {String(index + 1).padStart(2, '0')}/{String(demo.scenes.length).padStart(2, '0')}
        </span>
        {scene.caption}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <Button
            variant="round"
            size="icon-sm"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Cena anterior"
          >
            <ChevronLeft />
          </Button>
          {ended ? (
            <Button size="sm" onClick={replay}>
              <RotateCcw /> Assistir de novo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                setPlaying((p) => !p)
                setCycle((c) => c + 1)
              }}
            >
              {playing ? (
                <>
                  <Pause /> Pausar
                </>
              ) : (
                <>
                  <Play /> Reproduzir
                </>
              )}
            </Button>
          )}
          <Button
            variant="round"
            size="icon-sm"
            onClick={() => goTo(index + 1)}
            disabled={last}
            aria-label="Próxima cena"
          >
            <ChevronRight />
          </Button>
        </div>
        {demo.tutorial && (
          <Button variant="link" size="sm" asChild>
            <Link to={`/painel/ajuda/${demo.tutorial}`} onClick={onLeave}>
              <BookOpen /> Ver o passo a passo
            </Link>
          </Button>
        )}
      </div>
    </MotionConfig>
  )
}
