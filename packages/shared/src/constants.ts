/** Constantes de domínio compartilhadas entre API e front (fonte única). */
export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

/** Cor padrão da marca e cores sugeridas no onboarding e em Aparência. */
export const DEFAULT_PRIMARY_COLOR = '#1F5F7A'
/** Tons sóbrios (saturação moderada): ficam bem ao lado dos cinzas do painel. */
export const BRAND_PRESET_COLORS = [
  '#1F5F7A',
  '#2F4F8A',
  '#0F766E',
  '#3F6B3A',
  '#6B4C8A',
  '#B4532A',
  '#9B2C4E',
  '#1E293B',
] as const

/** Tolerância para considerar um horário "no passado" (relógios levemente diferentes). */
export const PAST_TOLERANCE_MS = 5 * MINUTE_MS
