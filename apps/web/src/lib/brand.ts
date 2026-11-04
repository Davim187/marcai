import { generatePalette, hexToHslString } from '@marcai/shared'

/** Aplica a cor principal do tenant nas variáveis CSS (paleta com contraste AA). */
export function applyBrandColor(
  hex: string | null | undefined,
  el: HTMLElement = document.documentElement,
) {
  if (!hex) {
    el.style.removeProperty('--primary')
    el.style.removeProperty('--ring')
    el.style.removeProperty('--primary-soft')
    el.style.removeProperty('--primary-foreground')
    return
  }
  const p = generatePalette(hex)
  el.style.setProperty('--primary', hexToHslString(p.primary))
  el.style.setProperty('--ring', hexToHslString(p.primary))
  el.style.setProperty('--primary-soft', hexToHslString(p[50]))
  el.style.setProperty('--primary-foreground', hexToHslString(p.primaryForeground))
}

export function brandStyle(hex: string | null | undefined): React.CSSProperties {
  if (!hex) return {}
  const p = generatePalette(hex)
  return {
    ['--primary' as string]: hexToHslString(p.primary),
    ['--ring' as string]: hexToHslString(p.primary),
    ['--primary-soft' as string]: hexToHslString(p[50]),
    ['--primary-foreground' as string]: hexToHslString(p.primaryForeground),
  }
}
