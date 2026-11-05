import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { addDaysToDate, BOOKING_STATUS_LABELS, minutesToHHMM, weekdayOf } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { capitalize, fmt, localToIso, todayIn } from '@/lib/dates'
import { useProfessionals, invalidateBookingViews } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import type { BookingDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BookingDetailDialog } from '../bookings/booking-detail-dialog'
import { NewBookingDialog, type NewBookingPrefill } from '../bookings/new-booking-dialog'
import { STATUS_STYLES } from '../bookings/status'
import {
  AGENDA_PX_PER_MINUTE,
  AGENDA_SNAP_MINUTES,
  dragDeltaToMinutes,
  layoutOverlaps,
  localMinutes,
  visibleRange,
} from '@/lib/agenda-layout'
import { WEEKDAYS_SHORT } from '../schedule/shifts-editor'

type View = 'day' | 'week' | 'month'
interface TimeOffDTO {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
  professionalId: string | null
}
const PX = AGENDA_PX_PER_MINUTE

function mondayOf(date: string) {
  return addDaysToDate(date, -((weekdayOf(date) + 6) % 7))
}

export default function AgendaPage() {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const navigate = useNavigate()
  const params = useParams()
  const qc = useQueryClient()
  const today = todayIn(tz)
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week',
  )
  const [anchor, setAnchor] = useState(today)
  const [professionalId, setProfessionalId] = useState('')
  const [showCanceled, setShowCanceled] = useState(false)
  const [prefill, setPrefill] = useState<NewBookingPrefill | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    booking: BookingDTO
    startsAt: string
    date: string
    time: string
  } | null>(null)
  const [moving, setMoving] = useState(false)
  const { data: professionals = [] } = useProfessionals()

  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    if (view === 'week')
      return Array.from({ length: 7 }, (_, i) => addDaysToDate(mondayOf(anchor), i))
    const first = `${anchor.slice(0, 7)}-01`
    const start = mondayOf(first)
    return Array.from({ length: 42 }, (_, i) => addDaysToDate(start, i))
  }, [view, anchor])
  const from = localToIso(days[0]!, '00:00', tz)
  const to = localToIso(addDaysToDate(days.at(-1)!, 1), '00:00', tz)

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from, to, professionalId],
    queryFn: () =>
      api<{ bookings: BookingDTO[]; timeOffs: TimeOffDTO[] }>(
        `/bookings/calendar?from=${from}&to=${to}${professionalId ? `&professionalId=${professionalId}` : ''}`,
      ),
    refetchInterval: 60_000,
  })
  const bookings = (data?.bookings ?? []).filter((b) => showCanceled || b.status !== 'canceled')

  const shift = (dir: number) => {
    if (view === 'day') setAnchor(addDaysToDate(anchor, dir))
    else if (view === 'week') setAnchor(addDaysToDate(anchor, dir * 7))
    else {
      const [y, m] = anchor.split('-').map(Number) as [number, number]
      setAnchor(new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10))
    }
  }
  const title =
    view === 'day'
      ? capitalize(fmt(`${anchor}T12:00:00Z`, 'UTC', "EEEE, d 'de' MMMM"))
      : view === 'week'
        ? `${fmt(`${days[0]}T12:00:00Z`, 'UTC', 'd MMM')} – ${fmt(`${days[6]}T12:00:00Z`, 'UTC', "d MMM 'de' yyyy")}`
        : capitalize(fmt(`${anchor}T12:00:00Z`, 'UTC', "MMMM 'de' yyyy"))

  async function confirmMove() {
    if (!pendingMove) return
    setMoving(true)
    try {
      await api(`/bookings/${pendingMove.booking.id}/reschedule`, {
        body: { startsAt: pendingMove.startsAt, force: true },
      })
      toast.success('Agendamento remarcado')
      invalidateBookingViews(qc)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setMoving(false)
      setPendingMove(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Próximo">
            <ChevronRight />
          </Button>
          <h1 className="ml-1 text-lg font-semibold sm:text-xl" aria-live="polite">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="day">Dia</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          {professionals.length > 1 && tenant.role === 'owner' && (
            <NativeSelect
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="h-10 w-44"
              aria-label="Filtrar profissional"
            >
              <option value="">Toda a equipe</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={showCanceled}
              onChange={(e) => setShowCanceled(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />{' '}
            Cancelados
          </label>
          <Button
            onClick={() =>
              setPrefill({
                date: view === 'month' ? today : anchor,
                professionalId: professionalId || undefined,
              })
            }
          >
            <Plus /> Novo
          </Button>
        </div>
      </div>

      <div
        className="text-muted-foreground mb-3 flex flex-wrap gap-3 text-xs"
        aria-label="Legenda de cores"
      >
        {(['pending', 'confirmed', 'completed', 'no_show'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_STYLES[s].dot)} />
            {BOOKING_STATUS_LABELS[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[repeating-linear-gradient(45deg,#ccc_0_2px,transparent_2px_4px)]" />
          Bloqueado
        </span>
      </div>

      {view === 'month' ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          bookings={bookings}
          tz={tz}
          today={today}
          onPickDay={(d) => {
            setAnchor(d)
            setView('day')
          }}
        />
      ) : (
        <TimeGrid
          days={days}
          bookings={bookings}
          timeOffs={data?.timeOffs ?? []}
          tz={tz}
          today={today}
          loading={isLoading}
          showProfessional={!professionalId && professionals.length > 1}
          onOpen={(id) => navigate(`/painel/agenda/${id}`)}
          onEmptyClick={(date, time) =>
            setPrefill({ date, time, professionalId: professionalId || undefined })
          }
          onMove={(booking, date, minutes) => {
            const time = minutesToHHMM(minutes)
            const startsAt = localToIso(date, time, tz)
            if (new Date(startsAt).getTime() < Date.now()) {
              toast.error('Não dá para remarcar para um horário que já passou.')
              return
            }
            setPendingMove({ booking, date, time, startsAt })
          }}
        />
      )}

      <BookingDetailDialog
        bookingId={params.bookingId ?? null}
        onClose={() => navigate('/painel/agenda', { replace: true })}
      />
      {prefill && <NewBookingDialog prefill={prefill} onClose={() => setPrefill(null)} />}
      <ConfirmDialog
        open={!!pendingMove}
        onOpenChange={(o) => !o && setPendingMove(null)}
        title="Remarcar agendamento?"
        description={
          pendingMove &&
          `${pendingMove.booking.customer.name} · ${pendingMove.booking.serviceName} → ${capitalize(fmt(`${pendingMove.date}T12:00:00Z`, 'UTC', 'EEEE, dd/MM'))} às ${pendingMove.time}`
        }
        confirmLabel="Remarcar"
        loading={moving}
        onConfirm={confirmMove}
      />
    </div>
  )
}

function TimeGrid({
  days,
  bookings,
  timeOffs,
  tz,
  today,
  loading,
  showProfessional,
  onOpen,
  onEmptyClick,
  onMove,
}: {
  days: string[]
  bookings: BookingDTO[]
  timeOffs: TimeOffDTO[]
  tz: string
  today: string
  loading: boolean
  showProfessional: boolean
  onOpen: (id: string) => void
  onEmptyClick: (date: string, time: string) => void
  onMove: (b: BookingDTO, date: string, minutes: number) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  )
  const localMin = (iso: string) => localMinutes(iso, tz)
  const allMins = bookings.flatMap((b) => [localMin(b.startsAt), localMin(b.endsAt) || 1440])
  const { startMinute: startMin, endMinute: endMin } = visibleRange(allMins)
  const height = (endMin - startMin) * PX
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const nowMin = localMin(now.toISOString())

  function onDragEnd(e: DragEndEvent) {
    const b = e.active.data.current?.booking as BookingDTO | undefined
    if (!b || !e.over) return
    const deltaMin = dragDeltaToMinutes(e.delta.y)
    const date = String(e.over.id)
    const origDate = fmt(b.startsAt, tz, 'yyyy-MM-dd')
    const minutes = localMin(b.startsAt) + deltaMin
    if (deltaMin === 0 && date === origDate) return
    if (minutes < 0 || minutes >= 1440) return
    onMove(b, date, minutes)
  }

  return (
    <div className="bg-card shadow-soft overflow-x-auto rounded-2xl border">
      <div className={cn('min-w-full', days.length > 1 && 'min-w-[760px]')}>
        <div className="bg-card sticky top-0 z-10 flex border-b">
          <div className="w-14 shrink-0" />
          {days.map((d) => (
            <div key={d} className="flex-1 border-l py-2 text-center">
              <p className="text-muted-foreground text-xs font-medium capitalize">
                {WEEKDAYS_SHORT[weekdayOf(d)]}
              </p>
              <p
                className={cn(
                  'mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-base font-semibold',
                  d === today && 'bg-foreground text-background',
                )}
              >
                {Number(d.slice(8))}
              </p>
            </div>
          ))}
        </div>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className={cn('relative flex', loading && 'opacity-60')} style={{ height }}>
            <div className="w-14 shrink-0">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="text-muted-foreground relative text-right text-[11px]"
                  style={{ height: 60 * PX }}
                >
                  <span className={cn('absolute right-2', i === 0 ? 'top-0.5' : '-top-2')}>
                    {minutesToHHMM(h)}
                  </span>
                </div>
              ))}
            </div>
            {days.map((d) => (
              <DayColumn
                key={d}
                date={d}
                startMin={startMin}
                hours={hours}
                bookings={bookings.filter((b) => fmt(b.startsAt, tz, 'yyyy-MM-dd') === d)}
                timeOffs={timeOffs.filter(
                  (t) =>
                    fmt(t.startsAt, tz, 'yyyy-MM-dd') <= d && fmt(t.endsAt, tz, 'yyyy-MM-dd') >= d,
                )}
                tz={tz}
                nowMin={d === today ? nowMin : null}
                showProfessional={showProfessional}
                onOpen={onOpen}
                onEmptyClick={onEmptyClick}
              />
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  )
}

function DayColumn({
  date,
  startMin,
  hours,
  bookings,
  timeOffs,
  tz,
  nowMin,
  showProfessional,
  onOpen,
  onEmptyClick,
}: {
  date: string
  startMin: number
  hours: number[]
  bookings: BookingDTO[]
  timeOffs: TimeOffDTO[]
  tz: string
  nowMin: number | null
  showProfessional: boolean
  onOpen: (id: string) => void
  onEmptyClick: (date: string, time: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  const localMin = (iso: string) => localMinutes(iso, tz)
  return (
    <div
      ref={setNodeRef}
      className={cn('relative flex-1 cursor-pointer border-l', isOver && 'bg-primary-soft/40')}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const y = e.nativeEvent.offsetY
        const minutes = Math.floor((startMin + y / PX) / AGENDA_SNAP_MINUTES) * AGENDA_SNAP_MINUTES
        onEmptyClick(date, minutesToHHMM(minutes))
      }}
      role="gridcell"
      aria-label={`Dia ${date}. Clique para criar um agendamento.`}
    >
      {hours.map((h) => (
        <div
          key={h}
          className="border-border/70 pointer-events-none border-t border-dashed"
          style={{ height: 60 * PX }}
        />
      ))}
      {timeOffs.map((t) => {
        const s = fmt(t.startsAt, tz, 'yyyy-MM-dd') < date ? 0 : localMin(t.startsAt)
        const e = fmt(t.endsAt, tz, 'yyyy-MM-dd') > date ? 1440 : localMin(t.endsAt)
        const top = Math.max(0, (s - startMin) * PX)
        return (
          <div
            key={t.id}
            className="text-muted-foreground pointer-events-none absolute inset-x-0 overflow-hidden bg-[repeating-linear-gradient(45deg,hsl(var(--muted))_0_6px,transparent_6px_12px)] px-1.5 py-1 text-[11px] font-medium"
            style={{ top, height: Math.max(12, (e - Math.max(s, startMin)) * PX) }}
          >
            {t.reason || 'Bloqueado'}
          </div>
        )
      })}
      {layoutOverlaps(bookings).map(({ item: b, lane, lanes }) => (
        <EventBlock
          key={b.id}
          b={b}
          top={(localMin(b.startsAt) - startMin) * PX}
          height={Math.max(22, b.durationMinutes * PX)}
          lane={lane}
          lanes={lanes}
          tz={tz}
          showProfessional={showProfessional}
          onOpen={onOpen}
        />
      ))}
      {nowMin !== null && nowMin >= startMin && (
        <div
          className="pointer-events-none absolute inset-x-0 z-[5] flex items-center"
          style={{ top: (nowMin - startMin) * PX }}
          aria-hidden
        >
          <span className="bg-destructive -ml-1 h-2 w-2 rounded-full" />
          <span className="bg-destructive h-px flex-1" />
        </div>
      )}
    </div>
  )
}

function EventBlock({
  b,
  top,
  height,
  lane,
  lanes,
  tz,
  showProfessional,
  onOpen,
}: {
  b: BookingDTO
  top: number
  height: number
  lane: number
  lanes: number
  tz: string
  showProfessional: boolean
  onOpen: (id: string) => void
}) {
  const draggable = b.status === 'pending' || b.status === 'confirmed'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: b.id,
    data: { booking: b },
    disabled: !draggable,
  })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(b.id)}
      className={cn(
        'hover:shadow-lift absolute z-[2] flex flex-col items-stretch justify-start overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow',
        STATUS_STYLES[b.status].block,
        draggable && 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'shadow-lift ring-primary z-20 opacity-90 ring-2',
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      aria-label={`${fmt(b.startsAt, tz, 'HH:mm')} ${b.customer.name}, ${b.serviceName}`}
    >
      <p className="truncate font-semibold">
        {fmt(b.startsAt, tz, 'HH:mm')} {b.customer.name}
      </p>
      {height > 34 && <p className="truncate opacity-80">{b.serviceName}</p>}
      {height > 50 && showProfessional && (
        <p className="truncate opacity-70">{b.professional.name}</p>
      )}
    </button>
  )
}

function MonthGrid({
  days,
  anchor,
  bookings,
  tz,
  today,
  onPickDay,
}: {
  days: string[]
  anchor: string
  bookings: BookingDTO[]
  tz: string
  today: string
  onPickDay: (d: string) => void
}) {
  const byDay = new Map<string, BookingDTO[]>()
  for (const b of bookings) {
    const d = fmt(b.startsAt, tz, 'yyyy-MM-dd')
    byDay.set(d, [...(byDay.get(d) ?? []), b])
  }
  return (
    <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
      <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-xs font-medium capitalize">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="py-2">
            {WEEKDAYS_SHORT[d]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          const inMonth = d.slice(0, 7) === anchor.slice(0, 7)
          return (
            <button
              key={d}
              onClick={() => onPickDay(d)}
              className={cn(
                'hover:bg-muted/50 min-h-20 border-b border-r p-1 text-left align-top transition sm:min-h-28 sm:p-1.5',
                !inMonth && 'bg-muted/30 text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  d === today && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(d.slice(8))}
              </span>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      'hidden truncate rounded px-1 py-0.5 text-[10px] font-medium sm:block',
                      STATUS_STYLES[b.status].block,
                    )}
                  >
                    {fmt(b.startsAt, tz, 'HH:mm')} {b.customer.name.split(' ')[0]}
                  </div>
                ))}
                {list.length > 0 && (
                  <p className="text-primary text-[10px] font-semibold sm:hidden">
                    {list.length} ag.
                  </p>
                )}
                {list.length > 3 && (
                  <p className="text-muted-foreground hidden text-[10px] font-semibold sm:block">
                    +{list.length - 3} mais
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
