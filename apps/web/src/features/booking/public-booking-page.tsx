import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queries'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { whatsappLink } from '@marcai/shared'
import { LogoMark } from '@/components/logo'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { brandStyle } from '@/lib/brand'
import { capitalize, fmt } from '@/lib/dates'
import { BookingSuccess } from './booking-success'
import { SlotPicker, type Slot } from './slot-picker'
import { type BookingResult, type PublicService, type PublicTenant } from './types'
import { DetailsForm } from './details-form'
import { ServiceList, ServiceSummary } from './service-list'
import { TenantHeader } from './tenant-header'

type Step = 'service' | 'professional' | 'time' | 'details'
const STEPS: readonly Step[] = ['service', 'professional', 'time', 'details']

/** Só aceita a etapa da URL se os dados dela já foram escolhidos (ex.: depois de recarregar, volta ao início). */
function resolveStep(
  requested: string | null,
  state: { service: unknown; professionalId: string | null; slot: unknown },
): Step {
  const step = STEPS.includes(requested as Step) ? (requested as Step) : 'service'
  if (step === 'service' || !state.service) return 'service'
  if (step === 'professional') return 'professional'
  if (!state.professionalId) return 'service'
  if (step === 'details' && !state.slot) return 'time'
  return step
}
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

  const [service, setService] = useState<PublicService | null>(null)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  // A etapa fica na URL (?passo=): o voltar do navegador volta uma etapa, sem sair da página.
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const step = resolveStep(searchParams.get('passo'), { service, professionalId, slot })
  const setStep = (next: Step, opts: { replace?: boolean } = {}) =>
    setSearchParams(next === 'service' ? {} : { passo: next }, { replace: opts.replace })
  const [result, setResult] = useState<BookingResult | null>(null)

  // Link antigo (o estabelecimento trocou de endereço): mostra o endereço novo na barra
  useEffect(() => {
    if (t && slug && slug !== '_' && t.slug !== slug && !t.whiteLabel)
      navigate(`/${t.slug}${window.location.search}`, { replace: true })
  }, [t, slug, navigate])

  // Recarregou no meio: a etapa da URL não vale mais (escolhas se perderam) → volta a URL também
  const urlStep = searchParams.get('passo')
  useEffect(() => {
    if (urlStep && urlStep !== step) setStep(step, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStep, step])

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
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
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
          <h1 className="letters text-[1.75rem] leading-none">{t.name}</h1>
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
    // As etapas foram empilhadas no histórico: voltar é o mesmo que o botão do navegador
    if (window.history.length > 1) navigate(-1)
    else setStep('service', { replace: true })
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
                <h2 className="text-lg font-semibold">Com quem você quer agendar?</h2>
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
                  onSelect={setSlot}
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
                  setStep('time', { replace: true })
                  qc.invalidateQueries({ queryKey: qk.publicSlots })
                  qc.invalidateQueries({ queryKey: qk.publicDays })
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
