import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CheckCircle2,
  Copy,
  Hourglass,
  Plus,
  QrCode as QrIcon,
  Share2,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { formatBRL } from '@marcai/shared'
import { QrCode } from '@/components/qr-code'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { capitalize, fmt, todayIn } from '@/lib/dates'
import { useTenant } from '@/lib/session'
import type { BookingDTO } from '@/lib/types'
import { cn, copyToClipboard } from '@/lib/utils'
import { StatusBadge } from '../bookings/status'
import { NewBookingDialog } from '../bookings/new-booking-dialog'
import { Gauge, MiniBars, RevenueArea, Sparkline, type TrendPoint } from './widgets'

interface Dashboard {
  today: BookingDTO[]
  next: BookingDTO | null
  revenue: Record<'day' | 'week' | 'month', { cents: number; count: number }>
  noShowRate: number
  attendance: { completed: number; noShows: number }
  trend: TrendPoint[]
  newCustomers: number
  pendingCount: number
  publicUrl: string
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export default function DashboardPage() {
  const { tenant, user } = useTenant()
  const tz = tenant.timezone
  const [qrOpen, setQrOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/dashboard'),
    refetchInterval: 60_000,
  })
  const last7 = data?.trend.slice(-7) ?? []

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-[28px]">
            {greeting()}, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {capitalize(fmt(new Date().toISOString(), tz, "EEEE, d 'de' MMMM"))} · veja como está a
            agenda de {tenant.name}
          </p>
        </div>
        <Button
          variant="inverse"
          onClick={() => setNewOpen(true)}
          className="hidden sm:inline-flex"
        >
          <Plus /> Agendamento manual
        </Button>
      </div>

