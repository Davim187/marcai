export interface PublicTenant {
  slug: string
  name: string
  bio: string | null
  logoUrl: string | null
  coverUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  address: string | null
  city: string | null
  instagram: string | null
  whatsapp: string | null
  timezone: string
  cancellationPolicy: string | null
  cancelMinHours: number
  maxAdvanceDays: number
  whiteLabel: boolean
  available: boolean
  /** Sinal antecipado (null quando o estabelecimento não cobra) */
  prepayment: { percent: number; method: 'mercadopago' | 'pix_manual'; holdMinutes: number } | null
  categories: Array<{ id: string; name: string }>
  services: Array<{
    id: string
    categoryId: string | null
    name: string
    description: string | null
    durationMinutes: number
    priceCents: number
    priceFrom: boolean
    photoUrl: string | null
    professionalIds: string[]
  }>
  professionals: Array<{ id: string; name: string; bio: string | null; photoUrl: string | null }>
  fields: Array<{
    id: string
    label: string
    type: 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'yes_no' | 'photo'
    required: boolean
    helpText: string | null
    appliesToAll: boolean
    options: Array<{ id: string; label: string }>
    serviceIds: string[]
  }>
}

export interface BookingResult {
  id: string
  token: string
  status: string
  startsAt: string
  endsAt: string
  serviceName: string
  priceCents: number
  priceFrom: boolean
  professionalName: string
  customerName: string
  cancellationPolicy: string | null
  googleCalendarUrl: string
  manageUrl: string
  icsUrl: string
  payment: PrepaymentView | null
}

/** Sinal antecipado visto pela cliente (página de sucesso e área da cliente). */
export interface PrepaymentView {
  method: 'mercadopago' | 'pix_manual'
  status: 'awaiting_payment' | 'under_review' | 'paid' | 'rejected' | 'expired' | 'refunded'
  percent: number
  amountCents: number
  expiresAt: string
  proofSent: boolean
  rejectReason: string | null
  checkoutUrl: string | null
  pix: { key: string; holder: string | null; copyPaste: string; qrDataUrl: string } | null
}

export type PublicService = PublicTenant['services'][number]
