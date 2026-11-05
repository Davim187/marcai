import { InviteBanner } from '@/components/invite-banner'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  BRAND_PRESET_COLORS,
  BUSINESS_TYPES,
  DEFAULT_PRIMARY_COLOR,
  RESERVED_SLUGS,
  type ShiftInput,
  slugify,
} from '@marcai/shared'
import { Logo } from '@/components/logo'
import { ImageUpload } from '@/components/image-upload'
import { QrCode } from '@/components/qr-code'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useRefreshSession, useSession } from '@/lib/session'
import { cn, copyToClipboard } from '@/lib/utils'
import { defaultShifts, ShiftsEditor } from '../schedule/shifts-editor'

const COLORS = BRAND_PRESET_COLORS
const STEPS = ['Seu negócio', 'Tipo', 'Horários', 'Visual']

interface SlugState {
  slug: string
  available: boolean
  valid: boolean
  suggestion: string | null
  checking: boolean
}

const DRAFT_KEY = 'marcai-onboarding'
interface Draft {
  businessName?: string
  slugInput?: string
  slugTouched?: boolean
  businessType?: string
  shifts?: ShiftInput[]
  color?: string
  logoUrl?: string | null
}
function loadDraft(): Draft {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Draft
  } catch {
    return {}
  }
}
function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* armazenamento indisponível: segue sem rascunho */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignora */
  }
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const refresh = useRefreshSession()
  const { data: session } = useSession()
  // Rascunho salvo na sessão do navegador: recarregar a página não perde o que foi preenchido
  const [draft] = useState(loadDraft)
  // O passo fica na URL (?passo=2): o voltar do navegador volta um passo do wizard
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedStep = Math.min(3, Math.max(0, Number(searchParams.get('passo') ?? 1) - 1)) || 0
  const [businessName, setBusinessName] = useState(draft.businessName ?? '')
  const [slugInput, setSlugInput] = useState(draft.slugInput ?? '')
  const [slugTouched, setSlugTouched] = useState(draft.slugTouched ?? false)
  const [slugState, setSlugState] = useState<SlugState | null>(null)
  const [businessType, setBusinessType] = useState(draft.businessType ?? 'manicure')
  const [shifts, setShifts] = useState<ShiftInput[]>(draft.shifts ?? defaultShifts())
  const [color, setColor] = useState(draft.color ?? DEFAULT_PRIMARY_COLOR)
  const [logoUrl, setLogoUrl] = useState<string | null>(draft.logoUrl ?? null)
  // Não deixa pular para um passo sem ter um link válido escolhido
  const step =
    requestedStep > 0 && (businessName.trim().length < 2 || slugify(slugInput).length < 3)
      ? 0
      : requestedStep
  const setStep = (update: (s: number) => number) =>
    setSearchParams({ passo: String(update(step) + 1) })

  useEffect(() => {
    saveDraft({ businessName, slugInput, slugTouched, businessType, shifts, color, logoUrl })
  }, [businessName, slugInput, slugTouched, businessType, shifts, color, logoUrl])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ publicUrl: string } | null>(null)

  useEffect(() => {
    if (session?.authenticated && session.tenant) navigate('/painel', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    if (!slugTouched) setSlugInput(slugify(businessName))
  }, [businessName, slugTouched])

  // Checagem de disponibilidade em tempo real (debounce)
  useEffect(() => {
    const s = slugify(slugInput)
    if (s.length < 3) {
      setSlugState(null)
      return
    }
    setSlugState((p) => ({
      ...(p ?? { available: false, valid: false, suggestion: null }),
      slug: s,
      checking: true,
    }))
    const t = setTimeout(async () => {
      try {
        const r = await api<Omit<SlugState, 'checking'>>(
          `/tenant/slug-availability?slug=${encodeURIComponent(s)}`,
        )
        setSlugState({ ...r, checking: false })
      } catch {
        setSlugState(null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [slugInput])

  const host = window.location.host
  const canNext =
    step === 0
      ? businessName.trim().length >= 2 && !!slugState?.available && !slugState.checking
      : step === 2
        ? shifts.length > 0
        : true

  async function finish() {
    if (!slugState?.available) {
      toast.error('Confira o seu link de agendamento antes de continuar.')
      setSearchParams({ passo: '1' })
      return
    }
    setSubmitting(true)
    try {
      const res = await api<{ publicUrl: string }>('/tenant/onboarding', {
        body: {
          businessName: businessName.trim(),
          slug: slugState!.slug,
          businessType,
          shifts,
          primaryColor: color,
          logoUrl,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone?.startsWith('America/')
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        },
      })
      clearDraft()
      setDone(res)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card shadow-lift w-full max-w-md rounded-3xl border p-6 text-center sm:p-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.15 }}
            className="bg-success text-success-foreground mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          >
            <Check className="h-8 w-8" strokeWidth={3} />
          </motion.div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sua agenda está no ar</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Coloque esse link na bio do Instagram e mande para suas clientes.
          </p>
          <div className="bg-background mt-5 flex items-center gap-2 rounded-xl border p-2 pl-3">
            <span className="text-primary flex-1 truncate text-left text-sm font-semibold">
              {done.publicUrl.replace(/^https?:\/\//, '')}
            </span>
            <Button
              size="sm"
              onClick={async () =>
                (await copyToClipboard(done.publicUrl)) && toast.success('Link copiado.')
              }
            >
              <Copy /> Copiar
            </Button>
          </div>
          <div className="mt-6">
            <QrCode value={done.publicUrl} />
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              size="lg"
              onClick={async () => {
                await refresh()
                navigate('/painel', { replace: true })
              }}
            >
              Ir para o meu painel
            </Button>
            <Button variant="ghost" asChild>
              <a href={done.publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Ver minha página
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-dvh">
      <InviteBanner />
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Logo />
        <span className="text-muted-foreground text-sm">Passo {step + 1} de 4</span>
      </header>
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-8 flex gap-2" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  i <= step ? 'bg-primary' : 'bg-muted',
                )}
              />
              <p
                className={cn(
                  'mt-1.5 hidden text-xs sm:block',
                  i === step ? 'text-foreground font-semibold' : 'text-muted-foreground',
                )}
              >
                {s}
              </p>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="pb-32"
          >
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                    Como se chama o seu negócio?
                  </h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    É o nome que suas clientes vão ver na página de agendamento.
                  </p>
                </div>
                <Field label="Nome do negócio" htmlFor="businessName">
                  <Input
                    id="businessName"
                    autoFocus
                    placeholder="Ex.: Studio Vértice"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </Field>
                <Field
                  label="Seu link de agendamento"
                  htmlFor="slug"
                  hint="Use letras minúsculas, números e hífen. Dá para mudar depois."
                >
                  <div className="border-input bg-card focus-within:border-primary focus-within:ring-ring/30 flex items-center rounded-lg border shadow-sm focus-within:ring-2">
                    <span className="text-muted-foreground pl-3 text-sm">{host}/</span>
                    <input
                      id="slug"
                      className="h-11 flex-1 bg-transparent pr-2 text-base outline-none sm:text-sm"
                      value={slugInput}
                      onChange={(e) => {
                        setSlugTouched(true)
                        setSlugInput(e.target.value.toLowerCase())
                      }}
                      aria-describedby="slug-status"
                    />
                    <span className="pr-3" id="slug-status" aria-live="polite">
                      {slugState?.checking ? (
                        <Loader2
                          className="text-muted-foreground h-4 w-4 animate-spin"
                          aria-label="Verificando"
                        />
                      ) : slugState?.available ? (
                        <Check className="text-success h-4 w-4" aria-label="Disponível" />
                      ) : slugState ? (
                        <X className="text-destructive h-4 w-4" aria-label="Indisponível" />
                      ) : null}
                    </span>
                  </div>
                </Field>
                {slugify(slugInput) && (
                  <p className="text-muted-foreground text-sm">
                    Seu link vai ficar:{' '}
                    <strong className="text-foreground">
                      {host}/{slugify(slugInput)}
                    </strong>
                  </p>
                )}
                {slugInput.trim() && slugify(slugInput).length < 3 && (
                  <p className="text-destructive text-sm">
                    Use pelo menos 3 letras ou números no link.
                  </p>
                )}
                {slugState && !slugState.checking && !slugState.available && (
                  <p className="text-destructive text-sm">
                    {slugState.valid
                      ? 'Esse link já está em uso.'
                      : RESERVED_SLUGS.has(slugState.slug)
                        ? 'Essa palavra é reservada pelo sistema.'
                        : 'Esse link não é válido.'}
                    {slugState.suggestion && (
                      <>
                        {' '}
                        Que tal{' '}
                        <button
                          className="font-semibold underline"
                          onClick={() => {
                            setSlugTouched(true)
                            setSlugInput(slugState.suggestion!)
                          }}
                        >
                          {slugState.suggestion}
                        </button>
                        ?
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em]">Qual é a sua área?</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Já deixamos serviços e perguntas sugeridos. Você ajusta tudo depois.
                  </p>
                </div>
                <div
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label="Tipo de negócio"
                >
                  {BUSINESS_TYPES.map((b) => (
                    <button
                      key={b.id}
                      role="radio"
                      aria-checked={businessType === b.id}
                      onClick={() => setBusinessType(b.id)}
                      className={cn(
                        'bg-card hover:border-primary/50 flex flex-col items-start gap-2 rounded-2xl border p-4 text-left shadow-sm transition',
                        businessType === b.id && 'border-primary ring-primary/20 ring-2',
                      )}
                    >
                      <span className="text-2xl" aria-hidden>
                        {b.emoji}
                      </span>
                      <span className="text-sm font-semibold">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em]">Quando você atende?</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Dá para ter mais de um turno por dia, com pausa para o almoço.
                  </p>
                </div>
                <ShiftsEditor value={shifts} onChange={setShifts} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                    Deixe com a sua cara
                  </h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Logo e cor principal. Se preferir, pule e faça depois.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <ImageUpload
                    value={logoUrl}
                    onChange={setLogoUrl}
                    label="Logo"
                    shape="round"
                    endpoint="/uploads/onboarding"
                  />
                  <p className="text-muted-foreground text-sm">
                    Uma imagem quadrada fica melhor. Até 5 MB.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Cor principal</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          'ring-offset-background h-10 w-10 rounded-full ring-offset-2 transition',
                          color === c && 'ring-foreground ring-2',
                        )}
                        style={{ background: c }}
                        aria-label={`Cor ${c}`}
                        aria-pressed={color === c}
                      />
                    ))}
                    <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                        aria-label="Outra cor"
                      />
                      Outra
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border p-4" style={{ background: `${color}10` }}>
                  <p className="text-muted-foreground text-xs">Prévia do botão</p>
                  <button
                    className="mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: color }}
                  >
                    Agendar horário
                  </button>
                </div>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 border-t backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft /> Voltar
          </Button>
          <div className="flex gap-2">
            {step === 3 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setLogoUrl(null)
                  setColor(DEFAULT_PRIMARY_COLOR)
                  finish()
                }}
                disabled={submitting}
              >
                Pular
              </Button>
            )}
            {step < 3 ? (
              <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Continuar
              </Button>
            ) : (
              <Button size="lg" onClick={finish} loading={submitting}>
                Criar minha agenda
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
