/** Constantes de domínio compartilhadas entre API e front (fonte única). */
export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

/** Cor padrão da marca e cores sugeridas no onboarding e em Aparência. */
export const DEFAULT_PRIMARY_COLOR = '#4F46E5'
export const BRAND_PRESET_COLORS = [
  '#4F46E5',
  '#2563EB',
  '#0F766E',
  '#059669',
  '#7C3AED',
  '#C2410C',
  '#B4235A',
  '#0F172A',
] as const

/** Tolerância para considerar um horário "no passado" (relógios levemente diferentes). */
export const PAST_TOLERANCE_MS = 5 * MINUTE_MS
