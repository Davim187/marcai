import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { fmt, localToIso, todayIn } from '@/lib/dates'
import { useProfessionals } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import type { BookingDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function RescheduleDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: BookingDTO
  onClose: () => void
  onDone: () => void
}) {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const { data: professionals = [] } = useProfessionals()
  const [date, setDate] = useState(
    fmt(booking.startsAt, tz, 'yyyy-MM-dd') < todayIn(tz)
      ? todayIn(tz)
      : fmt(booking.startsAt, tz, 'yyyy-MM-dd'),
  )
  const [professionalId, setProfessionalId] = useState(booking.professionalId)
  const [selected, setSelected] = useState<string | null>(null)
  const [customTime, setCustomTime] = useState('')
  const [saving, setSaving] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['panel-slots', booking.serviceId, professionalId, date, booking.id],
    queryFn: () =>
      api<{ slots: Array<{ startsAt: string; time: string }> }>(
        `/bookings/slots?serviceId=${booking.serviceId}&professionalId=${professionalId}&date=${date}&excludeBookingId=${booking.id}`,
      ),
  })
  async function save() {
    const startsAt = customTime ? localToIso(date, customTime, tz) : selected
    if (!startsAt) return
    setSaving(true)
    try {
      await api(`/bookings/${booking.id}/reschedule`, {
        body: { startsAt, professionalId, force: !!customTime },
      })
      toast.success('Agendamento remarcado')
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remarcar {booking.customer.name.split(' ')[0]}</DialogTitle>
          <DialogDescription>
            {booking.serviceName} · hoje em {fmt(booking.startsAt, tz, "dd/MM 'às' HH:mm")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Novo dia" htmlFor="rd">
            <Input
              id="rd"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setSelected(null)
              }}
            />
          </Field>
          {professionals.length > 1 && tenant.role === 'owner' && (
            <Field label="Profissional" htmlFor="rp">
              <NativeSelect
                id="rp"
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value)
                  setSelected(null)
                }}
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Horários livres</p>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : !data?.slots.length ? (
            <p className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
              Sem horários livres nesse dia.
            </p>
          ) : (
            <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              {data.slots.map((s) => (
                <button
                  key={s.startsAt}
                  onClick={() => {
                    setSelected(s.startsAt)
                    setCustomTime('')
                  }}
                  className={cn(
                    'h-10 rounded-lg border text-sm font-semibold',
                    selected === s.startsAt
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary',
                  )}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </div>
        <Field
          label="Ou um horário de encaixe"
          htmlFor="ct"
          hint="Ignora o expediente; só impede conflito com outra cliente."
        >
          <Input
            id="ct"
            type="time"
            value={customTime}
            onChange={(e) => {
              setCustomTime(e.target.value)
              setSelected(null)
            }}
            className="w-36"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button onClick={save} loading={saving} disabled={!selected && !customTime}>
            Remarcar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
