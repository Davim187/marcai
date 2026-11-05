/**
 * Planos e feature gating — ÚNICO lugar onde se decide o que cada plano libera.
 */
export const PLAN_IDS = ['essencial', 'pro'] as const
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
] as const
export type Feature = (typeof FEATURES)[number]

export interface PlanDefinition {
  id: PlanId
  name: string
  priceCents: number
  tagline: string
  features: Feature[]
  highlights: string[]
}

const ESSENCIAL_FEATURES: Feature[] = [
  'agenda',
  'public_page',
  'inapp_notifications',
  'push_notifications',
  'customers',
  'basic_reports',
]

export const PLANS: Record<PlanId, PlanDefinition> = {
  essencial: {
    id: 'essencial',
    name: 'Essencial',
    priceCents: 6900,
    tagline: 'Tudo para organizar sua agenda online.',
    features: ESSENCIAL_FEATURES,
    highlights: [
      'Página de agendamento com seu link',
      'Agenda por dia, semana e mês',
      'Avisos no painel e notificação no celular',
      'Cadastro automático de clientes',
      'Relatórios de faturamento',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 9900,
    tagline: 'Para quem quer zero falta e zero mensagem.',
    features: [...ESSENCIAL_FEATURES, 'whatsapp_professional', 'whatsapp_customer'],
    highlights: [
      'Tudo do Essencial',
      'Aviso de novo agendamento no seu WhatsApp',
      'Confirmação automática no WhatsApp da cliente',
      'Lembrete antes do horário (menos faltas)',
    ],
  },
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

/** Plano efetivo: durante o teste grátis a profissional experimenta tudo do Pro. */
export function effectivePlan(sub: SubscriptionLike | null, mode: AppMode = 'saas'): PlanId {
  if (mode === 'single_tenant') return 'pro'
  if (!sub) return 'essencial'
  if (sub.status === 'trial') return 'pro'
  return sub.plan
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
