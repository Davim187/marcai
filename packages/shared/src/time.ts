import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'

export const DEFAULT_TIMEZONE = 'America/Fortaleza'

/** "08:30" → 510 */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 510 → "08:30" */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Converte data local (YYYY-MM-DD) + minutos do dia no fuso informado em um instante UTC. */
export function localToUtc(date: string, minutes: number, timezone: string): Date {
  const dayOffset = Math.floor(minutes / 1440)
  const d = dayOffset ? addDaysToDate(date, dayOffset) : date
  return fromZonedTime(`${d}T${minutesToHHMM(minutes - dayOffset * 1440)}:00`, timezone)
}

/** Data local (YYYY-MM-DD) de um instante no fuso informado. */
export function toLocalDate(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

/** Hora local (HH:mm) de um instante. */
export function toLocalTime(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'HH:mm')
}

/** Dia da semana (0 = domingo) de uma data local YYYY-MM-DD. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

/** Soma dias a uma data local YYYY-MM-DD. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  return dt.toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  return Math.round(
    (Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!) - Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!)) / 86_400_000,
  )
}

export function formatDateLong(instant: Date, timezone: string): string {
  const s = formatInTimeZone(instant, timezone, 'EEEE, dd/MM', { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDateShort(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatInTz(instant: Date, timezone: string, pattern: string): string {
  return formatInTimeZone(instant, timezone, pattern, { locale: ptBR })
}

export { toZonedTime, fromZonedTime }
