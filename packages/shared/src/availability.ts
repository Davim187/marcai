import {
  addDaysToDate,
  diffDays,
  hhmmToMinutes,
  localToUtc,
  minutesToHHMM,
  toLocalDate,
  weekdayOf,
} from './time'
import { MINUTE_MS } from './constants'

/**
 * Motor de disponibilidade — função pura usada pelo back-end como fonte da verdade.
 * Todos os instantes são `Date` (UTC). Expedientes e bloqueios recorrentes são em hora local.
 */
export interface Shift {
  weekday: number // 0 = domingo
  start: string // "08:00"
  end: string // "12:00"
}

export interface RecurringBlock {
  weekday: number
  start: string
  end: string
}

export interface Interval {
  startsAt: Date
  endsAt: Date
}

export interface AvailabilityInput {
  timezone: string
  now: Date
  shifts: Shift[]
  /** Bloqueios pontuais (folga, médico) em UTC. */
  timeOffs: Interval[]
  /** Bloqueios semanais (ex.: almoço todo dia 12:00–13:00). */
  recurringBlocks?: RecurringBlock[]
  /** Datas locais (YYYY-MM-DD) fechadas: feriados. */
  closedDates?: string[]
  /** Agendamentos existentes: intervalo já inclui o intervalo de limpeza (blockedUntil). */
  busy: Interval[]
  durationMinutes: number
  bufferMinutes: number
  slotIntervalMinutes: number
  minAdvanceMinutes: number
  maxAdvanceDays: number
}

export interface Slot {
  startsAt: Date
  endsAt: Date
  /** Hora local "HH:mm" */
  time: string
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Lista os horários livres de uma data local (YYYY-MM-DD). */
export function getDaySlots(input: AvailabilityInput, date: string): Slot[] {
  const {
    timezone,
    now,
    durationMinutes,
    bufferMinutes,
    slotIntervalMinutes,
    minAdvanceMinutes,
    maxAdvanceDays,
  } = input
  if (durationMinutes <= 0 || slotIntervalMinutes <= 0) return []
  if (!isRealDate(date)) return []
  const closed = new Set(input.closedDates ?? [])
  if (closed.has(date)) return []

  const today = toLocalDate(now, timezone)
  const daysAhead = diffDays(date, today)
  if (daysAhead < 0 || daysAhead > maxAdvanceDays) return []

  const weekday = weekdayOf(date)
  const earliest = now.getTime() + minAdvanceMinutes * MINUTE_MS

  const blocks: Array<[number, number]> = [
    ...input.timeOffs.map((t) => [t.startsAt.getTime(), t.endsAt.getTime()] as [number, number]),
    ...(input.recurringBlocks ?? [])
      .filter((b) => b.weekday === weekday)
      .map((b) => {
        const start = hhmmToMinutes(b.start)
        let end = hhmmToMinutes(b.end)
        // "00:00" no fim = até a meia-noite; fim antes do início = atravessa a meia-noite
        if (end <= start) end += 1440
        return [
          localToUtc(date, start, timezone).getTime(),
          localToUtc(date, end, timezone).getTime(),
        ] as [number, number]
      }),
  ]
  const busy = input.busy.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as const)

  const shifts = input.shifts
    .filter((s) => s.weekday === weekday)
    .map((s) => {
      const start = hhmmToMinutes(s.start)
      let end = hhmmToMinutes(s.end)
      // Turno que vira o dia (ex.: 20:00–02:00) ou termina à meia-noite ("00:00"/"24:00").
      if (end <= start) end += 1440
      return [start, end] as const
    })
    .sort((a, b) => a[0] - b[0])

  const seen = new Set<number>()
  const slots: Slot[] = []
  for (const [shiftStart, shiftEnd] of shifts) {
    for (let m = shiftStart; m + durationMinutes <= shiftEnd; m += slotIntervalMinutes) {
      // Turno noturno: o trecho depois da meia-noite pertence ao dia seguinte (que pode ser feriado)
      if (m >= 1440 && closed.has(addDaysToDate(date, 1))) break
      const start = localToUtc(date, m, timezone).getTime()
      if (seen.has(start)) continue
      const end = start + durationMinutes * MINUTE_MS
      const blockedUntil = end + bufferMinutes * MINUTE_MS
      if (start < earliest) continue
      if (blocks.some(([s, e]) => overlaps(start, end, s, e))) continue
      if (busy.some(([s, e]) => overlaps(start, blockedUntil, s, e))) continue
      seen.add(start)
      slots.push({
        startsAt: new Date(start),
        endsAt: new Date(end),
        time: minutesToHHMM(m % 1440),
      })
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

function isRealDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Datas (YYYY-MM-DD) entre from e to (inclusive) com pelo menos um horário livre. */
export function getAvailableDates(input: AvailabilityInput, from: string, to: string): string[] {
  const result: string[] = []
  const total = Math.min(diffDays(to, from), 400)
  for (let i = 0; i <= total; i++) {
    const date = addDaysToDate(from, i)
    if (getDaySlots(input, date).length > 0) result.push(date)
  }
  return result
}

/** Verifica se um início específico é um horário ofertável (usado na criação da reserva). */
export function isSlotAvailable(input: AvailabilityInput, startsAt: Date): boolean {
  const date = toLocalDate(startsAt, input.timezone)
  // Considera também o dia anterior, por causa de turnos que viram a meia-noite.
  return [date, addDaysToDate(date, -1)].some((d) =>
    getDaySlots(input, d).some((s) => s.startsAt.getTime() === startsAt.getTime()),
  )
}
