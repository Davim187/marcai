import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CalendarPlus,
  CalendarX2,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { formatPrice, whatsappLink } from '@marcai/shared'
import { LogoMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { brandStyle } from '@/lib/brand'
import { capitalize, fmt } from '@/lib/dates'
import { SlotPicker, type Slot } from '../booking/slot-picker'
import { StatusBadge } from '../bookings/status'
import type { BookingStatus } from '@marcai/shared'

interface CustomerBooking {
  id: string
  status: BookingStatus
  startsAt: string
  endsAt: string
  serviceId: string
  serviceName: string
  priceCents: number
  priceFrom: boolean
  professionalId: string
  professionalName: string
  customerName: string
  customerConfirmedAt: string | null
  cancelReason: string | null
  canChange: boolean
  canConfirm: boolean
  changeDeadline: string
  googleCalendarUrl: string
  icsUrl: string
  tenant: {
    slug: string
    name: string
    logoUrl: string | null
    primaryColor: string
    timezone: string
    address: string | null
    whatsapp: string | null
    cancellationPolicy: string | null
    cancelMinHours: number
    maxAdvanceDays: number
    whiteLabel: boolean
  }
}

export default function CustomerAreaPage() {
  const { token } = useParams()
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const {
    data: b,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['customer-booking', token],
    queryFn: () => api<CustomerBooking>(`/public/bookings/${token}`),
  })
  // O modo "remarcar" fica na URL: o voltar do celular volta para os detalhes, sem sair
  const mode: 'view' | 'reschedule' = params.get('remarcando') === '1' ? 'reschedule' : 'view'
  const setMode = (next: 'view' | 'reschedule') =>
    next === 'reschedule' ? setParams({ remarcando: '1' }) : setParams({}, { replace: true })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['customer-booking', token] })

  useEffect(() => {
    if (!b) return
    document.title = `Seu horário — ${b.tenant.name}`
    const acao = params.get('acao')
    if (acao === 'confirmar' && b.canConfirm && !b.customerConfirmedAt) void confirm()
    if (acao === 'remarcar' && b.canChange) setParams({ remarcando: '1' }, { replace: true })
    else if (acao) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id])

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(success)
      refresh()
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  const confirm = () =>
    run(
      () => api(`/public/bookings/${token}/confirm`, { method: 'POST' }),
      'Presença confirmada! Até lá.',
    )

  if (isLoading)
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-60" />
      </div>
    )
  if (error || !b) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <LogoMark className="h-12 w-12" />
        <h1 className="text-xl font-semibold">Agendamento não encontrado</h1>
        <p className="text-muted-foreground">Confira se o link está completo.</p>
      </div>
    )
  }
  const tz = b.tenant.timezone
  const active = b.status === 'pending' || b.status === 'confirmed'

  return (
    <div style={brandStyle(b.tenant.primaryColor)} className="bg-background min-h-dvh">
      <div className="mx-auto max-w-md px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          {b.tenant.logoUrl ? (
            <img src={b.tenant.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-full font-bold">
              {b.tenant.name[0]}
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-sm">
              Oi, {b.customerName}! Este é o seu horário em
            </p>
            <h1 className="font-semibold">{b.tenant.name}</h1>
          </div>
        </header>

        {mode === 'reschedule' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Escolha o novo horário</h2>
              <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                Voltar
              </Button>
            </div>
            <SlotPicker
              slug={b.tenant.slug}
              serviceId={b.serviceId}
              professionalId={b.professionalId}
              timezone={tz}
              maxAdvanceDays={b.tenant.maxAdvanceDays}
              selected={slot}
              onSelect={setSlot}
              token={token}
            />
            {slot && (
              <div className="bg-card/95 pb-safe sticky bottom-0 -mx-4 border-t p-4 backdrop-blur">
                <Button
                  size="lg"
                  className="w-full"
                  loading={busy}
                  onClick={async () => {
                    const ok = await run(
                      () =>
                        api(`/public/bookings/${token}/reschedule`, {
                          body: { startsAt: slot.startsAt },
                        }),
                      'Horário remarcado!',
                    )
                    if (ok) {
                      setMode('view')
                      setSlot(null)
                    } else {
                      // O horário foi recusado (ex.: acabou de ser reservado): limpa a escolha
                      setSlot(null)
                      qc.invalidateQueries({ queryKey: ['public-slots'] })
                    }
                  }}
                >
                  Remarcar para {capitalize(fmt(slot.startsAt, tz, "EEE, dd/MM 'às' HH:mm"))}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card className="overflow-hidden">
              <div className="bg-primary text-primary-foreground p-5">
                <div className="mb-2">
                  <StatusBadge status={b.status} className="bg-white/90" />
                </div>
                <p className="text-2xl font-bold">
                  {capitalize(fmt(b.startsAt, tz, "EEEE, dd 'de' MMMM"))}
                </p>
                <p className="mt-1 flex items-center gap-1.5 opacity-90">
                  <Clock className="h-4 w-4" /> {fmt(b.startsAt, tz, 'HH:mm')} às{' '}
                  {fmt(b.endsAt, tz, 'HH:mm')}
                </p>
              </div>
              <div className="divide-y text-sm">
                <Row k="Serviço" v={b.serviceName} />
                <Row k="Profissional" v={b.professionalName} />
                <Row k="Valor" v={formatPrice(b.priceCents, b.priceFrom)} />
                {b.tenant.address && (
                  <Row
                    k="Endereço"
                    v={
                      <a
                        className="text-primary inline-flex items-center gap-1 underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.tenant.address)}`}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {b.tenant.address}
                      </a>
                    }
                  />
                )}
              </div>
            </Card>

            {b.status === 'canceled' && (
              <p className="bg-muted rounded-xl p-4 text-sm">
                Este agendamento foi cancelado.{b.cancelReason && ` Motivo: ${b.cancelReason}`}
              </p>
            )}

            {active && (
              <div className="grid gap-2">
                {b.canConfirm &&
                  (b.customerConfirmedAt ? (
                    <p className="bg-success/10 text-success flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Presença confirmada
                    </p>
                  ) : (
                    <Button size="lg" variant="success" onClick={confirm} loading={busy}>
                      <Check /> Confirmar presença
                    </Button>
                  ))}
                <Button variant="outline" asChild>
                  <a href={b.googleCalendarUrl} target="_blank" rel="noreferrer">
                    <CalendarPlus /> Adicionar ao Google Agenda
                  </a>
                </Button>
                {b.canChange ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setMode('reschedule')}>
                      <RefreshCw /> Remarcar
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setCancelOpen(true)}
                    >
                      <CalendarX2 /> Cancelar
                    </Button>
                  </div>
                ) : (
                  <p className="bg-muted text-muted-foreground rounded-xl p-3 text-center text-sm">
                    Remarcações e cancelamentos pelo link só até {b.tenant.cancelMinHours}h antes.
                    Fale com {b.tenant.name}.
                  </p>
                )}
                {b.tenant.whatsapp && (
                  <Button variant="ghost" asChild>
                    <a
                      href={whatsappLink(
                        b.tenant.whatsapp,
                        `Oi! Sobre meu horário de ${b.serviceName} em ${fmt(b.startsAt, tz, "dd/MM 'às' HH:mm")}…`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle /> Falar com {b.tenant.name}
                    </a>
                  </Button>
                )}
              </div>
            )}
            {!active && (
              <Button asChild size="lg" className="w-full">
                <a href={b.tenant.whiteLabel ? '/' : `/${b.tenant.slug}`}>Agendar novo horário</a>
              </Button>
            )}
            {b.tenant.cancellationPolicy && (
              <p className="text-muted-foreground rounded-xl border p-3 text-xs">
                {b.tenant.cancellationPolicy}
              </p>
            )}
          </motion.div>
        )}
        {!b.tenant.whiteLabel && (
          <p className="text-muted-foreground mt-10 flex items-center justify-center gap-1.5 text-xs">
            <LogoMark className="h-4 w-4" /> Agendamento por Marcaí
          </p>
        )}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar seu horário?</DialogTitle>
            <DialogDescription>
              O horário fica livre para outra cliente. Se quiser, conte o motivo.
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo (opcional)" htmlFor="reason">
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                if (
                  await run(
                    () =>
                      api(`/public/bookings/${token}/cancel`, {
                        body: { reason: reason || undefined },
                      }),
                    'Horário cancelado',
                  )
                )
                  setCancelOpen(false)
              }}
            >
              Cancelar horário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  )
}
