import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDaysToDate } from '@marcai/shared'
import { cn } from '@/lib/utils'

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Calendário mensal leve. Trabalha com datas locais YYYY-MM-DD (sem fuso). */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  isEnabled,
  minMonth,
  maxMonth,
  loading,
}: {
  month: string // YYYY-MM
  onMonthChange: (m: string) => void
  selected?: string | null
  onSelect: (date: string) => void
  isEnabled: (date: string) => boolean
  minMonth?: string
  maxMonth?: string
  loading?: boolean
}) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = `${month}-01`
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: Array<string | null> = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDaysToDate(first, i)),
  ]
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    onMonthChange(d.toISOString().slice(0, 7))
  }
  const today = new Date().toLocaleDateString('sv-SE')
  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!!minMonth && month <= minMonth}
          className="hover:bg-muted rounded-full p-2 disabled:opacity-30"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-semibold" aria-live="polite">
          {MONTHS[m - 1]} {y}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!!maxMonth && month >= maxMonth}
          className="hover:bg-muted rounded-full p-2 disabled:opacity-30"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div
        className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs font-semibold"
        aria-hidden
      >
        {DOW.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div
        className={cn('grid grid-cols-7 gap-1', loading && 'animate-pulse opacity-60')}
        role="grid"
      >
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const enabled = !loading && isEnabled(date)
          const isSel = selected === date
          return (
            <button
              key={date}
              type="button"
              disabled={!enabled}
              onClick={() => onSelect(date)}
              aria-pressed={isSel}
              aria-label={`${Number(date.slice(8))} de ${MONTHS[m - 1]}${enabled ? '' : ', sem horários'}`}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-full text-sm font-medium transition',
                enabled ? 'text-foreground hover:bg-primary-soft' : 'text-muted-foreground/40',
                enabled && !isSel && 'bg-primary-soft/50 font-semibold',
                isSel && 'bg-primary text-primary-foreground hover:bg-primary',
                date === today && !isSel && 'ring-primary/40 ring-1',
              )}
            >
              {Number(date.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
