import { z } from 'zod'
import { isHexColor } from './color'
import { isValidBrazilianMobile } from './phone'
import { BUSINESS_TYPES, FORM_FIELD_TYPES } from './presets'
import { MESSAGE_TEMPLATE_KEYS } from './templates'
import { isValidSlug } from './slug'

const msg = {
  required: 'Campo obrigatório',
  email: 'Informe um e-mail válido',
}

export const hhmm = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'Use o formato HH:mm')
/** Data local YYYY-MM-DD que existe de verdade no calendário (recusa 2026-11-33, 2026-02-30…). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number]
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'Data inválida')
export const id = z.string().min(1).max(64)

export const emailSchema = z.string().trim().toLowerCase().email(msg.email).max(160)
export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa')
  .refine((v) => v.trim().length >= 8, 'A senha não pode ser só espaços')
export const phoneSchema = z
  .string()
  .trim()
  .refine(isValidBrazilianMobile, 'Informe um celular válido com DDD, ex.: (85) 99999-9999')
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    isValidSlug,
    'Use de 3 a 40 letras minúsculas, números ou hífen (e não use nomes reservados)',
  )
export const colorSchema = z.string().refine(isHexColor, 'Cor inválida')

// ---------- Auth ----------
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(80),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Aceite os termos para continuar' }),
  }),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, msg.required).max(128),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
})
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
})
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema.optional().or(z.literal('')),
})

// ---------- Onboarding ----------
export const shiftSchema = z
  .object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })
  .refine((s) => s.start !== s.end, 'Início e fim não podem ser iguais')
export type ShiftInput = z.infer<typeof shiftSchema>

export const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, 'Informe o nome do negócio').max(80),
  slug: slugSchema,
  businessType: z.enum(BUSINESS_TYPES.map((b) => b.id) as [string, ...string[]]),
  shifts: z.array(shiftSchema).max(50),
  primaryColor: colorSchema.optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  timezone: z.string().max(60).optional(),
})
export type OnboardingInput = z.infer<typeof onboardingSchema>

// ---------- Tenant settings ----------
export const tenantProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(400).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  instagram: z.string().trim().max(60).optional().nullable(),
  whatsapp: phoneSchema.optional().nullable().or(z.literal('')),
  primaryColor: colorSchema,
  logoUrl: z.string().max(500).optional().nullable(),
  coverUrl: z.string().max(500).optional().nullable(),
  faviconUrl: z.string().max(500).optional().nullable(),
  timezone: z.string().max(60),
})
export type TenantProfileInput = z.infer<typeof tenantProfileSchema>

export const bookingRulesSchema = z.object({
  minAdvanceMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14),
  maxAdvanceDays: z.number().int().min(1).max(365),
  slotIntervalMinutes: z
    .number()
    .int()
    .refine((v) => [5, 10, 15, 20, 30, 45, 60].includes(v)),
  cancelMinHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14),
  cancellationPolicy: z.string().trim().max(1000).optional().nullable(),
  requireConfirmation: z.boolean(),
  reminderHours: z.number().int().min(1).max(72),
  dailySummaryEnabled: z.boolean(),
  loadHolidays: z.boolean(),
})
export type BookingRulesInput = z.infer<typeof bookingRulesSchema>

// ---------- Serviços ----------
export const categorySchema = z.object({ name: z.string().trim().min(2).max(60) })

export const serviceSchema = z.object({
  categoryId: id.nullable().optional(),
  name: z.string().trim().min(2, 'Informe o nome do serviço').max(80),
  description: z.string().trim().max(500).optional().nullable(),
  durationMinutes: z
    .number()
    .int()
    .min(5, 'Mínimo de 5 minutos')
    .max(12 * 60),
  priceCents: z.number().int().min(0).max(10_000_000),
  priceFrom: z.boolean().default(false),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  photoUrl: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  professionalIds: z.array(id).optional(),
})
export type ServiceInput = z.infer<typeof serviceSchema>

export const reorderSchema = z.object({ ids: z.array(id).max(500) })

// ---------- Horários ----------
export const workingHoursSchema = z.object({
  professionalId: id,
  shifts: z.array(shiftSchema).max(50),
})

export const timeOffSchema = z
  .object({
    professionalId: id.nullable().optional(),
    reason: z.string().trim().max(120).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((t) => t.endsAt > t.startsAt, {
    message: 'O fim precisa ser depois do início',
    path: ['endsAt'],
  })
export type TimeOffInput = z.infer<typeof timeOffSchema>

export const recurringBlockSchema = z
  .object({
    professionalId: id.nullable().optional(),
    weekday: z.number().int().min(0).max(6),
    start: hhmm,
    end: hhmm,
    reason: z.string().trim().max(120).optional().nullable(),
  })
  // "00:00"/"24:00" no fim = até a meia-noite. Pausa que atravessa a meia-noite: crie uma por dia.
  .refine((b) => b.end === '00:00' || b.end === '24:00' || b.end > b.start, {
    message:
      'O fim precisa ser depois do início (para passar da meia-noite, crie uma pausa em cada dia)',
    path: ['end'],
  })

export const holidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(80),
  closed: z.boolean().default(true),
})

// ---------- Campos personalizados ----------
export const formFieldSchema = z
  .object({
    label: z.string().trim().min(2, 'Informe a pergunta').max(120),
    type: z.enum(FORM_FIELD_TYPES),
    required: z.boolean().default(false),
    helpText: z.string().trim().max(200).optional().nullable(),
    options: z
      .array(z.string().trim().min(1).max(80))
      .max(30)
      .default([])
      .refine(
        (o) => new Set(o.map((x) => x.toLowerCase())).size === o.length,
        'Há opções repetidas',
      ),
    appliesToAll: z.boolean().default(true),
    serviceIds: z.array(id).default([]),
    active: z.boolean().default(true),
  })
  .refine((f) => !['single_select', 'multi_select'].includes(f.type) || f.options.length >= 2, {
    message: 'Adicione pelo menos 2 opções',
    path: ['options'],
  })
export type FormFieldInput = z.infer<typeof formFieldSchema>

// ---------- Reserva pública ----------
export const fieldAnswerSchema = z.object({
  fieldId: id,
  value: z.union([z.string().max(2000), z.array(z.string().max(200)).max(30), z.boolean()]),
})

export const publicBookingSchema = z.object({
  serviceId: id,
  professionalId: id,
  startsAt: z.coerce.date(),
  customerName: z.string().trim().min(2, 'Informe seu nome').max(80),
  customerPhone: phoneSchema,
  customerEmail: emailSchema.optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  answers: z.array(fieldAnswerSchema).max(50).default([]),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Precisamos do seu consentimento para salvar seus dados' }),
  }),
  /** Honeypot anti-bot: precisa vir vazio. */
  website: z.string().max(500).optional(),
})
export type PublicBookingInput = z.infer<typeof publicBookingSchema>

