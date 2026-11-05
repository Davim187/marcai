import { describe, expect, it } from 'vitest'
import { dragDeltaToMinutes, layoutOverlaps, visibleRange } from './agenda-layout'

const ev = (id: string, start: string, end: string) => ({
  id,
  startsAt: `2026-11-05T${start}:00Z`,
  endsAt: `2026-11-05T${end}:00Z`,
})
const shape = (list: ReturnType<typeof layoutOverlaps<ReturnType<typeof ev>>>) =>
  Object.fromEntries(list.map((p) => [p.item.id, `${p.lane}/${p.lanes}`]))

describe('layoutOverlaps (colunas da agenda)', () => {
  it('eventos separados ocupam a largura toda', () => {
    expect(shape(layoutOverlaps([ev('a', '08:00', '09:00'), ev('b', '10:00', '11:00')]))).toEqual({
      a: '0/1',
      b: '0/1',
    })
  })
  it('eventos que só se encostam não dividem a coluna', () => {
    expect(shape(layoutOverlaps([ev('a', '08:00', '09:00'), ev('b', '09:00', '10:00')]))).toEqual({
      a: '0/1',
      b: '0/1',
    })
  })
  it('dois sobrepostos ficam lado a lado', () => {
    expect(shape(layoutOverlaps([ev('a', '08:00', '10:00'), ev('b', '09:00', '11:00')]))).toEqual({
      a: '0/2',
      b: '1/2',
    })
  })
  it('reaproveita a coluna livre dentro do mesmo grupo', () => {
    // a 08–12, b 08–09, c 09–10 (cabe na coluna de b) → 2 colunas
    const r = shape(
      layoutOverlaps([
        ev('a', '08:00', '12:00'),
        ev('b', '08:00', '09:00'),
        ev('c', '09:00', '10:00'),
      ]),
    )
    expect(r).toEqual({ a: '0/2', b: '1/2', c: '1/2' })
  })
  it('três ao mesmo tempo → 3 colunas, e o grupo seguinte recomeça', () => {
    const r = shape(
      layoutOverlaps([
        ev('a', '08:00', '09:00'),
        ev('b', '08:00', '09:00'),
        ev('c', '08:30', '09:30'),
        ev('d', '14:00', '15:00'),
      ]),
    )
    expect(r).toEqual({ a: '0/3', b: '1/3', c: '2/3', d: '0/1' })
  })
})

describe('arraste e faixa visível', () => {
  it('encaixa o arraste de 15 em 15 minutos', () => {
    expect(dragDeltaToMinutes(0)).toBe(0)
    expect(dragDeltaToMinutes(1.2 * 20)).toBe(15)
    expect(dragDeltaToMinutes(-1.2 * 50)).toBe(-45)
  })
  it('amplia a faixa 07–21 quando há agendamento fora dela', () => {
    expect(visibleRange([])).toEqual({ startMinute: 420, endMinute: 1260 })
    expect(visibleRange([6 * 60 + 30, 22 * 60 + 10])).toEqual({ startMinute: 360, endMinute: 1380 })
  })
})
