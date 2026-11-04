import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarHeart,
  Clock,
  Instagram,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { formatPrice, isValidBrazilianMobile, whatsappLink } from '@marcai/shared'
import { LogoMark } from '@/components/logo'
import { PhoneInput } from '@/components/phone-input'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError, errorMessage } from '@/lib/api'
import { brandStyle } from '@/lib/brand'
import { capitalize, durationLabel, fmt } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { CustomFieldInput } from '../forms/custom-field-input'
import { BookingSuccess } from './booking-success'
import { SlotPicker, type Slot } from './slot-picker'
import type { BookingResult, PublicService, PublicTenant } from './types'

type Step = 'service' | 'professional' | 'time' | 'details'
const SAVED_KEY = 'marcai-cliente'

function usePublicSlug() {
  const params = useParams()
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ appMode: string; singleTenantSlug: string | null }>('/public/config'),
    enabled: !params.slug,
    staleTime: Infinity,
  })
  return params.slug ?? config.data?.singleTenantSlug ?? (config.data ? '_' : undefined)
}

export default function PublicBookingPage() {
  const slug = usePublicSlug()
  const qc = useQueryClient()
  const {
    data: t,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['public-tenant', slug],
    queryFn: () => api<PublicTenant>(`/public/t/${slug}`),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<PublicService | null>(null)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [result, setResult] = useState<BookingResult | null>(null)

  useEffect(() => {
    if (!t) return
    document.title = `${t.name} — Agende seu horário`
    if (t.faviconUrl || t.logoUrl) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (link) link.href = (t.faviconUrl || t.logoUrl)!
    }
  }, [t])

  const professionalsForService = useMemo(
    () =>
      t && service ? t.professionals.filter((p) => service.professionalIds.includes(p.id)) : [],
    [t, service],
  )

  if (isLoading || !slug) return <PageSkeleton />
  if (error || !t) {
    return (
      <Centered>
        <LogoMark className="h-12 w-12" />
        <h1 className="text-xl font-bold">Página não encontrada</h1>
        <p className="text-muted-foreground">Confira se o link está certinho.</p>
      </Centered>
    )
  }
  if (!t.available) {
    return (
      <div style={brandStyle(t.primaryColor)}>
        <Centered>
          {t.logoUrl ? (
            <img src={t.logoUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <LogoMark className="h-12 w-12" />
          )}
          <h1 className="text-xl font-bold">{t.name}</h1>
          <p className="text-muted-foreground max-w-xs">
            Agenda temporariamente indisponível. Fale direto com o estabelecimento.
          </p>
          {t.whatsapp && (
            <Button asChild>
              <a href={whatsappLink(t.whatsapp)}>
                <MessageCircle /> Chamar no WhatsApp
              </a>
            </Button>
          )}
        </Centered>
      </div>
    )
  }

  function chooseService(s: PublicService) {
    setService(s)
    setSlot(null)
    const pros = t!.professionals.filter((p) => s.professionalIds.includes(p.id))
    if (pros.length === 1) {
      setProfessionalId(pros[0]!.id)
      setStep('time')
    } else {
      setProfessionalId(null)
      setStep('professional')
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    if (step === 'details') setStep('time')
    else if (step === 'time')
      setStep(professionalsForService.length > 1 ? 'professional' : 'service')
    else setStep('service')
  }

  if (result) {
    return (
      <div style={brandStyle(t.primaryColor)} className="bg-background min-h-dvh">
        <BookingSuccess result={result} tenant={t} />
      </div>
    )
  }

  const professional = t.professionals.find((p) => p.id === professionalId)

  return (
    <div style={brandStyle(t.primaryColor)} className="bg-background min-h-dvh">
      <div className="mx-auto max-w-xl pb-36">
        {step === 'service' ? (
          <TenantHeader t={t} />
        ) : (
          <div className="bg-background/90 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
            <Button variant="ghost" size="icon" onClick={back} aria-label="Voltar">
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {step === 'professional'
                  ? 'Escolha com quem agendar'
                  : step === 'time'
                    ? 'Escolha o dia e o horário'
                    : 'Seus dados'}
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.main
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4"
          >
            {step === 'service' && <ServiceList t={t} onChoose={chooseService} />}

            {step === 'professional' && (
              <div className="space-y-3 pt-5">
                <h2 className="text-lg font-bold">Com quem você quer agendar?</h2>
                {professionalsForService.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProfessionalId(p.id)
                      setSlot(null)
                      setStep('time')
                    }}
                    className="bg-card shadow-soft hover:border-primary flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition"
                  >
                    <Avatar name={p.name} src={p.photoUrl} className="h-12 w-12" />
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      {p.bio && <p className="text-muted-foreground text-sm">{p.bio}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 'time' && service && professionalId && (
              <div className="space-y-4 pt-5">
                <ServiceSummary
                  service={service}
                  professionalName={
                    professionalsForService.length > 1 ? professional?.name : undefined
                  }
                />
                <SlotPicker
                  slug={t.slug}
                  serviceId={service.id}
                  professionalId={professionalId}
                  timezone={t.timezone}
                  maxAdvanceDays={t.maxAdvanceDays}
                  selected={slot}
                  onSelect={(s) => setSlot(s)}
                />
              </div>
            )}

            {step === 'details' && service && professionalId && slot && (
              <DetailsForm
                t={t}
                service={service}
                professionalId={professionalId}
                slot={slot}
                onSuccess={setResult}
                onSlotTaken={() => {
                  setSlot(null)
                  setStep('time')
                  qc.invalidateQueries({ queryKey: ['public-slots'] })
                  qc.invalidateQueries({ queryKey: ['public-days'] })
                }}
              />
            )}
          </motion.main>
        </AnimatePresence>

        {!t.whiteLabel && step === 'service' && (
          <footer className="text-muted-foreground mt-12 flex items-center justify-center gap-2 pb-4 text-xs">
            <LogoMark className="h-4 w-4" /> Agendamento online por{' '}
            <a href="/" className="font-semibold hover:underline">
              Marcaí
            </a>
          </footer>
        )}
      </div>

      {step === 'time' && slot && service && (
        <div className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{service.name}</p>
              <p className="text-muted-foreground text-sm">
                {capitalize(fmt(slot.startsAt, t.timezone, "EEE, dd/MM 'às' HH:mm"))}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setStep('details')
                window.scrollTo({ top: 0 })
              }}
            >
              Continuar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-xl" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-36 rounded-none" />
      <div className="-mt-10 flex flex-col items-center gap-3 px-4">
        <Skeleton className="border-background h-20 w-20 rounded-full border-4" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mt-8 space-y-3 px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function TenantHeader({ t }: { t: PublicTenant }) {
  const location = [t.address, t.city].filter(Boolean).join(' - ')
  return (
    <header>
      <div className="from-primary/80 to-primary relative h-36 overflow-hidden bg-gradient-to-br sm:h-44 sm:rounded-b-3xl">
        {t.coverUrl && <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="relative z-10 -mt-12 flex flex-col items-center px-4 text-center">
        {t.logoUrl ? (
          <img
            src={t.logoUrl}
            alt={`Logo de ${t.name}`}
            className="border-background bg-card shadow-soft h-24 w-24 rounded-full border-4 object-cover"
          />
        ) : (
          <div className="border-background bg-primary-soft text-primary shadow-soft flex h-24 w-24 items-center justify-center rounded-full border-4 text-3xl font-bold">
            {t.name.charAt(0)}
          </div>
        )}
        <h1 className="mt-3 text-2xl font-bold">{t.name}</h1>
        {t.bio && <p className="text-muted-foreground mt-1.5 max-w-md text-sm">{t.bio}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
            >
              <MapPin className="text-primary h-3.5 w-3.5" /> {t.city ?? 'Ver no mapa'}
            </a>
          )}
          {t.instagram && (
            <a
              href={`https://instagram.com/${t.instagram}`}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
            >
              <Instagram className="text-primary h-3.5 w-3.5" /> @{t.instagram}
            </a>
          )}
          {t.whatsapp && (
            <a
              href={whatsappLink(t.whatsapp)}
              target="_blank"
              rel="noreferrer"
              className="bg-card hover:border-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
            >
              <MessageCircle className="text-primary h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

function ServiceList({ t, onChoose }: { t: PublicTenant; onChoose: (s: PublicService) => void }) {
  const groups = [
    ...t.categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: t.services.filter((s) => s.categoryId === c.id),
    })),
    {
      id: 'outros',
      name: 'Outros',
      items: t.services.filter(
        (s) => !s.categoryId || !t.categories.some((c) => c.id === s.categoryId),
      ),
    },
  ].filter((g) => g.items.length)
  if (!t.services.length) {
    return (
      <p className="bg-muted text-muted-foreground mt-10 rounded-2xl p-6 text-center text-sm">
        Nenhum serviço disponível para agendamento online no momento.
      </p>
    )
  }
  return (
    <div className="mt-8 space-y-8">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Sparkles className="text-primary h-5 w-5" /> Escolha o serviço
      </h2>
      {groups.map((g) => (
        <section key={g.id}>
          {groups.length > 1 && (
            <h3 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
              {g.name}
            </h3>
          )}
          <div className="space-y-3">
            {g.items.map((s) => (
              <button
                key={s.id}
                onClick={() => onChoose(s)}
                className="bg-card shadow-soft hover:border-primary hover:shadow-lift flex w-full gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              >
                {s.photoUrl && (
                  <img
                    src={s.photoUrl}
                    alt=""
                    loading="lazy"
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  {s.description && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="text-primary font-bold">
                      {formatPrice(s.priceCents, s.priceFrom)}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {durationLabel(s.durationMinutes)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ServiceSummary({
  service,
  professionalName,
}: {
  service: PublicService
  professionalName?: string
}) {
  return (
    <div className="bg-primary-soft flex items-center gap-3 rounded-2xl p-3">
      <CalendarHeart className="text-primary h-5 w-5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="truncate font-semibold">
          {service.name}
          {professionalName && ` com ${professionalName}`}
        </p>
        <p className="text-muted-foreground">
          {durationLabel(service.durationMinutes)} ·{' '}
          {formatPrice(service.priceCents, service.priceFrom)}
        </p>
      </div>
    </div>
  )
}

function DetailsForm({
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
    if (!isValidBrazilianMobile(phone)) errs.customerPhone = 'Informe um celular válido com DDD'
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
