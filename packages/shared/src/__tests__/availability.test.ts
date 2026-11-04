import { describe, expect, it } from 'vitest'
import {
  getAvailableDates,
  getDaySlots,
  isSlotAvailable,
  type AvailabilityInput,
} from '../availability'

const TZ = 'America/Fortaleza' // UTC-3, sem horário de verão

// Terça-feira, 04/11/2025 06:00 em Fortaleza (09:00 UTC)
const NOW = new Date('2025-11-04T09:00:00Z')

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    now: NOW,
    shifts: [
      { weekday: 3, start: '08:00', end: '12:00' },
      { weekday: 3, start: '13:30', end: '19:00' },
    ],
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
const WED = '2025-11-05'
const times = (input: AvailabilityInput, date = WED) => getDaySlots(input, date).map((s) => s.time)

describe('motor de disponibilidade', () => {
  it('gera horários dentro dos dois turnos do expediente', () => {
    const t = times(base())
    expect(t[0]).toBe('08:00')
    expect(t).toContain('11:00')
    expect(t).not.toContain('11:30') // 11:30 + 60min passa do fim do turno
    expect(t).not.toContain('12:00')
    expect(t).not.toContain('13:00')
    expect(t).toContain('13:30')
    expect(t.at(-1)).toBe('18:00')
  })

  it('não gera horários em dia sem expediente', () => {
    expect(times(base(), '2025-11-06')).toEqual([])
  })

  it('converte para UTC respeitando o fuso do estabelecimento', () => {
    const [first] = getDaySlots(base(), WED)
    expect(first!.startsAt.toISOString()).toBe('2025-11-05T11:00:00.000Z')
  })

  it('respeita o intervalo entre opções', () => {
    const t = times(base({ slotIntervalMinutes: 60 }))
    expect(t).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '13:30',
      '14:30',
      '15:30',
      '16:30',
      '17:30',
    ])
  })

  it('remove horários que conflitam com agendamentos existentes (considerando a duração)', () => {
    const busy = [
      { startsAt: new Date('2025-11-05T12:00:00Z'), endsAt: new Date('2025-11-05T13:00:00Z') },
    ] // 09:00–10:00 local
    const t = times(base({ busy }))
    expect(t).toContain('08:00')
    expect(t).not.toContain('08:30')
    expect(t).not.toContain('09:00')
    expect(t).not.toContain('09:30')
    expect(t).toContain('10:00')
  })

  it('aplica o intervalo de limpeza após o atendimento', () => {
    const busy = [
      { startsAt: new Date('2025-11-05T12:00:00Z'), endsAt: new Date('2025-11-05T13:00:00Z') },
    ]
    const t = times(base({ busy, bufferMinutes: 15 }))
    // 08:00 + 60 + 15 = 09:15 > 09:00 → conflita
    expect(t).not.toContain('08:00')
    expect(t).toContain('10:00')
  })

  it('respeita bloqueios pontuais (folga, médico)', () => {
    const timeOffs = [
      { startsAt: new Date('2025-11-05T17:00:00Z'), endsAt: new Date('2025-11-05T19:00:00Z') },
    ] // 14:00–16:00
    const t = times(base({ timeOffs }))
    expect(t).not.toContain('13:30') // 13:30–14:30 sobrepõe o bloqueio
    expect(t).not.toContain('14:00')
    expect(t).not.toContain('15:30')
    expect(t).toContain('16:00')
  })

  it('respeita bloqueios recorrentes (almoço)', () => {
    const t = times(
      base({
        shifts: [{ weekday: 3, start: '08:00', end: '18:00' }],
        recurringBlocks: [{ weekday: 3, start: '12:00', end: '13:00' }],
      }),
    )
    expect(t).toContain('11:00')
    expect(t).not.toContain('11:30')
    expect(t).not.toContain('12:00')
    expect(t).not.toContain('12:30')
    expect(t).toContain('13:00')
  })

  it('fecha o dia em feriados', () => {
    expect(times(base({ closedDates: [WED] }))).toEqual([])
  })

  it('respeita a antecedência mínima', () => {
    // agora = quarta 09:10 local; antecedência de 2h → primeiro horário 11:30? 11:30 não cabe; próximo 13:30
    const now = new Date('2025-11-05T12:10:00Z')
    const t = times(base({ now, minAdvanceMinutes: 120 }))
    expect(t[0]).toBe('13:30')
  })

  it('não mostra horários que já passaram hoje', () => {
    const now = new Date('2025-11-05T14:00:00Z') // 11:00 local
    const t = times(base({ now }))
    expect(t).not.toContain('10:30')
    expect(t[0]).toBe('11:00')
  })

  it('respeita a antecedência máxima', () => {
    const input = base({
      maxAdvanceDays: 7,
      shifts: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '08:00', end: '12:00' })),
    })
    expect(times(input, '2025-11-11')).not.toEqual([]) // 7 dias
    expect(times(input, '2025-11-12')).toEqual([]) // 8 dias
    expect(times(input, '2025-11-03')).toEqual([]) // passado
  })

  it('trata a virada de dia: turno noturno que passa da meia-noite', () => {
    const input = base({
      shifts: [{ weekday: 3, start: '22:00', end: '01:00' }],
      slotIntervalMinutes: 60,
    })
    const slots = getDaySlots(input, WED)
    expect(slots.map((s) => s.time)).toEqual(['22:00', '23:00', '00:00'])
    expect(slots[2]!.startsAt.toISOString()).toBe('2025-11-06T03:00:00.000Z')
    expect(isSlotAvailable(input, new Date('2025-11-06T03:00:00Z'))).toBe(true)
  })

  it('trata a virada de dia em UTC: 22:00 local já é o dia seguinte em UTC', () => {
    const input = base({
      shifts: [{ weekday: 3, start: '20:00', end: '23:00' }],
      slotIntervalMinutes: 60,
    })
    const slots = getDaySlots(input, WED)
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2025-11-05T23:00:00.000Z',
      '2025-11-06T00:00:00.000Z',
      '2025-11-06T01:00:00.000Z',
    ])
  })

  it('funciona em outros fusos (ex.: São Paulo, Manaus)', () => {
    const sp = getDaySlots(base({ timezone: 'America/Sao_Paulo' }), WED)
    expect(sp[0]!.startsAt.toISOString()).toBe('2025-11-05T11:00:00.000Z')
    const manaus = getDaySlots(base({ timezone: 'America/Manaus' }), WED)
    expect(manaus[0]!.startsAt.toISOString()).toBe('2025-11-05T12:00:00.000Z')
  })

  it('lista apenas datas com horário livre', () => {
    const dates = getAvailableDates(base(), '2025-11-04', '2025-11-19')
    expect(dates).toEqual(['2025-11-05', '2025-11-12', '2025-11-19'])
  })

  it('isSlotAvailable só aceita horários ofertados', () => {
    expect(isSlotAvailable(base(), new Date('2025-11-05T11:00:00Z'))).toBe(true)
    expect(isSlotAvailable(base(), new Date('2025-11-05T11:10:00Z'))).toBe(false)
    expect(isSlotAvailable(base(), new Date('2025-11-05T15:00:00Z'))).toBe(false) // 12:00 local
  })
})
