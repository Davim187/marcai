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
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

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
          className="hover:bg-muted rounded-lg p-2 transition-colors disabled:opacity-30"
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
          className="hover:bg-muted rounded-lg p-2 transition-colors disabled:opacity-30"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div
        className="text-muted-foreground grid grid-cols-7 gap-1.5 text-center text-xs font-medium"
        aria-hidden
      >
        {DOW.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div
        className={cn('grid grid-cols-7 gap-1.5', loading && 'animate-pulse opacity-60')}
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
                // Dia com horário = casa com borda (dá para tocar); sem horário = só o número apagado.
                // Hoje ganha um traço embaixo, igual a uma agenda de papel.
                'relative flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition-[color,background-color,border-color]',
                enabled
                  ? 'bg-card hover:border-foreground/40 border font-semibold'
                  : 'text-muted-foreground/40',
                isSel && 'border-foreground bg-foreground text-background hover:border-foreground',
                date === today &&
                  'after:absolute after:bottom-1.5 after:h-[2px] after:w-3 after:rounded-full after:bg-current',
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
