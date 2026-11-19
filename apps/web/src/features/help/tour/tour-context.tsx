import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTenant } from '@/lib/session'
import { canSee, tourById } from '../content'
import { useHelpActions, useHelpState } from '../state/help-state'
import type { Tour, TourStep } from '../types'
import { TourOverlay } from './tour-overlay'

interface Running {
  tour: Tour
  steps: TourStep[]
  index: number
}

interface TourApi {
  /** Começa (ou continua de onde parou, se `restart` não for true). */
  start: (tourId: string, opts?: { restart?: boolean }) => void
  active: Running | null
}

const TourCtx = createContext<TourApi | null>(null)

export function useTour() {
  const ctx = useContext(TourCtx)
  if (!ctx) throw new Error('useTour fora do TourProvider')
  return ctx
}

/**
 * Executa tours e guias interativos: navega até a página de cada etapa, salva a etapa
 * vista (para continuar depois) e registra conclusão ou "pulado".
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: state } = useHelpState()
  const { saveProgress } = useHelpActions()
  const [running, setRunning] = useState<Running | null>(null)
  const lastSaved = useRef<string>('')

  const start = useCallback(
    (tourId: string, opts: { restart?: boolean } = {}) => {
      const tour = tourById(tourId)
      if (!tour || !canSee(tour.audience, tenant.role)) return
      const steps = tour.steps.filter((s) => canSee(s.audience, tenant.role))
      const prev = state?.progress.find((p) => p.itemId === tour.id)
      // Continua de onde parou só se ficou no meio (concluído ou pulado começa do zero)
      const index =
        !opts.restart && prev?.status === 'started' ? Math.min(prev.step, steps.length - 1) : 0
      // Guia de página: abre a página primeiro
      if (tour.kind === 'guide' && tour.route && location.pathname !== tour.route)
        navigate(tour.route)
      setRunning({ tour, steps, index })
    },
    [location.pathname, navigate, state?.progress, tenant.role],
  )

  // Cada etapa pode ter sua página: o tour leva até ela
  const step = running?.steps[running.index]
  useEffect(() => {
    if (step?.route && location.pathname !== step.route) navigate(step.route)
  }, [step, location.pathname, navigate])

  // Guarda a etapa atual (uma vez por etapa, não a cada render)
  useEffect(() => {
    if (!running) return
    const key = `${running.tour.id}:${running.index}`
    if (lastSaved.current === key) return
    lastSaved.current = key
    saveProgress(running.tour.id, running.index, 'started')
  }, [running, saveProgress])

  const close = useCallback(
    (status: 'completed' | 'skipped') => {
      if (!running) return
      saveProgress(running.tour.id, running.index, status)
      lastSaved.current = ''
      setRunning(null)
    },
    [running, saveProgress],
  )

  const go = useCallback(
    (delta: number) =>
      setRunning((r) => {
        if (!r) return r
        const index = r.index + delta
        if (index < 0 || index >= r.steps.length) return r
        return { ...r, index }
      }),
    [],
  )

  const value = useMemo(() => ({ start, active: running }), [start, running])

  return (
    <TourCtx.Provider value={value}>
      {children}
      {running && step && (
        <TourOverlay
          // Remonta a cada etapa: o alvo é procurado de novo na página nova
          key={`${running.tour.id}-${running.index}`}
          tourTitle={running.tour.title}
          step={step}
          index={running.index}
          total={running.steps.length}
          onNext={() => (running.index === running.steps.length - 1 ? close('completed') : go(1))}
          onBack={() => go(-1)}
          onSkip={() => close('skipped')}
        />
      )}
    </TourCtx.Provider>
  )
}
