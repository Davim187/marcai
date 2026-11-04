import { useQuery } from '@tanstack/react-query'
import { CalendarSearch, MessageCircle, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUSES,
  formatBRL,
  formatPhone,
  whatsappLink,
} from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { ListSkeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { capitalize, fmt, localToIso, todayIn } from '@/lib/dates'
import { useServices } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import type { BookingDTO, Paginated } from '@/lib/types'
import { BookingDetailDialog } from './booking-detail-dialog'
import { StatusBadge } from './status'

const PERIODS = [
  { id: 'upcoming', label: 'Próximos' },
  { id: 'today', label: 'Hoje' },
  { id: 'past', label: 'Anteriores' },
  { id: 'all', label: 'Todos' },
  { id: 'custom', label: 'Escolher datas' },
]

export default function BookingsPage() {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const [params, setParams] = useSearchParams()
  const { data: services = [] } = useServices()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(q)
  const status = params.get('status') ?? ''
  const period = params.get('periodo') ?? (status === 'pending' ? 'upcoming' : 'upcoming')
  const serviceId = params.get('servico') ?? ''
  const [range, setRange] = useState({ from: todayIn(tz), to: todayIn(tz) })
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setPage(1), [debounced, status, period, serviceId, range])

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const today = todayIn(tz)
  const now = new Date().toISOString()
  const dateFilter =
    period === 'upcoming'
      ? `&from=${now}`
      : period === 'today'
        ? `&from=${localToIso(today, '00:00', tz)}&to=${localToIso(today, '23:59', tz)}`
        : period === 'past'
          ? `&to=${now}`
          : period === 'custom'
            ? `&from=${localToIso(range.from, '00:00', tz)}&to=${localToIso(range.to, '23:59', tz)}`
            : ''
  const query = `?page=${page}&pageSize=30${dateFilter}${status ? `&status=${status}` : ''}${serviceId ? `&serviceId=${serviceId}` : ''}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`
  const { data, isLoading } = useQuery({
    queryKey: ['bookings', query],
    queryFn: () => api<Paginated<BookingDTO>>(`/bookings${query}`),
  })

  let lastDay = ''
  return (
    <div>
      <PageHeader
        title="Agendamentos"
        description="Todos os horários marcados, com filtros e busca."
      />
      <Card className="mb-4 space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar por cliente, telefone ou serviço"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar"
          />
        </div>
        <div
          className="scrollbar-none flex gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Período"
        >
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => set('periodo', p.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${period === p.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NativeSelect
            value={status}
            onChange={(e) => set('status', e.target.value)}
            aria-label="Status"
          >
            <option value="">Todos os status</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={serviceId}
            onChange={(e) => set('servico', e.target.value)}
            aria-label="Serviço"
          >
            <option value="">Todos os serviços</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          {period === 'custom' && (
            <>
              <Input
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
                aria-label="De"
              />
              <Input
                type="date"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
                aria-label="Até"
              />
            </>
          )}
        </div>
      </Card>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={CalendarSearch}
          title="Nenhum agendamento encontrado"
          description="Tente mudar os filtros ou o período."
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-2 text-sm">{data.total} agendamento(s)</p>
          <div className="space-y-2">
            {data.items.map((b) => {
              const day = fmt(b.startsAt, tz, 'yyyy-MM-dd')
              const header = day !== lastDay
              lastDay = day
              return (
                <div key={b.id}>
                  {header && (
                    <h2 className="text-muted-foreground mb-2 mt-5 text-xs font-semibold uppercase tracking-wider first:mt-0">
                      {capitalize(fmt(b.startsAt, tz, "EEEE, dd 'de' MMMM"))}
                    </h2>
                  )}
                  <Card className="hover:border-primary/40 flex items-center gap-3 p-3 transition">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setOpenId(b.id)}
                    >
                      <span className="w-12 shrink-0 text-center text-sm font-bold tabular-nums">
                        {fmt(b.startsAt, tz, 'HH:mm')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{b.customer.name}</p>
                        <p className="text-muted-foreground truncate text-sm">
                          {b.serviceName} · {formatBRL(b.priceCents)}
                          {tenant.professionalsCount > 1 && ` · ${b.professional.name}`}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </button>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={whatsappLink(b.customer.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp de ${b.customer.name} ${formatPhone(b.customer.phone)}`}
                      >
                        <MessageCircle />
                      </a>
                    </Button>
                  </Card>
                </div>
              )
            })}
          </div>
          {data.total > data.pageSize && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground text-sm">
                Página {page} de {Math.ceil(data.total / data.pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
      <BookingDetailDialog bookingId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
