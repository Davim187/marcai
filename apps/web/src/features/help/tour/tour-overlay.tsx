import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TourStep } from '../types'
import { type Rect, useTargetRect } from './use-target-rect'

/** Folga em volta do elemento destacado. */
const PAD = 8
const GAP = 14
const BALLOON_W = 360

const pad2 = (n: number) => String(n).padStart(2, '0')

interface Props {
  tourTitle: string
  step: TourStep
  index: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

/** Onde o balão cabe: abaixo, acima, ao lado ou (no celular) preso embaixo da tela. */
function placeBalloon(
  hole: Rect | null,
  size: { w: number; h: number },
  preferred: TourStep['placement'],
): { top: number; left: number; docked: boolean } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 12
  // Celular ou sem alvo: centralizado (sem alvo) ou preso embaixo
  if (!hole || preferred === 'center')
    return { top: Math.max(margin, (vh - size.h) / 2), left: (vw - size.w) / 2, docked: false }
  if (vw < 640) {
    // Embaixo, a não ser que o alvo esteja na metade de baixo: aí em cima
    const below = hole.top + hole.height / 2 < vh / 2
    return {
      top: below ? vh - size.h - margin - 8 : margin + 8,
      left: margin,
      docked: true,
    }
  }
  const clampX = (x: number) => Math.min(Math.max(margin, x), vw - size.w - margin)
  const clampY = (y: number) => Math.min(Math.max(margin, y), vh - size.h - margin)
  const centerX = hole.left + hole.width / 2 - size.w / 2
  const centerY = hole.top + hole.height / 2 - size.h / 2
  const fits = {
    bottom: hole.top + hole.height + GAP + size.h < vh - margin,
    top: hole.top - GAP - size.h > margin,
    right: hole.left + hole.width + GAP + size.w < vw - margin,
    left: hole.left - GAP - size.w > margin,
  }
  const order = [preferred, 'bottom', 'top', 'right', 'left'].filter(Boolean) as Array<
    keyof typeof fits
  >
  const side = order.find((s) => fits[s]) ?? 'bottom'
  if (side === 'bottom')
    return { top: hole.top + hole.height + GAP, left: clampX(centerX), docked: false }
  if (side === 'top') return { top: hole.top - GAP - size.h, left: clampX(centerX), docked: false }
  if (side === 'right')
    return { top: clampY(centerY), left: hole.left + hole.width + GAP, docked: false }
  return { top: clampY(centerY), left: hole.left - GAP - size.w, docked: false }
}

/**
 * Camada do tour: escurece a tela, recorta o elemento da etapa (que continua clicável) e
 * mostra o balão com a explicação. Teclado: ← → navegam, Esc fecha.
 */
export function TourOverlay({ tourTitle, step, index, total, onNext, onBack, onSkip }: Props) {
  const { rect, missing } = useTargetRect(step.target)
  const reduce = useReducedMotion()
  const titleId = useId()
  const bodyId = useId()
  const balloonRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState({ w: BALLOON_W, h: 220 })
  const last = index === total - 1
  // Enquanto procura o alvo, não pisca nada no centro
  const waiting = !!step.target && !rect && !missing

  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null

  useLayoutEffect(() => {
    const el = balloonRef.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [waiting])

  // Foco no botão principal a cada etapa (leitor de tela anuncia o balão)
  useEffect(() => {
    if (!waiting) nextRef.current?.focus({ preventScroll: true })
  }, [waiting, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSkip()
      } else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) onNext()
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement) && index > 0)
        onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onBack, onNext, onSkip])

  const pos = placeBalloon(hole, size, step.placement)
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 34 }

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Escurecimento: quatro faixas em volta do recorte (o elemento destacado continua clicável) */}
      {hole ? (
        <>
          <div
            className="fixed inset-x-0 top-0 bg-black/50"
            style={{ height: Math.max(0, hole.top) }}
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-black/50"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className="fixed left-0 bg-black/50"
            style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }}
          />
          <div
            className="fixed right-0 bg-black/50"
            style={{
              top: hole.top,
              height: hole.height,
              width: Math.max(0, vw - hole.left - hole.width),
            }}
          />
          {/* Acompanha o recorte sem animação: na rolagem os dois andam juntos */}
          <div
            aria-hidden
            className="ring-mustard pointer-events-none fixed rounded-lg ring-[3px]"
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/50" style={{ height: vh }} />
      )}

      {!waiting && (
        <motion.div
          ref={balloonRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, top: pos.top, left: pos.left }}
          transition={spring}
          className={cn(
            'bg-popover text-popover-foreground shadow-lift fixed rounded-xl border p-5',
            pos.docked ? 'right-3 w-auto' : 'w-[min(360px,calc(100vw-24px))]',
          )}
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="letters text-muted-foreground text-[0.72rem] tracking-[0.12em]">
              {tourTitle}
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground -mr-1.5 -mt-1.5 rounded-md p-1.5"
              aria-label="Fechar o guia"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 id={titleId} className="letters mt-1 text-xl leading-tight">
            {step.title}
          </h2>
          <p id={bodyId} className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {step.body}
          </p>
          {missing && step.target && (
            <p className="bg-muted mt-3 rounded-md px-2.5 py-1.5 text-xs">
              Esse item não aparece nesta tela agora (no celular, procure na aba Mais).
            </p>
          )}

          {/* Progresso: segmentos como as letras do quadro */}
          <div className="mt-4 flex items-center gap-3">
            <span
              className="letters text-xs tabular-nums"
              aria-label={`Etapa ${index + 1} de ${total}`}
            >
              {pad2(index + 1)}
              <span className="text-muted-foreground">/{pad2(total)}</span>
            </span>
            <div className="flex flex-1 gap-1" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    i <= index ? 'bg-primary' : 'bg-muted',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
            >
              {last ? 'Fechar' : 'Pular guia'}
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft /> Voltar
                </Button>
              )}
              <Button ref={nextRef} size="sm" onClick={onNext}>
                {last ? (
                  <>
                    <Check /> Finalizar
                  </>
                ) : (
                  <>
                    Próximo <ArrowRight />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>,
    document.body,
  )
}
