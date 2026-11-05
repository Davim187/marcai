/** Geração de paleta a partir da cor principal com contraste acessível (WCAG AA). */
export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function mix(a: string, b: string, weight: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex({
    r: ca.r * (1 - weight) + cb.r * weight,
    g: ca.g * (1 - weight) + cb.g * weight,
    b: ca.b * (1 - weight) + cb.b * weight,
  })
}

export function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
}

/** Escurece a cor até ter contraste AA (4.5:1) com branco, para usar em botões e links. */
export function ensureContrastOnWhite(hex: string): string {
  let c = hex
  for (let i = 0; i < 20 && contrastRatio(c, '#ffffff') < 4.5; i++) c = mix(c, '#000000', 0.08)
  return c
}

export interface Palette {
  primary: string
  primaryForeground: string
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
}

export function generatePalette(base: string): Palette {
  const safe = isHexColor(base) ? base : '#1F5F7A'
  const primary = ensureContrastOnWhite(safe)
  return {
    primary,
    primaryForeground: contrastRatio(primary, '#ffffff') >= 4.5 ? '#ffffff' : '#111111',
    50: mix(safe, '#ffffff', 0.94),
    100: mix(safe, '#ffffff', 0.86),
    200: mix(safe, '#ffffff', 0.72),
    300: mix(safe, '#ffffff', 0.52),
    400: mix(safe, '#ffffff', 0.28),
    500: safe,
    600: mix(safe, '#000000', 0.12),
    700: mix(safe, '#000000', 0.26),
    800: mix(safe, '#000000', 0.42),
    900: mix(safe, '#000000', 0.58),
  }
}

/** Converte hex em "H S% L%" (formato usado nas variáveis CSS do Tailwind/shadcn). */
export function hexToHslString(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
