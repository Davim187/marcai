import { useEffect, useState } from 'react'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/** Primeiro elemento visível com `data-tour="<id>"` (o mesmo alvo pode existir no menu do celular e do computador). */
function findTarget(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`)
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

const toRect = (r: DOMRect): Rect => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
})

/**
 * Procura o alvo (a página pode ainda estar carregando), rola até ele e acompanha a posição
 * em rolagem e redimensionamento. `missing` vira true se o alvo não aparecer em 2,5 s: aí o
 * balão aparece no centro, sem destaque.
 */
export function useTargetRect(target: string | undefined) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [missing, setMissing] = useState(!target)

  useEffect(() => {
    if (!target) return
    let el: HTMLElement | null = null
    let raf = 0
    let stopped = false
    const started = performance.now()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const measure = () => {
      if (el && el.isConnected) setRect(toRect(el.getBoundingClientRect()))
    }
    const lookup = () => {
      if (stopped) return
      el = findTarget(target)
      if (el) {
        el.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: reduce ? 'auto' : 'smooth',
        })
        measure()
        // A rolagem suave termina depois: mede de novo
        window.setTimeout(measure, reduce ? 0 : 400)
        return
      }
      if (performance.now() - started > 2500) {
        setMissing(true)
        return
      }
      raf = window.setTimeout(lookup, 120) as unknown as number
    }
    lookup()

    const onChange = () => measure()
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    const ro = new ResizeObserver(onChange)
    ro.observe(document.body)
    return () => {
      stopped = true
      window.clearTimeout(raf)
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
      ro.disconnect()
    }
  }, [target])

  return { rect, missing }
}
