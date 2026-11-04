import { hhmmToMinutes } from '@marcai/shared'
import { fmt } from './dates'

/** Escala da grade da agenda. */
export const AGENDA_PX_PER_MINUTE = 1.2
/** Arrastar e clicar "encaixam" de 15 em 15 minutos. */
export const AGENDA_SNAP_MINUTES = 15
/** A grade mostra pelo menos das 07:00 às 21:00 (estica se houver agendamento fora disso). */
export const AGENDA_DEFAULT_START_MINUTE = 7 * 60
export const AGENDA_DEFAULT_END_MINUTE = 21 * 60

/** Minutos desde 00:00 no fuso do estabelecimento. */
export function localMinutes(iso: string, timezone: string) {
  return hhmmToMinutes(fmt(iso, timezone, 'HH:mm'))
}

/** Converte o deslocamento vertical do arraste em minutos, encaixando na grade. */
export function dragDeltaToMinutes(deltaY: number) {
  return Math.round(deltaY / AGENDA_PX_PER_MINUTE / AGENDA_SNAP_MINUTES) * AGENDA_SNAP_MINUTES
}

/** Faixa de horas exibida: o padrão, ampliado para caber todos os agendamentos. */
export function visibleRange(minutes: number[]) {
  return {
    startMinute: Math.min(
      AGENDA_DEFAULT_START_MINUTE,
      ...minutes.map((m) => Math.floor(m / 60) * 60),
    ),
    endMinute: Math.max(AGENDA_DEFAULT_END_MINUTE, ...minutes.map((m) => Math.ceil(m / 60) * 60)),
  }
}

export interface Positioned<T> {
  item: T
  /** Coluna do evento dentro do grupo de sobreposição (0, 1, 2…) */
  lane: number
  /** Quantas colunas o grupo usa (largura = 100% / lanes) */
  lanes: number
}

/**
 * Distribui eventos sobrepostos em colunas lado a lado (como Google Agenda).
 * Eventos que se encostam (fim = início) não contam como sobreposição.
 */
export function layoutOverlaps<T extends { startsAt: string; endsAt: string }>(
  events: T[],
): Positioned<T>[] {
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const result: Positioned<T>[] = []
  let group: Positioned<T>[] = []
  let groupEnd = ''
  const laneEnds: string[] = []
  const closeGroup = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1))
    group.forEach((g) => (g.lanes = lanes))
    result.push(...group)
    group = []
    laneEnds.length = 0
  }
  for (const event of sorted) {
    if (group.length && event.startsAt >= groupEnd) closeGroup()
    let lane = laneEnds.findIndex((end) => end <= event.startsAt)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = event.endsAt
    group.push({ item: event, lane, lanes: 1 })
    groupEnd = group.length === 1 || event.endsAt > groupEnd ? event.endsAt : groupEnd
  }
  closeGroup()
  return result
}
