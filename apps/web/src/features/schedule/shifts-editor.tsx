import { Plus, Trash2 } from 'lucide-react'
import type { ShiftInput } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Editor de expediente semanal com vários turnos por dia (ex.: 08:00–12:00 e 14:00–19:00). */
export function ShiftsEditor({
  value,
  onChange,
}: {
  value: ShiftInput[]
  onChange: (v: ShiftInput[]) => void
}) {
  const byDay = (d: number) => value.filter((s) => s.weekday === d)
  const set = (d: number, shifts: ShiftInput[]) =>
    onChange(
      [...value.filter((s) => s.weekday !== d), ...shifts].sort(
        (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
      ),
    )

  return (
    <div className="bg-card divide-y rounded-xl border">
      {ORDER.map((d) => {
        const shifts = byDay(d)
        const open = shifts.length > 0
        return (
          <div key={d} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
            <div className="flex w-36 items-center gap-3 pt-1.5">
              <Switch
                id={`day-${d}`}
                checked={open}
                onCheckedChange={(v) =>
                  set(d, v ? [{ weekday: d, start: '08:00', end: '18:00' }] : [])
                }
                aria-label={`Atende ${WEEKDAYS[d]}`}
              />
              <label
                htmlFor={`day-${d}`}
                className={cn('text-sm font-medium', !open && 'text-muted-foreground')}
              >
                {WEEKDAYS[d]}
              </label>
            </div>
            <div className="flex-1 space-y-2">
              {!open && <p className="text-muted-foreground pt-2 text-sm">Fechado</p>}
              {shifts.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={s.start}
                    aria-label={`Início do turno ${i + 1} de ${WEEKDAYS[d]}`}
                    className="h-10 w-28"
                    onChange={(e) =>
                      set(
                        d,
                        shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                      )
                    }
                  />
                  <span className="text-muted-foreground text-sm">às</span>
                  <Input
                    type="time"
                    value={s.end}
                    aria-label={`Fim do turno ${i + 1} de ${WEEKDAYS[d]}`}
                    className="h-10 w-28"
                    onChange={(e) =>
                      set(
                        d,
                        shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                      )
                    }
                  />
                  {s.end !== '00:00' && s.end <= s.start && (
                    <span className="text-destructive text-xs" role="alert">
                      O fim precisa ser depois do início
                    </span>
                  )}
                  {shifts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover turno"
                      onClick={() =>
                        set(
                          d,
                          shifts.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
              {open && shifts.length < 4 && (
                <button
                  type="button"
                  className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
                  onClick={() => {
                    const last = shifts.at(-1)!
                    set(d, [
                      ...shifts,
                      { weekday: d, start: last.end < '14:00' ? '14:00' : last.end, end: '19:00' },
                    ])
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar turno (ex.: depois do almoço)
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function defaultShifts(): ShiftInput[] {
  return [2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, start: '08:00', end: '12:00' },
    { weekday, start: '13:30', end: '19:00' },
  ])
}
