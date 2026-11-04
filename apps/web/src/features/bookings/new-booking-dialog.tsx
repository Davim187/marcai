import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatPhone, isValidBrazilianMobile } from '@marcai/shared'
import { MoneyInput } from '@/components/money-input'
import { PhoneInput } from '@/components/phone-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { SwitchRow } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { localToIso } from '@/lib/dates'
import { useProfessionals, useServices } from '@/lib/queries'
import { useHasFeature, useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'

export interface NewBookingPrefill {
  date: string
  time?: string
  professionalId?: string
  customer?: { id: string; name: string; phone: string }
}

/** Agendamento manual (para quem ainda marca pelo WhatsApp) e bloqueio de horário. */
export function NewBookingDialog({
  prefill,
  onClose,
}: {
  prefill: NewBookingPrefill
  onClose: () => void
}) {
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const qc = useQueryClient()
  const has = useHasFeature()
  const { data: services = [] } = useServices()
  const { data: professionals = [] } = useProfessionals()
  const activeServices = services.filter((s) => s.active)
  const [tab, setTab] = useState('booking')
  const [professionalId, setProfessionalId] = useState(
    prefill.professionalId ?? tenant.professionalId ?? '',
  )
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(prefill.date)
  const [time, setTime] = useState(prefill.time ?? '')
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string } | null>(
    prefill.customer ?? null,
  )
  const [newCustomer, setNewCustomer] = useState(!prefill.customer)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('')

  useEffect(() => {
    if (!professionalId && professionals[0]) setProfessionalId(professionals[0].id)
  }, [professionals, professionalId])
  const servicesForPro = activeServices.filter(
    (s) => !s.professionalIds || s.professionalIds.includes(professionalId),
  )
  useEffect(() => {
    if (!servicesForPro.some((s) => s.id === serviceId)) setServiceId(servicesForPro[0]?.id ?? '')
  }, [servicesForPro, serviceId])
  const service = services.find((s) => s.id === serviceId)

  const search = useQuery({
    queryKey: ['customer-search', query],
    queryFn: () =>
      api<Array<{ id: string; name: string; phone: string }>>(
        `/bookings/customer-search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.trim().length >= 2 && !newCustomer,
  })
  const slots = useQuery({
    queryKey: ['panel-slots', serviceId, professionalId, date],
    queryFn: () =>
      api<{ slots: Array<{ startsAt: string; time: string }> }>(
        `/bookings/slots?serviceId=${serviceId}&professionalId=${professionalId}&date=${date}`,
      ),
    enabled: !!serviceId && !!professionalId && !!date,
  })
  const freeTimes = new Set(slots.data?.slots.map((s) => s.time))
  const outside = !!time && !freeTimes.has(time)

  function done(msg: string) {
    toast.success(msg)
    ;['calendar', 'bookings', 'dashboard', 'customers', 'customer', 'schedule'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    )
    onClose()
  }

  async function saveBooking() {
    if (!time || !serviceId) return toast.error('Escolha o serviço e o horário')
    if (!customer && (name.trim().length < 2 || !isValidBrazilianMobile(phone)))
      return toast.error('Informe o nome e um WhatsApp válido da cliente')
    setSaving(true)
    try {
      await api('/bookings', {
        body: {
          serviceId,
          professionalId,
          startsAt: localToIso(date, time, tz),
          ...(customer
            ? { customerId: customer.id }
            : { customerName: name.trim(), customerPhone: phone }),
          notes,
          ...(price !== null ? { priceCents: price } : {}),
          allowOutsideHours: outside,
          notifyCustomer: notify,
        },
      })
      done('Agendamento criado')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveBlock() {
    if (!time || !blockEnd || blockEnd <= time)
      return toast.error('Informe o início e o fim do bloqueio')
    setSaving(true)
    try {
      await api('/schedule/time-off', {
        body: {
          professionalId,
          startsAt: localToIso(date, time, tz),
          endsAt: localToIso(date, blockEnd, tz),
          reason: blockReason || null,
        },
      })
      done('Horário bloqueado')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Novo na agenda</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="booking" className="flex-1">
              Agendamento
            </TabsTrigger>
            <TabsTrigger value="block" className="flex-1">
              Bloquear horário
            </TabsTrigger>
          </TabsList>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {professionals.length > 1 && tenant.role === 'owner' && (
              <Field label="Profissional" htmlFor="nb-pro" className="sm:col-span-3">
                <NativeSelect
                  id="nb-pro"
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                >
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Dia" htmlFor="nb-date">
              <Input
                id="nb-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label={tab === 'block' ? 'Das' : 'Horário'} htmlFor="nb-time">
              <Input
                id="nb-time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            {tab === 'block' && (
              <Field label="Até" htmlFor="nb-end">
                <Input
                  id="nb-end"
                  type="time"
                  step={300}
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                />
              </Field>
            )}
          </div>
          <TabsContent value="booking" className="mt-4 space-y-4">
            <Field label="Serviço" htmlFor="nb-svc">
              <NativeSelect
                id="nb-svc"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {servicesForPro.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMinutes} min
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {slots.data && (
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                  Horários livres nesse dia
                </p>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {slots.data.slots.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                      Nenhum — use um horário de encaixe.
                    </span>
                  )}
                  {slots.data.slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setTime(s.time)}
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs font-semibold tabular-nums',
                        time === s.time
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:border-primary',
                      )}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
                {outside && (
                  <p className="text-warning mt-1.5 text-xs">
                    Horário fora do expediente/ocupado: será criado como encaixe (se não conflitar
                    com outra cliente).
                  </p>
                )}
              </div>
            )}
            <div className="rounded-xl border p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Cliente</p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => {
                    setNewCustomer(!newCustomer)
                    setCustomer(null)
                  }}
                >
                  {newCustomer ? (
                    <>
                      <Search /> Buscar cadastrada
                    </>
                  ) : (
                    <>
                      <UserPlus /> Nova cliente
                    </>
                  )}
                </Button>
              </div>
              {customer ? (
                <div className="bg-primary-soft flex items-center justify-between rounded-lg p-2.5 text-sm">
                  <span>
                    <strong>{customer.name}</strong> · {formatPhone(customer.phone)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                    Trocar
                  </Button>
                </div>
              ) : newCustomer ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome" htmlFor="nb-name">
                    <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="WhatsApp" htmlFor="nb-phone">
                    <PhoneInput
                      id="nb-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <div>
                  <Input
                    placeholder="Nome ou telefone"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Buscar cliente"
                    autoFocus
                  />
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {search.data?.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCustomer(c)}
                        className="hover:bg-muted flex w-full justify-between rounded-lg px-2.5 py-2 text-left text-sm"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{formatPhone(c.phone)}</span>
                      </button>
                    ))}
                    {search.data && !search.data.length && (
                      <p className="text-muted-foreground px-2 text-xs">
                        Nenhuma cliente encontrada.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Valor"
                htmlFor="nb-price"
                hint={service ? 'Deixe como está para usar o preço do serviço.' : undefined}
              >
                <MoneyInput
                  id="nb-price"
                  value={price ?? service?.priceCents ?? 0}
                  onChange={setPrice}
                />
              </Field>
              <Field label="Observações" htmlFor="nb-notes">
                <Textarea
                  id="nb-notes"
                  rows={1}
                  className="min-h-11"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>
            {has('whatsapp_customer') && (
              <SwitchRow
                id="nb-notify"
                label="Enviar confirmação no WhatsApp da cliente"
                checked={notify}
                onCheckedChange={setNotify}
              />
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={saveBooking} loading={saving}>
                Agendar
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="block" className="mt-4 space-y-4">
            <Field label="Motivo (opcional)" htmlFor="nb-reason">
              <Input
                id="nb-reason"
                placeholder="Ex.: almoço, médico"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={saveBlock} loading={saving}>
                Bloquear
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