      {/* Números do período */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="flex items-end justify-between gap-2 p-4 sm:p-5">
          <Metric label="Previsto hoje" value={data && formatBRL(data.revenue.day.cents)} />
          {data && <MiniBars data={last7} className="hidden sm:flex" />}
        </Card>
        <Card className="flex items-center gap-3 p-4 sm:p-5">
          <IconBubble icon={UserPlus} className="hidden sm:flex" />
          <Metric label="Clientes novos no mês" value={data && String(data.newCustomers)} />
        </Card>
        <Card className="flex items-center gap-3 p-4 sm:p-5">
          <IconBubble icon={Wallet} tone="sand" className="hidden sm:flex" />
          <Metric label="Previsto na semana" value={data && formatBRL(data.revenue.week.cents)} />
        </Card>
        <Card className="bg-primary text-primary-foreground flex items-end justify-between gap-2 border-transparent p-4 sm:p-5 dark:border-transparent">
          <Metric
            label="Previsto no mês"
            value={data && formatBRL(data.revenue.month.cents)}
            className="[&_p:first-child]:text-primary-foreground/80"
          />
          {data && (
            <Sparkline values={data.trend.map((t) => t.cents)} className="hidden sm:block" />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Faturamento */}
        <Card className="p-5 lg:col-span-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Faturamento previsto</h2>
            <span className="text-muted-foreground text-xs font-medium">Últimos 14 dias</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <InnerStat
              label="Agendamentos na semana"
              value={data && String(data.revenue.week.count)}
            />
            <InnerStat
              label="Agendamentos no mês"
              value={data && String(data.revenue.month.count)}
            />
          </div>
          <div className="mt-3">
            {data ? <RevenueArea data={data.trend} /> : <Skeleton className="h-44" />}
          </div>
        </Card>

        {/* Comparecimento */}
        <Card className="flex flex-col p-5 sm:col-span-1 lg:col-span-3">
          <h2 className="text-base font-semibold">Comparecimento</h2>
          {data ? (
            <AttendanceBody attendance={data.attendance} />
          ) : (
            <Skeleton className="mt-4 h-40" />
          )}
        </Card>

        {/* Próximo atendimento */}
        <Card className="p-5 lg:col-span-3">
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : data?.next ? (
            <NextBooking booking={data.next} tz={tz} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              <IconBubble icon={CalendarCheck} />
              <p className="font-semibold">Nenhum atendimento por vir</p>
              <p className="text-muted-foreground text-sm">
                Compartilhe seu link para receber agendamentos.
              </p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <ShareCard onQr={() => setQrOpen(true)} />

        {/* Agenda de hoje */}
        <Card className="p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Agenda de hoje</h2>
            <Link
              to="/painel/agenda"
              className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
            >
              Abrir agenda
            </Link>
          </div>
          {isLoading ? (
            <div className="mt-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !data?.today.length ? (
            <p className="bg-muted text-muted-foreground mt-4 rounded-2xl p-6 text-center text-sm">
              Nenhum horário marcado para hoje.
            </p>
          ) : (
            <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {data.today.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/painel/agenda/${b.id}`}
                    className="hover:bg-muted flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
                  >
                    <span className="bg-primary h-9 w-1 shrink-0 rounded-full" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.customer.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {fmt(b.startsAt, tz, 'HH:mm')} · {b.serviceName}
                      </p>
                    </div>
                    <StatusBadge status={b.status} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Pendências */}
        <Card className="flex flex-col items-center justify-center gap-2 p-5 text-center lg:col-span-3">
          {data && data.pendingCount > 0 ? (
            <>
              <IconBubble icon={Hourglass} tone="sand" size="lg" />
              <p className="mt-1 font-semibold">{data.pendingCount} pedido(s) esperando você</p>
              <p className="text-muted-foreground text-sm">
                Confirme ou recuse para a cliente saber se o horário está garantido.
              </p>
              <Button asChild size="sm" className="mt-2">
                <Link to="/painel/agendamentos?status=pending">Revisar pedidos</Link>
              </Button>
            </>
          ) : (
            <>
              <IconBubble icon={CheckCircle2} size="lg" />
              <p className="mt-1 font-semibold">Tudo em dia</p>
              <p className="text-muted-foreground text-sm">
                Nenhum pedido esperando sua confirmação.
              </p>
            </>
          )}
        </Card>
      </div>

      <Button
        onClick={() => setNewOpen(true)}
        size="icon"
        variant="inverse"
        className="shadow-lift fixed bottom-24 right-4 z-20 h-14 w-14 sm:hidden"
        aria-label="Novo agendamento"
      >
        <Plus className="!size-6" />
      </Button>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code da sua página</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Imprima e deixe no balcão: a cliente aponta a câmera e agenda o próximo horário.
          </p>
          <QrCode value={tenant.publicUrl} filename={`qrcode-${tenant.slug}.png`} size={240} />
        </DialogContent>
      </Dialog>
      {newOpen && (
        <NewBookingDialog prefill={{ date: todayIn(tz) }} onClose={() => setNewOpen(false)} />
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  className,
}: {
  label: string
  value?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-muted-foreground line-clamp-2 text-xs font-medium sm:text-sm">{label}</p>
      {value ? (
        <p className="mt-1 truncate text-lg font-bold tabular-nums sm:text-2xl">{value}</p>
      ) : (
        <Skeleton className="mt-1 h-7 w-20" />
      )}
    </div>
  )
}

function IconBubble({
  icon: Icon,
  tone = 'sage',
  size = 'md',
  className,
}: {
  icon: typeof Wallet
  tone?: 'sage' | 'sand'
  size?: 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        tone === 'sage' ? 'bg-primary-soft text-primary' : 'bg-warning/15 text-warning',
        size === 'lg' ? 'h-14 w-14 [&_svg]:size-6' : 'h-11 w-11 [&_svg]:size-5',
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  )
}

function InnerStat({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-muted rounded-2xl px-3 py-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      {value ? (
        <p className="text-lg font-bold tabular-nums">{value}</p>
      ) : (
        <Skeleton className="mt-1 h-6 w-10" />
      )}
    </div>
  )
}

function AttendanceBody({ attendance }: { attendance: Dashboard['attendance'] }) {
  const total = attendance.completed + attendance.noShows
  const rate = total ? attendance.completed / total : null
  return (
    <>
      <p className="text-muted-foreground mt-1 text-sm">
        {total
          ? `${attendance.completed} de ${total} atendimentos concluídos nos últimos 30 dias`
          : 'Ainda sem atendimentos concluídos nos últimos 30 dias'}
      </p>
      <div className="mt-auto pt-4">
        <Gauge
          value={rate}
          label={rate === null ? 'Sem dados' : `${Math.round(rate * 100)}% de comparecimento`}
        />
      </div>
      {attendance.noShows > 0 && (
        <Badge variant="destructive" className="mx-auto mt-3">
          {attendance.noShows} falta(s)
        </Badge>
      )}
    </>
  )
}

function NextBooking({ booking: b, tz }: { booking: BookingDTO; tz: string }) {
  const navigate = useNavigate()
  const isToday = fmt(b.startsAt, tz, 'yyyy-MM-dd') === todayIn(tz)
  return (
    <div className="flex h-full flex-col items-center text-center">
      <p className="text-muted-foreground self-start text-xs font-semibold uppercase tracking-wider">
        Próximo atendimento
      </p>
      <Avatar name={b.customer.name} className="mt-3 h-16 w-16 text-lg" />
      <p className="mt-2 max-w-full truncate font-semibold">{b.customer.name}</p>
      <p className="text-muted-foreground max-w-full truncate text-sm">{b.serviceName}</p>
      <dl className="mt-4 grid w-full grid-cols-3 gap-1">
        <div>
          <dt className="text-muted-foreground text-[11px]">Dia</dt>
          <dd className="text-sm font-bold">{isToday ? 'Hoje' : fmt(b.startsAt, tz, 'dd/MM')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px]">Hora</dt>
          <dd className="text-sm font-bold tabular-nums">{fmt(b.startsAt, tz, 'HH:mm')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px]">Valor</dt>
          <dd className="text-sm font-bold tabular-nums">{formatBRL(b.priceCents)}</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        size="sm"
        className="mt-auto w-full"
        onClick={() => navigate(`/painel/agenda/${b.id}`)}
      >
        Ver detalhes
      </Button>
    </div>
  )
}

function ShareCard({ onQr }: { onQr: () => void }) {
  const { tenant } = useTenant()
  const shortUrl = tenant.publicUrl.replace(/^https?:\/\//, '')

  async function copy() {
    if (await copyToClipboard(tenant.publicUrl))
      toast.success('Link copiado! Cole na bio do Instagram')
  }
  async function share() {
    const text = `Agende seu horário comigo pelo link: ${tenant.publicUrl}`
    if (navigator.share)
      await navigator
        .share({ title: tenant.name, text, url: tenant.publicUrl })
        .catch(() => undefined) // a pessoa fechou a janela de compartilhar
    else await copy()
  }

  return (
    <Card className="grid items-center gap-4 overflow-hidden p-5 sm:grid-cols-2 lg:col-span-5">
      <div className="flex min-w-0 flex-col">
        <h2 className="text-lg font-semibold leading-snug">Seu link de agendamento</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Coloque na bio do Instagram e no WhatsApp: a cliente escolhe o serviço e o horário
          sozinha.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={copy} size="sm">
            <Copy /> Copiar link
          </Button>
          <Button variant="round" size="icon-sm" onClick={share} aria-label="Compartilhar">
            <Share2 />
          </Button>
          <Button variant="round" size="icon-sm" onClick={onQr} aria-label="QR Code">
            <QrIcon />
          </Button>
        </div>
      </div>
      {/* Cartões empilhados: a página pública como ela aparece para a cliente */}
      <button
        type="button"
        onClick={copy}
        className="bg-muted group relative hidden h-44 overflow-hidden rounded-2xl sm:block"
        aria-label={`Copiar ${shortUrl}`}
      >
        <span className="bg-primary/25 absolute left-1/2 top-4 h-24 w-40 -translate-x-1/2 rotate-[-8deg] rounded-xl transition-transform group-hover:rotate-[-10deg]" />
        <span className="bg-primary/60 absolute left-1/2 top-8 h-24 w-40 -translate-x-1/2 rotate-[-4deg] rounded-xl transition-transform group-hover:rotate-[-5deg]" />
        <span className="bg-inverse text-inverse-foreground absolute left-1/2 top-12 flex h-24 w-40 -translate-x-1/2 flex-col justify-between rounded-xl p-3 text-left shadow-lg transition-transform group-hover:-translate-y-1">
          <span className="truncate text-xs font-bold">{tenant.name}</span>
          <span className="truncate text-[11px] opacity-75">{shortUrl}</span>
        </span>
      </button>
    </Card>
  )
}
