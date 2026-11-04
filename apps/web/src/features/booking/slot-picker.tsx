import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { MonthCalendar } from '@/components/month-calendar'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { capitalize, fmt, todayIn } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { addDaysToDate } from '@marcai/shared'

export interface Slot {
  startsAt: string
  time: string
}

/** Calendário (dias sem horário desabilitados) + horários livres agrupados por período. */
export function SlotPicker({
  slug,
  serviceId,
  professionalId,
  timezone,
  maxAdvanceDays,
  selected,
  onSelect,
  token,
}: {
  slug: string
  serviceId: string
  professionalId: string
  timezone: string
  maxAdvanceDays: number
  selected: Slot | null
  onSelect: (slot: Slot) => void
  token?: string
}) {
  const today = todayIn(timezone)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [date, setDate] = useState<string | null>(null)
  const maxDate = addDaysToDate(today, maxAdvanceDays)
  const monthStart = `${month}-01`
  const from = monthStart < today ? today : monthStart
  const [y, m] = month.split('-').map(Number) as [number, number]
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const to = monthEnd > maxDate ? maxDate : monthEnd

  const days = useQuery({
    queryKey: ['public-days', slug, serviceId, professionalId, month],
    queryFn: () =>
      from > to
        ? Promise.resolve({ dates: [] as string[] })
        : api<{ dates: string[] }>(
            `/public/t/${slug}/availability?serviceId=${serviceId}&professionalId=${professionalId}&from=${from}&to=${to}`,
          ),
    staleTime: 20_000,
  })

  const slots = useQuery({
    queryKey: ['public-slots', slug, serviceId, professionalId, date, token],
    queryFn: () =>
      api<{ slots: Slot[] }>(
        `/public/t/${slug}/slots?serviceId=${serviceId}&professionalId=${professionalId}&date=${date}${token ? `&token=${token}` : ''}`,
      ),
    enabled: !!date,
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  const enabledSet = new Set(days.data?.dates ?? [])
  const groups = [
    { label: 'Manhã', items: (slots.data?.slots ?? []).filter((s) => s.time < '12:00') },
    {
      label: 'Tarde',
      items: (slots.data?.slots ?? []).filter((s) => s.time >= '12:00' && s.time < '18:00'),
    },
    { label: 'Noite', items: (slots.data?.slots ?? []).filter((s) => s.time >= '18:00') },
  ].filter((g) => g.items.length)

  return (
    <div className="space-y-6">
      <div className="bg-card shadow-soft rounded-2xl border p-4">
        <MonthCalendar
          month={month}
          onMonthChange={(mm) => {
            setMonth(mm)
            setDate(null)
          }}
          minMonth={today.slice(0, 7)}
          maxMonth={maxDate.slice(0, 7)}
          selected={date}
          onSelect={setDate}
          isEnabled={(d) => enabledSet.has(d)}
          loading={days.isLoading}
        />
        {!days.isLoading && enabledSet.size === 0 && (
          <p className="text-muted-foreground mt-3 text-center text-sm">
            Nenhum horário livre neste mês. Tente o próximo.
          </p>
        )}
      </div>
      {date && (
        <div>
          <h3 className="mb-3 font-semibold">
            {capitalize(fmt(`${date}T12:00:00Z`, 'UTC', "EEEE, d 'de' MMMM"))}
          </h3>
          {slots.isLoading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : !groups.length ? (
            <p className="bg-muted text-muted-foreground rounded-xl p-4 text-sm">
              Os horários desse dia acabaram de ser preenchidos. Escolha outro dia.
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
                    {g.label}
                  </p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {g.items.map((s) => (
                      <button
                        key={s.startsAt}
                        type="button"
                        onClick={() => onSelect(s)}
                        aria-pressed={selected?.startsAt === s.startsAt}
                        className={cn(
                          'bg-card hover:border-primary hover:text-primary h-11 rounded-xl border text-sm font-semibold tabular-nums transition',
                          selected?.startsAt === s.startsAt &&
                            'border-primary bg-primary text-primary-foreground hover:text-primary-foreground',
                        )}
                      >
                        {fmt(s.startsAt, timezone, 'HH:mm')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
