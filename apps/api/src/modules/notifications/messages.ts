import type { Booking, BookingFieldAnswer, Customer, Professional, Tenant } from '@prisma/client'
import {
  DEFAULT_TEMPLATES,
  formatBRL,
  formatDateLong,
  formatPhone,
  formatPrice,
  type MessageTemplateKey,
  renderTemplate,
  toLocalTime,
} from '@marcai/shared'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { publicUrlFor } from '../tenants/tenant.summary'

export async function getTemplate(tenantId: string, key: MessageTemplateKey) {
  const custom = await prisma.messageTemplate.findUnique({
    where: { tenantId_key: { tenantId, key } },
  })
  return custom?.body ?? DEFAULT_TEMPLATES[key]
}

export type FullBooking = Booking & {
  tenant: Tenant
  customer: Customer
  professional: Professional
  answers: BookingFieldAnswer[]
}

export function loadFullBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      tenant: { include: { subscription: true } },
      customer: true,
      professional: true,
      answers: true,
    },
  })
}

function answerText(a: BookingFieldAnswer) {
  if (typeof a.value === 'boolean') return a.value ? 'Sim' : 'Não'
  if (Array.isArray(a.value)) return a.value.join(', ')
  if (a.type === 'photo') return `${env.API_URL}${String(a.value)}`
  return String(a.value)
}

/** Variáveis disponíveis nos textos das mensagens. */
export function bookingVars(b: FullBooking, extra: Record<string, string> = {}) {
  const tz = b.tenant.timezone
  const manage = `${env.APP_URL}/a/${b.cancelToken}`
  const respostas = [
    ...b.answers.map(
      (a) => `📝 ${a.label}${/[?:]$/.test(a.label.trim()) ? '' : ':'} ${answerText(a)}`,
    ),
    ...(b.notes ? [`📝 Observações: ${b.notes}`] : []),
  ].join('\n')
  return {
    cliente: b.customer.name,
    telefone: formatPhone(b.customer.phone),
    servico: b.serviceName,
    profissional: b.professional.name,
    data: formatDateLong(b.startsAt, tz),
    hora: toLocalTime(b.startsAt, tz),
    hora_fim: toLocalTime(b.endsAt, tz),
    valor: formatPrice(b.priceCents, b.priceFrom).replace(/^a partir/, 'A partir'),
    negocio: b.tenant.name,
    link: `${env.APP_URL}/painel/agenda/${b.id}`,
    link_cliente: manage,
    link_confirmar: `${manage}?acao=confirmar`,
    link_remarcar: `${manage}?acao=remarcar`,
    link_agendar: publicUrlFor(b.tenant.slug),
    respostas,
    endereco: [b.tenant.address, b.tenant.city].filter(Boolean).join(' - ') || b.tenant.name,
    politica: b.tenant.cancellationPolicy ?? '',
    motivo: b.cancelReason ?? '',
    ...extra,
  }
}

/** Renderiza uma mensagem para a cliente (o {link} aponta para a área da cliente). */
export async function renderForCustomer(
  b: FullBooking,
  key: MessageTemplateKey,
  extra: Record<string, string> = {},
) {
  const vars = bookingVars(b, extra)
  return renderTemplate(await getTemplate(b.tenantId, key), { ...vars, link: vars.link_cliente })
}

export async function renderForProfessional(
  b: FullBooking,
  key: MessageTemplateKey,
  extra: Record<string, string> = {},
) {
  return renderTemplate(await getTemplate(b.tenantId, key), bookingVars(b, extra))
}

export { formatBRL }
