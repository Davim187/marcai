import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, CheckCheck, MessageCircle, UserX, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  BOOKING_STATUS_TOASTS,
  type BookingStatus,
  formatPhone,
  formatPrice,
  whatsappLink,
} from '@marcai/shared'
import { Button } from '@/components/ui/button'
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
import { api, imageSrc } from '@/lib/api'
import { capitalize, fmt } from '@/lib/dates'
import { useApiMutation, invalidateBookingViews } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import type { BookingDTO } from '@/lib/types'
import { RescheduleDialog } from './reschedule-dialog'
import { StatusBadge } from './status'

type Detail = BookingDTO & {
  customer: BookingDTO['customer'] & { email: string | null; notes: string | null; tags: string[] }
  answers: Array<{ fieldId: string; label: string; type: string; value: unknown }>
}

function answerText(a: { type: string; value: unknown }) {
  if (typeof a.value === 'boolean') return a.value ? 'Sim' : 'Não'
  if (Array.isArray(a.value)) return a.value.join(', ')
  return String(a.value)
}

export function BookingDetailDialog({
  bookingId,
  onClose,
}: {
  bookingId: string | null
  onClose: () => void
}) {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const qc = useQueryClient()
  const { data: b, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api<Detail>(`/bookings/${bookingId}`),
    enabled: !!bookingId,
  })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const statusMutation = useApiMutation(
    (v: { status: BookingStatus; reason?: string }) =>
      api<{ status: BookingStatus }>(`/bookings/${bookingId}/status`, { method: 'PATCH', body: v }),
    {
      success: (r) => BOOKING_STATUS_TOASTS[r.status],
      onSuccess: () => {
        setCancelOpen(false)
        invalidateBookingViews(qc)
      },
    },
  )
  // Ignora cliques repetidos enquanto a primeira ação ainda está em andamento
  const setStatus = {
    isPending: statusMutation.isPending,
    mutate: (v: { status: BookingStatus; reason?: string }) => {
      if (!statusMutation.isPending) statusMutation.mutate(v)
    },
  }
  const started = b ? new Date(b.startsAt) <= new Date() : false
  const active = b && (b.status === 'pending' || b.status === 'confirmed')
  const waText = b
    ? `Oi, ${b.customer.name.split(' ')[0]}! Aqui é da ${tenant.name}. Sobre seu horário de ${b.serviceName} em ${fmt(b.startsAt, tz, "dd/MM 'às' HH:mm")}: `
    : ''

  return (
    <>
      <Dialog open={!!bookingId && !rescheduleOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          {isLoading || !b ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  {b.source === 'manual' && (
                    <span className="text-muted-foreground text-xs">Agendado pelo painel</span>
                  )}
                </div>
                <DialogTitle className="pt-1">{b.serviceName}</DialogTitle>
                <DialogDescription>
                  {capitalize(fmt(b.startsAt, tz, "EEEE, dd 'de' MMMM"))} ·{' '}
                  {fmt(b.startsAt, tz, 'HH:mm')} às {fmt(b.endsAt, tz, 'HH:mm')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border p-3">
                  <Link
                    to={`/painel/clientes/${b.customer.id}`}
                    onClick={onClose}
                    className="hover:text-primary font-semibold hover:underline"
                  >
                    {b.customer.name}
                  </Link>
                  <p className="text-muted-foreground">{formatPhone(b.customer.phone)}</p>
                  {b.customer.notes && (
                    <p className="bg-warning/10 mt-2 rounded-lg p-2 text-xs">
                      📌 {b.customer.notes}
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-muted-foreground text-xs">Valor</dt>
                    <dd className="font-semibold">{formatPrice(b.priceCents, b.priceFrom)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Profissional</dt>
                    <dd className="font-semibold">{b.professional.name}</dd>
                  </div>
                  {b.customerConfirmedAt && (
                    <div className="text-success col-span-2">✅ A cliente confirmou presença</div>
                  )}
                </dl>
                {(b.answers.length > 0 || b.notes) && (
                  <div className="bg-muted/60 space-y-1.5 rounded-xl p-3">
                    {b.answers.map((a) => (
                      <p key={a.fieldId}>
                        <span className="text-muted-foreground">📝 {a.label}:</span>{' '}
                        {a.type === 'photo' ? (
                          <a
                            href={imageSrc(String(a.value))}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary font-medium underline"
                          >
                            ver foto
                          </a>
                        ) : (
                          <span className="font-medium">{answerText(a)}</span>
                        )}
                      </p>
                    ))}
                    {b.notes && (
                      <p>
                        <span className="text-muted-foreground">📝 Observações:</span>{' '}
                        <span className="font-medium">{b.notes}</span>
                      </p>
                    )}
                  </div>
                )}
                {b.status === 'canceled' && b.cancelReason && (
                  <p className="text-muted-foreground">Motivo do cancelamento: {b.cancelReason}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" asChild className="col-span-2">
                  <a href={whatsappLink(b.customer.phone, waText)} target="_blank" rel="noreferrer">
                    <MessageCircle /> Conversar no WhatsApp
                  </a>
                </Button>
                {b.status === 'pending' && (
                  <Button
                    variant="success"
                    onClick={() => setStatus.mutate({ status: 'confirmed' })}
                    loading={setStatus.isPending}
                  >
                    <Check /> Confirmar
                  </Button>
                )}
                {active && started && (
                  <Button
                    variant="success"
                    onClick={() => setStatus.mutate({ status: 'completed' })}
                    loading={setStatus.isPending}
                  >
                    <CheckCheck /> Concluir
                  </Button>
                )}
                {active && started && (
                  <Button variant="outline" onClick={() => setStatus.mutate({ status: 'no_show' })}>
                    <UserX /> Faltou
                  </Button>
                )}
                {active && (
                  <Button variant="outline" onClick={() => setRescheduleOpen(true)}>
                    <CalendarClock /> Remarcar
                  </Button>
                )}
                {active && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    <X /> Cancelar
                  </Button>
                )}
                {(b.status === 'no_show' || b.status === 'completed') && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setStatus.mutate({ status: b.status === 'no_show' ? 'completed' : 'no_show' })
                    }
                  >
                    {b.status === 'no_show' ? 'Na verdade, veio' : 'Na verdade, faltou'}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar agendamento?</DialogTitle>
            <DialogDescription>
              O horário volta a ficar livre e a cliente é avisada (se as notificações estiverem
              ligadas).
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo (opcional)" htmlFor="reason">
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: imprevisto, cliente pediu para cancelar"
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              loading={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: 'canceled', reason: reason || undefined })}
            >
              Cancelar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {b && rescheduleOpen && (
        <RescheduleDialog
          booking={b}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => {
            setRescheduleOpen(false)
            invalidateBookingViews(qc)
          }}
        />
      )}
    </>
  )
}
