import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CalendarDays,
  Copy,
  Plus,
  QrCode as QrIcon,
  Share2,
  TrendingUp,
  UserX,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { formatBRL, formatPhone } from '@marcai/shared'
import { QrCode } from '@/components/qr-code'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { capitalize, fmt, todayIn } from '@/lib/dates'
import { useTenant } from '@/lib/session'
import type { BookingDTO } from '@/lib/types'
import { copyToClipboard } from '@/lib/utils'
import { StatusBadge } from '../bookings/status'
import { NewBookingDialog } from '../bookings/new-booking-dialog'

interface Dashboard {
  today: BookingDTO[]
  next: BookingDTO | null
  revenue: Record<'day' | 'week' | 'month', { cents: number; count: number }>
  noShowRate: number
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
  const navigate = useNavigate()
  const [qrOpen, setQrOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/dashboard'),
    refetchInterval: 60_000,
  })

  async function share() {
    const text = `Agende seu horário comigo pelo link: ${tenant.publicUrl}`
    if (navigator.share)
      await navigator
        .share({ title: tenant.name, text, url: tenant.publicUrl })
        .catch(() => undefined)
    else if (await copyToClipboard(tenant.publicUrl)) toast.success('Link copiado!')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {capitalize(fmt(new Date().toISOString(), tz, "EEEE, d 'de' MMMM"))}
          </p>
          <h1 className="text-2xl font-bold sm:text-[28px]">
            {greeting()}, {user.name.split(' ')[0]}! 👋
          </h1>
        </div>
        <Button onClick={() => setNewOpen(true)} className="hidden sm:inline-flex">
          <Plus /> Agendamento manual
        </Button>
      </div>

      <Card className="border-primary/20 from-primary-soft via-card to-card overflow-hidden bg-gradient-to-br">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm font-medium">Seu link de agendamento</p>
            <p className="text-primary truncate text-lg font-bold">
              {tenant.publicUrl.replace(/^https?:\/\//, '')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () =>
                (await copyToClipboard(tenant.publicUrl)) &&
                toast.success('Link copiado! Cole na bio do Instagram')
              }
            >
              <Copy /> Copiar link
            </Button>
            <Button variant="outline" size="icon" onClick={share} aria-label="Compartilhar">
              <Share2 />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQrOpen(true)}
              aria-label="QR Code"
            >
              <QrIcon />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Wallet}
          label="Previsto hoje"
          value={data && formatBRL(data.revenue.day.cents)}
          sub={data && `${data.revenue.day.count} atendimento(s)`}
        />
        <Stat
          icon={TrendingUp}
          label="Previsto na semana"
          value={data && formatBRL(data.revenue.week.cents)}
          sub={data && `${data.revenue.week.count} agendamento(s)`}
        />
        <Stat
          icon={CalendarDays}
          label="Previsto no mês"
          value={data && formatBRL(data.revenue.month.cents)}
          sub={data && `${data.revenue.month.count} agendamento(s)`}
        />
        <Stat
          icon={UserX}
          label="Taxa de faltas"
          value={data && `${Math.round(data.noShowRate * 100)}%`}
          sub="últimos 30 dias"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : data?.next ? (
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-5">
                <p className="text-sm font-medium opacity-80">Próximo atendimento</p>
                <p className="mt-2 text-3xl font-bold">{fmt(data.next.startsAt, tz, 'HH:mm')}</p>
                <p className="text-sm opacity-90">
                  {fmt(data.next.startsAt, tz, 'yyyy-MM-dd') === todayIn(tz)
                    ? 'Hoje'
                    : capitalize(fmt(data.next.startsAt, tz, 'EEEE, dd/MM'))}
                </p>
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/15 p-3">
                  <Avatar name={data.next.customer.name} className="bg-white/90" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{data.next.customer.name}</p>
                    <p className="truncate text-sm opacity-90">
                      {data.next.serviceName} · {formatPhone(data.next.customer.phone)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => navigate(`/painel/agenda/${data.next!.id}`)}
                >
                  Ver detalhes
                </Button>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="Nenhum atendimento por vir"
              description="Compartilhe seu link para começar a receber agendamentos."
            />
          )}
          {data && data.pendingCount > 0 && (
            <Link
              to="/painel/agendamentos?status=pending"
              className="border-warning/40 bg-warning/10 flex items-center justify-between rounded-2xl border p-4 text-sm font-medium"
            >
              ⏳ {data.pendingCount} agendamento(s) esperando sua confirmação
              <span className="text-warning font-semibold">Ver</span>
            </Link>
          )}
        </div>
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Agenda de hoje</CardTitle>
            <Button variant="link" size="sm" asChild>
              <Link to="/painel/agenda">Abrir agenda</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : !data?.today.length ? (
              <p className="bg-muted/60 text-muted-foreground rounded-xl p-6 text-center text-sm">
                Nenhum horário marcado para hoje. Aproveite para descansar ✨
              </p>
            ) : (
              <ol className="space-y-2">
                {data.today.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => navigate(`/painel/agenda/${b.id}`)}
                      className="hover:border-primary/50 hover:bg-muted/40 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition"
                    >
                      <span className="w-12 text-center text-sm font-bold tabular-nums">
                        {fmt(b.startsAt, tz, 'HH:mm')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{b.customer.name}</p>
                        <p className="text-muted-foreground truncate text-sm">
                          {b.serviceName} · {formatBRL(b.priceCents)}
                        </p>
                      </div>
                      <StatusBadge status={b.status} className="hidden sm:inline-flex" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={() => setNewOpen(true)}
        size="icon"
        className="shadow-lift fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full sm:hidden"
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

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Wallet
  label: string
  value?: string
  sub?: string
}) {
  return (
    <Card className="p-4">
      <div className="text-muted-foreground flex items-center gap-2">
        <Icon className="text-primary h-4 w-4" aria-hidden />
        <span className="text-xs font-medium sm:text-sm">{label}</span>
      </div>
      {value ? (
        <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      ) : (
        <Skeleton className="mt-2 h-7 w-24" />
      )}
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </Card>
  )
}
