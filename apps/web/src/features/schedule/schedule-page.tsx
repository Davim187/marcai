import { askConfirm } from '@/components/confirm-host'
import { useQuery } from '@tanstack/react-query'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ShiftInput } from '@marcai/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { api, FriendlyError } from '@/lib/api'
import { capitalize, fmt, localToIso, todayIn } from '@/lib/dates'
import { qk, useApiMutation, useProfessionals, createTimeOff } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import { ShiftsEditor, WEEKDAYS } from './shifts-editor'

interface ScheduleData {
  workingHours: Array<ShiftInput & { id: string; professionalId: string }>
  timeOffs: Array<{
    id: string
    professionalId: string | null
    startsAt: string
    endsAt: string
    reason: string | null
  }>
  recurringBlocks: Array<{
    id: string
    professionalId: string | null
    weekday: number
    start: string
    end: string
    reason: string | null
  }>
  holidays: Array<{ id: string; date: string; name: string; closed: boolean; source: string }>
}

export default function SchedulePage() {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const isOwner = tenant.role === 'owner'
  const { data: professionals = [] } = useProfessionals()
  const [professionalId, setProfessionalId] = useState<string>()
  useEffect(() => {
    if (!professionalId && professionals.length)
      setProfessionalId(tenant.professionalId ?? professionals[0]!.id)
  }, [professionals, professionalId, tenant.professionalId])

  const { data, isLoading } = useQuery({
    queryKey: qk.schedule(professionalId),
    queryFn: () => api<ScheduleData>(`/schedule?professionalId=${professionalId}`),
    enabled: !!professionalId,
  })
  const [shifts, setShifts] = useState<ShiftInput[]>([])
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (data) {
      setShifts(data.workingHours.map(({ weekday, start, end }) => ({ weekday, start, end })))
      setDirty(false)
    }
  }, [data])

  const saveHours = useApiMutation(
    () => api('/schedule/working-hours', { method: 'PUT', body: { professionalId, shifts } }),
    {
      success: 'Expediente salvo',
      invalidate: [qk.schedule(professionalId)],
    },
  )
  const delTimeOff = useApiMutation(
    (id: string) => api(`/schedule/time-off/${id}`, { method: 'DELETE' }),
    { success: 'Bloqueio removido', invalidate: [qk.schedule(professionalId)] },
  )
  const delBlock = useApiMutation(
    (id: string) => api(`/schedule/recurring-blocks/${id}`, { method: 'DELETE' }),
    { success: 'Pausa removida', invalidate: [qk.schedule(professionalId)] },
  )
  const toggleHoliday = useApiMutation(
    (h: { id: string; closed: boolean }) =>
      api(`/schedule/holidays/${h.id}`, { method: 'PATCH', body: { closed: h.closed } }),
    { invalidate: [qk.schedule(professionalId)] },
  )
  const delHoliday = useApiMutation(
    (id: string) => api(`/schedule/holidays/${id}`, { method: 'DELETE' }),
    { invalidate: [qk.schedule(professionalId)] },
  )

  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Horários"
        description="Seu expediente, pausas, folgas e feriados. Só os horários livres aparecem para as clientes."
        actions={
          professionals.length > 1 && isOwner ? (
            <NativeSelect
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              aria-label="Profissional"
              className="w-56"
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Expediente semanal</CardTitle>
              <CardDescription>
                Ligue os dias em que atende e defina um ou mais turnos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-96" />
              ) : (
                <ShiftsEditor
                  value={shifts}
                  onChange={(v) => {
                    setShifts(v)
                    setDirty(true)
                  }}
                />
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => saveHours.mutate()}
                  loading={saveHours.isPending}
                  disabled={!dirty}
                >
                  Salvar expediente
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Folgas e bloqueios</CardTitle>
                <CardDescription>Médico, viagem, folga…</CardDescription>
              </div>
              <Button size="sm" variant="soft" onClick={() => setTimeOffOpen(true)}>
                <Plus /> Bloquear
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data?.timeOffs.length && (
                <p className="text-muted-foreground text-sm">Nenhum bloqueio agendado.</p>
              )}
              {data?.timeOffs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <CalendarOff className="text-primary h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {t.reason || 'Bloqueio'}{' '}
                      {!t.professionalId && <Badge variant="muted">Todas</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      {capitalize(fmt(t.startsAt, tz, 'EEE dd/MM HH:mm'))} →{' '}
                      {fmt(
                        t.endsAt,
                        tz,
                        fmt(t.startsAt, tz, 'yyyyMMdd') === fmt(t.endsAt, tz, 'yyyyMMdd')
                          ? 'HH:mm'
                          : 'EEE dd/MM HH:mm',
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover bloqueio"
                    onClick={async () => {
                      if (
                        await askConfirm({
                          title: 'Remover este bloqueio?',
                          description: 'O horário volta a ficar livre para agendamentos na hora.',
                        })
                      )
                        delTimeOff.mutate(t.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Pausas fixas</CardTitle>
                <CardDescription>Repetem toda semana (ex.: almoço).</CardDescription>
              </div>
              <Button size="sm" variant="soft" onClick={() => setBlockOpen(true)}>
                <Plus /> Pausa
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data?.recurringBlocks.length && (
                <p className="text-muted-foreground text-sm">Nenhuma pausa fixa.</p>
              )}
              {data?.recurringBlocks.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{b.reason || 'Pausa'}</p>
                    <p className="text-muted-foreground">
                      {WEEKDAYS[b.weekday]} · {b.start} às {b.end}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover pausa"
                    onClick={async () => {
                      if (
                        await askConfirm({
                          title: 'Remover esta pausa?',
                          description:
                            'Esse horário volta a aparecer para as clientes toda semana.',
                        })
                      )
                        delBlock.mutate(b.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {isOwner && (
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Feriados</CardTitle>
                  <CardDescription>
                    Nacionais carregados automaticamente. Desligue se for atender.
                  </CardDescription>
                </div>
                <Button size="sm" variant="soft" onClick={() => setHolidayOpen(true)}>
                  <Plus /> Data
                </Button>
              </CardHeader>
              <CardContent className="max-h-80 space-y-1 overflow-y-auto">
                {data?.holidays.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="text-muted-foreground w-14 font-medium tabular-nums">
                      {h.date.slice(8, 10)}/{h.date.slice(5, 7)}
                    </span>
                    <span className="flex-1">{h.name}</span>
                    <Switch
                      checked={h.closed}
                      onCheckedChange={(closed) => toggleHoliday.mutate({ id: h.id, closed })}
                      aria-label={`${h.name}: ${h.closed ? 'fechado' : 'aberto'}`}
                    />
                    {h.source === 'custom' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover data"
                        onClick={async () => {
                          if (await askConfirm({ title: `Remover ${h.name}?` }))
                            delHoliday.mutate(h.id)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <TimeOffDialog
        open={timeOffOpen}
        onClose={() => setTimeOffOpen(false)}
        tz={tz}
        professionalId={professionalId}
        isOwner={isOwner}
      />
      <BlockDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        professionalId={professionalId}
      />
      <HolidayDialog
        open={holidayOpen}
        onClose={() => setHolidayOpen(false)}
        professionalId={professionalId}
      />
    </div>
  )
}

function TimeOffDialog({
  open,
  onClose,
  tz,
  professionalId,
  isOwner,
}: {
  open: boolean
  onClose: () => void
  tz: string
  professionalId?: string
  isOwner: boolean
}) {
  const today = todayIn(tz)
  const [v, setV] = useState({
    startDate: today,
    endDate: today,
    allDay: true,
    start: '08:00',
    end: '12:00',
    reason: '',
    everyone: false,
  })
  const save = useApiMutation(
    () => {
      // Data apagada: avisa o campo certo em vez de um erro genérico
      if (!v.startDate || (v.allDay && !v.endDate))
        return Promise.reject(new FriendlyError('Escolha a data do bloqueio.'))
      if (!v.allDay && (!v.start || !v.end || v.end <= v.start))
        return Promise.reject(
          new FriendlyError('Informe os horários: o fim precisa ser depois do início.'),
        )
      return createTimeOff({
        professionalId: v.everyone ? null : professionalId,
        reason: v.reason,
        startsAt: localToIso(v.startDate, v.allDay ? '00:00' : v.start, tz),
        endsAt: v.allDay ? localToIso(v.endDate, '23:59', tz) : localToIso(v.startDate, v.end, tz),
      })
    },
    { success: 'Horário bloqueado', invalidate: [['schedule']], onSuccess: onClose },
  )
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Motivo (opcional)" htmlFor="reason">
            <Input
              id="reason"
              placeholder="Ex.: Médico, folga, viagem"
              value={v.reason}
              onChange={(e) => setV({ ...v, reason: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={v.allDay}
              onCheckedChange={(c) => setV({ ...v, allDay: c === true })}
            />{' '}
            Dia inteiro
          </label>
          {v.allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="De" htmlFor="sd">
                <Input
                  id="sd"
                  type="date"
                  min={today}
                  value={v.startDate}
                  onChange={(e) =>
                    setV({
                      ...v,
                      startDate: e.target.value,
                      endDate: e.target.value > v.endDate ? e.target.value : v.endDate,
                    })
                  }
                />
              </Field>
              <Field label="Até" htmlFor="ed">
                <Input
                  id="ed"
                  type="date"
                  min={v.startDate}
                  value={v.endDate}
                  onChange={(e) => setV({ ...v, endDate: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dia" htmlFor="sd2">
                <Input
                  id="sd2"
                  type="date"
                  min={today}
                  value={v.startDate}
                  onChange={(e) => setV({ ...v, startDate: e.target.value })}
                />
              </Field>
              <Field label="Das" htmlFor="st">
                <Input
                  id="st"
                  type="time"
                  value={v.start}
                  onChange={(e) => setV({ ...v, start: e.target.value })}
                />
              </Field>
              <Field label="Às" htmlFor="et">
                <Input
                  id="et"
                  type="time"
                  value={v.end}
                  onChange={(e) => setV({ ...v, end: e.target.value })}
                />
              </Field>
            </div>
          )}
          {isOwner && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={v.everyone}
                onCheckedChange={(c) => setV({ ...v, everyone: c === true })}
              />{' '}
              Vale para toda a equipe
            </label>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlockDialog({
  open,
  onClose,
  professionalId,
}: {
  open: boolean
  onClose: () => void
  professionalId?: string
}) {
  const [v, setV] = useState({
    weekdays: [2, 3, 4, 5, 6] as number[],
    start: '12:00',
    end: '13:00',
    reason: 'Almoço',
  })
  const save = useApiMutation(
    async () => {
      for (const weekday of v.weekdays) {
        await api('/schedule/recurring-blocks', {
          body: { professionalId, weekday, start: v.start, end: v.end, reason: v.reason || null },
        })
      }
    },
    { success: 'Pausa criada', invalidate: [['schedule']], onSuccess: onClose },
  )
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausa fixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Descrição" htmlFor="br">
            <Input
              id="br"
              value={v.reason}
              onChange={(e) => setV({ ...v, reason: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => (
              <label
                key={d}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
              >
                <Checkbox
                  checked={v.weekdays.includes(i)}
                  onCheckedChange={(c) =>
                    setV({
                      ...v,
                      weekdays: c ? [...v.weekdays, i] : v.weekdays.filter((x) => x !== i),
                    })
                  }
                />
                {d.slice(0, 3)}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Das" htmlFor="bs">
              <Input
                id="bs"
                type="time"
                value={v.start}
                onChange={(e) => setV({ ...v, start: e.target.value })}
              />
            </Field>
            <Field label="Às" htmlFor="be">
              <Input
                id="be"
                type="time"
                value={v.end}
                onChange={(e) => setV({ ...v, end: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!v.weekdays.length}
          >
            Salvar pausa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HolidayDialog({
  open,
  onClose,
  professionalId,
}: {
  open: boolean
  onClose: () => void
  professionalId?: string
}) {
  const [v, setV] = useState({ date: '', name: '' })
  const save = useApiMutation(() => api('/schedule/holidays', { body: { ...v, closed: true } }), {
    success: 'Data adicionada',
    invalidate: [qk.schedule(professionalId)],
    onSuccess: onClose,
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feriado ou data fechada</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" htmlFor="hd">
            <Input
              id="hd"
              type="date"
              value={v.date}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            />
          </Field>
          <Field label="Nome" htmlFor="hn">
            <Input
              id="hn"
              placeholder="Ex.: Aniversário da cidade"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!v.date || v.name.length < 2}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
