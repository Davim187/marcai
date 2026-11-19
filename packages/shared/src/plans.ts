/**
 * Planos e feature gating — ÚNICO lugar onde se decide o que cada plano libera.
 */
export const PLAN_IDS = ['essencial', 'pro', 'premium'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'canceled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/** Nome de cada status da assinatura, o mesmo em todas as telas (dona e admin). */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Teste grátis',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
}

export const INVOICE_STATUSES = ['pending', 'paid', 'overdue', 'refunded', 'canceled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: 'Em aberto',
  paid: 'Paga',
  overdue: 'Vencida',
  refunded: 'Estornada',
  canceled: 'Cancelada',
}
/** Faturas que ainda podem ser pagas. */
export const OPEN_INVOICE_STATUSES = [
  'pending',
  'overdue',
] as const satisfies readonly InvoiceStatus[]
export const isOpenInvoice = (status: string) =>
  (OPEN_INVOICE_STATUSES as readonly string[]).includes(status)

export const FEATURES = [
  'agenda',
  'public_page',
  'inapp_notifications',
  'push_notifications',
  'customers',
  'basic_reports',
  'whatsapp_professional',
  'whatsapp_customer',
  /** Sinal antecipado (cliente paga parte ou todo o valor para reservar) */
  'prepayment',
] as const
export type Feature = (typeof FEATURES)[number]

export interface PlanDefinition {
  id: PlanId
  name: string
  priceCents: number
  tagline: string
  features: Feature[]
  /** null = ilimitado */
  limits: PlanLimits
  highlights: string[]
}

export interface PlanLimits {
  /** Unidades (estabelecimentos) na mesma assinatura, contando a principal */
  locations: number | null
  /** Barbeiros/profissionais ativos somando todas as unidades */
  professionals: number | null
}

const ESSENCIAL_FEATURES: Feature[] = [
  'agenda',
  'public_page',
  'inapp_notifications',
  'push_notifications',
  'customers',
  'basic_reports',
]

const PRO_FEATURES: Feature[] = [
  ...ESSENCIAL_FEATURES,
  'whatsapp_professional',
  'whatsapp_customer',
]

export const PLANS: Record<PlanId, PlanDefinition> = {
  essencial: {
    id: 'essencial',
    name: 'Básico',
    priceCents: 4000,
    tagline: 'Para quem atende sozinho em um só lugar.',
    features: ESSENCIAL_FEATURES,
    limits: { locations: 1, professionals: 1 },
    highlights: [
      '1 unidade e 1 profissional',
      'Página de agendamento com seu link',
      'Agenda por dia, semana e mês',
      'Avisos no painel e notificação no celular',
      'Cadastro automático de clientes e relatórios',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Profissional',
    priceCents: 6900,
    tagline: 'Para equipes e quem tem mais de uma unidade.',
    features: PRO_FEATURES,
    limits: { locations: 3, professionals: 7 },
    highlights: [
      'Até 3 unidades e 7 profissionais',
      'Tudo do Básico',
      'Aviso de novo agendamento no seu WhatsApp',
      'Confirmação e lembrete no WhatsApp do cliente',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceCents: 9900,
    tagline: 'Sem limites, com sinal antecipado para acabar com as faltas.',
    features: [...PRO_FEATURES, 'prepayment'],
    limits: { locations: null, professionals: null },
    highlights: [
      'Unidades e profissionais ilimitados',
      'Tudo do Profissional',
      'Sinal antecipado: você define quanto o cliente paga para reservar',
      'Recebimento pelo Mercado Pago ou PIX com comprovante',
    ],
  },
}

/** Nome do recurso para mensagens de "disponível no plano X". */
export const FEATURE_MIN_PLAN: Partial<Record<Feature, PlanId>> = {
  whatsapp_professional: 'pro',
  whatsapp_customer: 'pro',
  prepayment: 'premium',
}

export const TRIAL_DAYS = 30
export const GRACE_DAYS = 7

export interface SubscriptionLike {
  plan: PlanId
  status: SubscriptionStatus
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
}

export type AppMode = 'saas' | 'single_tenant'

/** Plano efetivo: durante o teste grátis a profissional experimenta tudo (Premium). */
export function effectivePlan(sub: SubscriptionLike | null, mode: AppMode = 'saas'): PlanId {
  if (mode === 'single_tenant') return 'premium'
  if (!sub) return 'essencial'
  if (sub.status === 'trial') return 'premium'
  return sub.plan
}

export function planLimits(sub: SubscriptionLike | null, mode: AppMode = 'saas'): PlanLimits {
  return PLANS[effectivePlan(sub, mode)].limits
}

/** Plano mais barato que comporta o uso atual (unidades e profissionais). */
export function minPlanFor(usage: { locations: number; professionals: number }): PlanId {
  return (
    PLAN_IDS.find((id) => {
      const l = PLANS[id].limits
      return (
        (l.locations === null || usage.locations <= l.locations) &&
        (l.professionals === null || usage.professionals <= l.professionals)
      )
    }) ?? 'premium'
  )
}

export function hasFeature(
  sub: SubscriptionLike | null,
  feature: Feature,
  mode: AppMode = 'saas',
): boolean {
  return PLANS[effectivePlan(sub, mode)].features.includes(feature)
}

export type AccessLevel = 'full' | 'grace' | 'blocked'

/**
 * - full: em dia (ou no teste).
 * - grace: vencida há até 7 dias — tudo funciona, mas com banner.
 * - blocked: vencida há mais de 7 dias — página pública indisponível e painel somente leitura.
 */
export function accessLevel(
  sub: SubscriptionLike | null,
  now: Date = new Date(),
  mode: AppMode = 'saas',
): AccessLevel {
  if (mode === 'single_tenant') return 'full'
  if (!sub) return 'blocked'
  const due =
    sub.status === 'trial' ? sub.trialEndsAt : (sub.currentPeriodEnd ?? sub.trialEndsAt ?? null)
  if (sub.status === 'active' && (!due || due.getTime() > now.getTime())) return 'full'
  if (sub.status === 'trial' && due && due.getTime() > now.getTime()) return 'full'
  if (!due) return 'blocked'
  const graceEnd = due.getTime() + GRACE_DAYS * 86_400_000
  if (now.getTime() <= due.getTime()) return 'full'
  return now.getTime() <= graceEnd ? 'grace' : 'blocked'
}

export function trialDaysLeft(sub: SubscriptionLike | null, now: Date = new Date()): number {
  if (!sub || sub.status !== 'trial' || !sub.trialEndsAt) return 0
  return Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
}
