import { useState } from 'react'
import { toast } from 'sonner'
import { formatPrice, isValidBrazilianMobile } from '@marcai/shared'
import { PhoneInput } from '@/components/phone-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, ApiError, errorMessage } from '@/lib/api'
import { capitalize, fmt } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CustomFieldInput } from '../forms/custom-field-input'
import { type Slot } from './slot-picker'
import { type BookingResult, type PublicService, type PublicTenant } from './types'

/** Formulário final: dados do cliente, perguntas personalizadas, consentimento e envio. */
const SAVED_KEY = 'marcai-cliente'

export function DetailsForm({
  t,
  service,
  professionalId,
  slot,
  onSuccess,
  onSlotTaken,
}: {
  t: PublicTenant
  service: PublicService
  professionalId: string
  slot: Slot
  onSuccess: (r: BookingResult) => void
  onSlotTaken: () => void
}) {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as {
        name?: string
        phone?: string
      }
    } catch {
      return {}
    }
  })()
  const [name, setName] = useState(saved.name ?? '')
  const [phone, setPhone] = useState(saved.phone ?? '')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const fields = t.fields.filter((f) => f.appliesToAll || f.serviceIds.includes(service.id))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.customerName = 'Informe seu nome'
    if (!isValidBrazilianMobile(phone))
      errs.customerPhone =
        'Informe um celular com DDD, ex.: (85) 99999-9999 (telefone fixo não recebe WhatsApp)'
    if (!consent) errs.consent = 'Precisamos do seu consentimento para salvar seus dados'
    for (const f of fields) {
      const v = answers[f.id]
      if (f.required && (v === undefined || v === '' || (Array.isArray(v) && !v.length)))
        errs[f.id] = 'Resposta obrigatória'
    }
    setErrors(errs)
    if (Object.keys(errs).length) {
      document
        .getElementById(
          Object.keys(errs)[0] === 'customerName'
            ? 'name'
            : Object.keys(errs)[0] === 'customerPhone'
              ? 'phone'
              : `field-${Object.keys(errs)[0]}`,
        )
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    try {
      const res = await api<BookingResult>(`/public/t/${t.slug}/bookings`, {
        body: {
          serviceId: service.id,
          professionalId,
          startsAt: slot.startsAt,
          customerName: name.trim(),
          customerPhone: phone,
          notes,
          consent,
          website,
          answers: Object.entries(answers)
            .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
            .map(([fieldId, value]) => ({ fieldId, value })),
        },
      })
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify({ name: name.trim(), phone }))
      } catch {
        /* ignora */
      }
      onSuccess(res)
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message)
        onSlotTaken()
      } else if (err instanceof ApiError && err.details) {
        setErrors((err.details as { answers?: Record<string, string> }).answers ?? {})
        toast.error(err.message)
      } else if (err instanceof ApiError && err.fields) {
        setErrors(err.fields)
        toast.error(err.message)
      } else toast.error(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 pt-5" noValidate>
      <div className="bg-primary-soft rounded-2xl p-4 text-sm">
        <p className="font-semibold">{service.name}</p>
        <p className="text-muted-foreground mt-0.5">
          {capitalize(fmt(slot.startsAt, t.timezone, "EEEE, dd/MM 'às' HH:mm"))} ·{' '}
          {formatPrice(service.priceCents, service.priceFrom)}
        </p>
      </div>
      <Field label="Seu nome" htmlFor="name" error={errors.customerName} required>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.customerName}
        />
      </Field>
      <Field
        label="Seu WhatsApp"
        htmlFor="phone"
        error={errors.customerPhone}
        required
        hint="Para enviar a confirmação e o lembrete."
      >
        <PhoneInput
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={!!errors.customerPhone}
        />
      </Field>
      {fields.map((f) => (
        <CustomFieldInput
          key={f.id}
          field={f}
          value={answers[f.id]}
          onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))}
          error={errors[f.id]}
          uploadEndpoint={`/public/t/${t.slug}/uploads`}
        />
      ))}
      <Field label="Observações" htmlFor="notes">
        <Textarea
          id="notes"
          rows={3}
          placeholder="Algo que a gente precisa saber?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />
      </Field>
      {/* Honeypot anti-robô: invisível para pessoas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Site</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <div>
        <label className="text-muted-foreground flex items-start gap-3 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
            aria-invalid={!!errors.consent}
          />
          <span>
            Autorizo {t.name} a usar meu nome e WhatsApp para gerenciar este agendamento, conforme a{' '}
            <a href="/privacidade" target="_blank" className="text-primary font-medium underline">
              política de privacidade
            </a>{' '}
            (LGPD).
          </span>
        </label>
        {errors.consent && (
          <p className="text-destructive mt-1 text-xs font-medium">{errors.consent}</p>
        )}
      </div>
      {t.cancellationPolicy && (
        <p className="bg-card text-muted-foreground rounded-xl border p-3 text-xs">
          {t.cancellationPolicy}
        </p>
      )}
      <div className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <Button type="submit" size="lg" className={cn('w-full')} loading={submitting}>
            Confirmar agendamento
          </Button>
        </div>
      </div>
    </form>
  )
}
