import type { BookingStatus, Feature, PlanId, SubscriptionStatus } from '@marcai/shared'

export interface TenantSummary {
  id: string
  slug: string
  name: string
  businessType: string
  primaryColor: string
  logoUrl: string | null
  timezone: string
  onboardingCompleted: boolean
  notifySound: boolean
  blocked: boolean
  publicUrl: string
  role: 'owner' | 'professional'
  professionalId: string | null
  professionalsCount: number
  subscription: {
    plan: PlanId
    status: SubscriptionStatus
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    trialDaysLeft: number
    billingType: string | null
  } | null
  effectivePlan: PlanId
  access: 'full' | 'grace' | 'blocked'
  features: Feature[]
}

export type Session =
  | { authenticated: false; appMode: 'saas' | 'single_tenant'; googleEnabled: boolean }
  | {
      authenticated: true
      appMode: 'saas' | 'single_tenant'
      googleEnabled: boolean
      csrfToken: string
      impersonating: boolean
      user: {
        id: string
        email: string
        name: string
        phone: string | null
        avatarUrl: string | null
        isSuperAdmin: boolean
        hasPassword: boolean
        hasGoogle: boolean
      }
      memberships: Array<{
        tenantId: string
        role: string
        tenant: { id: string; name: string; slug: string; logoUrl: string | null }
      }>
      /** Convites para equipes de outros estabelecimentos, aguardando aceite */
      invites?: Array<{
        tenantId: string
        role: string
        tenant: { id: string; name: string; slug: string; logoUrl: string | null }
      }>
      activeTenantId: string | null
      tenant: TenantSummary | null
    }

export interface Service {
  id: string
  categoryId: string | null
  name: string
  description: string | null
  durationMinutes: number
  priceCents: number
  priceFrom: boolean
  bufferMinutes: number
  photoUrl: string | null
  active: boolean
  sortOrder: number
  professionalIds?: string[]
}

export interface Category {
  id: string
  name: string
  sortOrder: number
}

export interface Professional {
  id: string
  name: string
  bio: string | null
  photoUrl: string | null
  active: boolean
  serviceIds?: string[]
}

export interface FormFieldDTO {
  id: string
  label: string
  type: 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'yes_no' | 'photo'
  required: boolean
  helpText: string | null
  appliesToAll: boolean
  active: boolean
  sortOrder: number
  options: Array<{ id: string; label: string }>
  serviceIds: string[]
}

export interface BookingDTO {
  id: string
  startsAt: string
  endsAt: string
  status: BookingStatus
  source: 'online' | 'manual'
  serviceId: string
  serviceName: string
  durationMinutes: number
  priceCents: number
  priceFrom: boolean
  notes: string | null
  cancelReason: string | null
  customerConfirmedAt: string | null
  professionalId: string
  professional: { id: string; name: string }
  customer: { id: string; name: string; phone: string }
  answers?: Array<{ fieldId: string; label: string; type: string; value: unknown }>
  createdAt: string
}

export interface CustomerDTO {
  id: string
  name: string
  phone: string
  email: string | null
  notes: string | null
  tags: string[]
  birthday: string | null
  createdAt: string
  stats?: {
    totalSpentCents: number
    visits: number
    noShows: number
    lastVisit: string | null
    nextVisit: string | null
  }
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
