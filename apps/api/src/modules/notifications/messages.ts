import { ACCOUNT_SUB_INCLUDE, withAccountSub } from '../../lib/account'
import type { Booking, BookingFieldAnswer, Customer, Professional, Tenant } from '@prisma/client'
import {
  DEFAULT_TEMPLATES,
  everyWeekAt,
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

export async function loadFullBooking(id: string) {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      tenant: { include: ACCOUNT_SUB_INCLUDE },
      customer: true,
      professional: true,
      answers: true,
    },
  })
  // Unidade extra: plano e recursos (ex.: WhatsApp) vêm da assinatura da principal
  return b && { ...b, tenant: withAccountSub(b.tenant) }
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

/** Mensagens que ganham a linha do horário fixo quando o agendamento é de uma série. */
const SERIES_KEYS = new Set<MessageTemplateKey>([
  'customer_confirmation',
  'customer_pending',
  'professional_new_booking',
])

/**
 * Linha do horário fixo, acrescentada ao fim do texto (vale mesmo para modelos que o
 * estabelecimento personalizou antes de o recurso existir).
 */
function withSeriesLine(b: FullBooking, key: MessageTemplateKey, text: string) {
  if (!b.seriesId || !SERIES_KEYS.has(key)) return text
  return `${text}\n\n🔁 Horário fixo: ${everyWeekAt(b.startsAt, b.tenant.timezone)}. As próximas sessões já estão reservadas.`
}

/** Renderiza uma mensagem para a cliente (o {link} aponta para a área da cliente). */
export async function renderForCustomer(
  b: FullBooking,
  key: MessageTemplateKey,
  extra: Record<string, string> = {},
) {
  const vars = bookingVars(b, extra)
  const text = renderTemplate(await getTemplate(b.tenantId, key), {
    ...vars,
    link: vars.link_cliente,
  })
  return withSeriesLine(b, key, text)
}

export async function renderForProfessional(
  b: FullBooking,
  key: MessageTemplateKey,
  extra: Record<string, string> = {},
) {
  return withSeriesLine(
    b,
    key,
    renderTemplate(await getTemplate(b.tenantId, key), bookingVars(b, extra)),
  )
}

export { formatBRL }
