/** Feriados nacionais do Brasil (fixos + móveis calculados a partir da Páscoa). */
export interface HolidayDef {
  date: string
  name: string
}

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shift(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

export function brazilianHolidays(year: number): HolidayDef[] {
  const easter = easterSunday(year)
  const list: HolidayDef[] = [
    { date: `${year}-01-01`, name: 'Confraternização Universal' },
    { date: iso(shift(easter, -48)), name: 'Carnaval (segunda)' },
    { date: iso(shift(easter, -47)), name: 'Carnaval (terça)' },
    { date: iso(shift(easter, -2)), name: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, name: 'Tiradentes' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho' },
    { date: iso(shift(easter, 60)), name: 'Corpus Christi' },
    { date: `${year}-09-07`, name: 'Independência do Brasil' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, name: 'Finados' },
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-11-20`, name: 'Dia da Consciência Negra' },
    { date: `${year}-12-25`, name: 'Natal' },
  ]
  return list.sort((a, b) => a.date.localeCompare(b.date))
}