export const availabilityQuerySchema = z.object({
  serviceId: id,
  professionalId: id,
  from: isoDate,
  to: isoDate,
})
export const slotsQuerySchema = z.object({
  serviceId: id,
  professionalId: id,
  date: isoDate,
  excludeBookingId: id.optional(),
})

// ---------- Agendamentos (painel) ----------
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'canceled',
  'no_show',
] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  canceled: 'Cancelado',
  no_show: 'Faltou',
}
/** Ocupam horário na agenda (contam para a exclusion constraint e para o faturamento). */
export const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
] as const satisfies readonly BookingStatus[]
/** Ainda vão acontecer: podem ser confirmados, remarcados ou cancelados. */
export const OPEN_BOOKING_STATUSES = [
  'pending',
  'confirmed',
] as const satisfies readonly BookingStatus[]
export const isOpenBooking = (status: string) =>
  (OPEN_BOOKING_STATUSES as readonly string[]).includes(status)
/** Mensagens de sucesso ao mudar o status no painel. */
export const BOOKING_STATUS_TOASTS: Record<BookingStatus, string> = {
  pending: 'Agendamento marcado como pendente',
  confirmed: 'Agendamento confirmado',
  completed: 'Atendimento concluído',
  canceled: 'Agendamento cancelado',
  no_show: 'Falta registrada',
}

export const manualBookingSchema = z.object({
  serviceId: id,
  professionalId: id,
  startsAt: z.coerce.date(),
  customerId: id.optional(),
  customerName: z.string().trim().min(2).max(80).optional(),
  customerPhone: phoneSchema.optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  priceCents: z.number().int().min(0).optional(),
  /** Permite encaixe fora do expediente (só checa conflito com outras clientes). */
  allowOutsideHours: z.boolean().default(false),
  notifyCustomer: z.boolean().default(true),
})
export type ManualBookingInput = z.infer<typeof manualBookingSchema>

export const bookingListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  serviceId: id.optional(),
  customerId: id.optional(),
  professionalId: id.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
})

export const bookingStatusUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  reason: z.string().trim().max(300).optional(),
})

export const rescheduleSchema = z.object({
  startsAt: z.coerce.date(),
  professionalId: id.optional(),
  force: z.boolean().default(false),
})

// ---------- Clientes ----------
export const customerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('')).nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  birthday: isoDate.optional().nullable().or(z.literal('')),
})
export type CustomerInput = z.infer<typeof customerSchema>

// ---------- Equipe ----------
export const professionalSchema = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(300).optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  serviceIds: z.array(id).default([]),
})
export const inviteMemberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  role: z.enum(['owner', 'professional']),
  createProfessional: z.boolean().default(true),
})

// ---------- Notificações ----------
export const messageTemplateSchema = z.object({
  key: z.enum(MESSAGE_TEMPLATE_KEYS),
  body: z.string().trim().min(5).max(2000),
})
export const notificationSettingsSchema = z.object({
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
  whatsappProfessional: z.boolean(),
  whatsappCustomer: z.boolean(),
  sound: z.boolean(),
  notifyPhone: phoneSchema.optional().nullable().or(z.literal('')),
})
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
})

// ---------- Cliente final (token) ----------
export const customerCancelSchema = z.object({ reason: z.string().trim().max(300).optional() })
export const customerRescheduleSchema = z.object({ startsAt: z.coerce.date() })

// ---------- Assinatura ----------
export const changePlanSchema = z.object({
  plan: z.enum(['essencial', 'pro']),
  billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED']).default('UNDEFINED'),
  cpfCnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 11 || v.length === 14, 'Informe um CPF ou CNPJ válido')
    .optional(),
})

// ---------- Admin ----------
export const extendTrialSchema = z.object({ days: z.number().int().min(1).max(365) })
export const blockTenantSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().max(300).optional(),
})
