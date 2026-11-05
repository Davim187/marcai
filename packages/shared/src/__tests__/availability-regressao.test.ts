import { describe, expect, it } from 'vitest'
import { getDaySlots, isSlotAvailable, type AvailabilityInput } from '../availability'

const TZ = 'America/Fortaleza'
// Terça 04/11/2025 06:00 local
const NOW = new Date('2025-11-04T09:00:00Z')
const WED = '2025-11-05'

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    now: NOW,
    shifts: [{ weekday: 3, start: '08:00', end: '12:00' }],
    timeOffs: [],
    busy: [],
    durationMinutes: 60,
    bufferMinutes: 0,
    slotIntervalMinutes: 30,
    minAdvanceMinutes: 0,
    maxAdvanceDays: 30,
    ...overrides,
  }
}
const times = (i: AvailabilityInput, d = WED) => getDaySlots(i, d).map((s) => s.time)

describe('REVISAO disponibilidade', () => {
  it('R1 serviço mais longo que o turno não gera horário', () => {
    expect(times(base({ durationMinutes: 300 }))).toEqual([])
  })

  it('R2 intervalo entre opções que não divide o turno (45 min em 4h)', () => {
    expect(times(base({ slotIntervalMinutes: 45 }))).toEqual([
      '08:00',
      '08:45',
      '09:30',
      '10:15',
      '11:00',
    ])
  })

  it('R3 bloqueio pontual cobrindo o dia inteiro fecha o dia', () => {
    const t = base({
      timeOffs: [
        { startsAt: new Date('2025-11-05T03:00:00Z'), endsAt: new Date('2025-11-06T03:00:00Z') },
      ],
    })
    expect(times(t)).toEqual([])
  })

  it('R4 antecedência mínima maior que o turno: nada hoje, amanhã normal', () => {
    // hoje = terça; turno de terça 08–12; antecedência 10h a partir de 06:00 → 16:00
    const t = base({
      shifts: [
        { weekday: 2, start: '08:00', end: '12:00' },
        { weekday: 3, start: '08:00', end: '12:00' },
      ],
      minAdvanceMinutes: 600,
    })
    expect(times(t, '2025-11-04')).toEqual([])
    expect(times(t, WED)[0]).toBe('08:00')
  })

  it('R5 maxAdvanceDays=0: só hoje', () => {
    const t = base({
      shifts: [
        { weekday: 2, start: '08:00', end: '12:00' },
        { weekday: 3, start: '08:00', end: '12:00' },
      ],
      maxAdvanceDays: 0,
    })
    expect(times(t, '2025-11-04').length).toBeGreaterThan(0)
    expect(times(t, WED)).toEqual([])
  })

  it('R6 feriado no dia seguinte: turno noturno que vira a meia-noite não oferece horários no feriado', () => {
    // Terça 20:00–02:00; quarta é feriado. Horários a partir de 00:00 de quarta caem no feriado.
    const t = base({
      shifts: [{ weekday: 2, start: '20:00', end: '02:00' }],
      closedDates: [WED],
    })
    const ts = times(t, '2025-11-04')
    expect(ts).toContain('20:00')
    expect(ts.filter((x) => x < '12:00')).toEqual([]) // nenhum início em 00:xx/01:xx (feriado)
  })

  it('R7 data inexistente (2025-11-33) não deve gerar horários', () => {
    const t = base()
    expect(getDaySlots(t, '2025-11-33')).toEqual([])
  })

  it('R8 bloqueio recorrente "18:00–00:00" (até o fim do dia) bloqueia a noite', () => {
    const t = base({
      shifts: [{ weekday: 3, start: '17:00', end: '21:00' }],
      recurringBlocks: [{ weekday: 3, start: '18:00', end: '00:00' }],
    })
    expect(times(t)).toEqual(['17:00'])
  })

  it('R9 bloqueio recorrente que vira a meia-noite (22:00–02:00) bloqueia o turno noturno', () => {
    const t = base({
      shifts: [{ weekday: 3, start: '20:00', end: '23:59' }],
      recurringBlocks: [{ weekday: 3, start: '22:00', end: '02:00' }],
    })
    expect(times(t)).toEqual(['20:00', '20:30', '21:00'])
  })

  it('R10 isSlotAvailable recusa início fora da grade (08:10)', () => {
    expect(isSlotAvailable(base(), new Date('2025-11-05T11:10:00Z'))).toBe(false)
    expect(isSlotAvailable(base(), new Date('2025-11-05T11:00:00Z'))).toBe(true)
  })

  it('R11 agendamento do turno noturno do dia anterior ocupa o começo do dia seguinte', () => {
    const t = base({
      shifts: [
        { weekday: 2, start: '20:00', end: '02:00' },
        { weekday: 3, start: '00:00', end: '04:00' },
      ],
      busy: [
        { startsAt: new Date('2025-11-05T02:30:00Z'), endsAt: new Date('2025-11-05T04:00:00Z') },
      ], // 23:30–01:00 local
    })
    expect(times(t)).not.toContain('00:00')
    expect(times(t)).not.toContain('00:30')
    expect(times(t)).toContain('01:00')
  })
})
