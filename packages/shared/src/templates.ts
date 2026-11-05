/** Textos de mensagem editáveis com variáveis: {cliente}, {servico}, {data}, {hora}, {valor}, {link}… */
export const MESSAGE_TEMPLATE_KEYS = [
  'professional_new_booking',
  'professional_booking_canceled',
  'professional_booking_rescheduled',
  'professional_daily_summary',
  'customer_confirmation',
  'customer_pending',
  'customer_reminder',
  'customer_canceled',
  'customer_rescheduled',
] as const
export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number]

export interface TemplateMeta {
  key: MessageTemplateKey
  title: string
  audience: 'profissional' | 'cliente'
  description: string
  variables: string[]
}

const BOOKING_VARS = [
  'cliente',
  'telefone',
  'servico',
  'profissional',
  'data',
  'hora',
  'hora_fim',
  'valor',
  'negocio',
  'link',
]

export const TEMPLATE_META: Record<MessageTemplateKey, TemplateMeta> = {
  professional_new_booking: {
    key: 'professional_new_booking',
    title: 'Novo agendamento',
    audience: 'profissional',
    description: 'Enviada para você quando uma cliente agenda.',
    variables: [...BOOKING_VARS, 'respostas'],
  },
  professional_booking_canceled: {
    key: 'professional_booking_canceled',
    title: 'Agendamento cancelado',
    audience: 'profissional',
    description: 'Quando a cliente cancela pelo link.',
    variables: [...BOOKING_VARS, 'motivo'],
  },
  professional_booking_rescheduled: {
    key: 'professional_booking_rescheduled',
    title: 'Agendamento remarcado',
    audience: 'profissional',
    description: 'Quando a cliente remarca pelo link.',
    variables: [...BOOKING_VARS, 'data_anterior', 'hora_anterior'],
  },
  professional_daily_summary: {
    key: 'professional_daily_summary',
    title: 'Resumo do dia',
    audience: 'profissional',
    description: 'Enviado às 07:00 com a agenda do dia (opcional).',
    variables: ['negocio', 'data', 'total', 'agenda', 'link'],
  },
  customer_confirmation: {
    key: 'customer_confirmation',
    title: 'Confirmação para a cliente',
    audience: 'cliente',
    description: 'Enviada para a cliente logo depois de agendar.',
    variables: [...BOOKING_VARS, 'endereco', 'politica'],
  },
  customer_pending: {
    key: 'customer_pending',
    title: 'Pedido recebido (confirmação manual)',
    audience: 'cliente',
    description:
      'Enviado quando você confirma cada pedido manualmente: avisa que o horário ainda vai ser confirmado.',
    variables: [...BOOKING_VARS, 'endereco'],
  },
  customer_reminder: {
    key: 'customer_reminder',
    title: 'Lembrete para a cliente',
    audience: 'cliente',
    description: 'Enviado algumas horas antes do horário.',
    variables: [...BOOKING_VARS, 'link_confirmar', 'link_remarcar', 'endereco'],
  },
  customer_canceled: {
    key: 'customer_canceled',
    title: 'Cancelamento para a cliente',
    audience: 'cliente',
    description: 'Avisa a cliente que o horário foi cancelado.',
    variables: [...BOOKING_VARS, 'motivo', 'link_agendar'],
  },
  customer_rescheduled: {
    key: 'customer_rescheduled',
    title: 'Remarcação para a cliente',
    audience: 'cliente',
    description: 'Avisa a cliente sobre o novo horário.',
    variables: BOOKING_VARS,
  },
}

export const DEFAULT_TEMPLATES: Record<MessageTemplateKey, string> = {
  professional_new_booking: `📅 Novo agendamento!

👤 Cliente: {cliente}
📱 WhatsApp: {telefone}
✨ Serviço: {servico}
📅 {data}
🕐 {hora} às {hora_fim}
💰 {valor}

{respostas}

Ver no painel: {link}`,
  professional_booking_canceled: `❌ Agendamento cancelado

👤 {cliente} cancelou o horário.
✨ Serviço: {servico}
📅 {data} às {hora}
📝 Motivo: {motivo}

O horário já está livre de novo na sua agenda.
{link}`,
  professional_booking_rescheduled: `🔁 Agendamento remarcado

👤 {cliente} remarcou o horário.
✨ Serviço: {servico}
Antes: {data_anterior} às {hora_anterior}
Agora: 📅 {data} às {hora}

{link}`,
  professional_daily_summary: `☀️ Bom dia! Sua agenda de hoje ({data}):

{agenda}

Total previsto: {total}
{link}`,
  customer_confirmation: `Olá, {cliente}! ✅ Seu horário está confirmado.

✨ {servico}
📅 {data}
🕐 {hora}
💰 {valor}
📍 {endereco}

{politica}

Para ver, cancelar ou remarcar: {link}

{negocio}`,
  customer_pending: `Olá, {cliente}! Recebemos seu pedido de horário 📝

✨ {servico}
📅 {data}
🕐 {hora}

Ele ainda NÃO está confirmado: {negocio} vai confirmar em breve e você recebe uma mensagem.
Para ver ou cancelar o pedido: {link}`,
  customer_reminder: `Oi, {cliente}! Passando para lembrar do seu horário ⏰

✨ {servico}
📅 {data} às {hora}
📍 {endereco}

✅ Confirmar presença: {link_confirmar}
🔁 Preciso remarcar: {link_remarcar}

Até logo! {negocio}`,
  customer_canceled: `Oi, {cliente}. Seu horário de {servico} em {data} às {hora} foi cancelado.

{motivo}

Para agendar outro horário: {link_agendar}
{negocio}`,
  customer_rescheduled: `Oi, {cliente}! Seu horário foi remarcado 🗓️

✨ {servico}
📅 {data}
🕐 {hora}

Detalhes: {link}
{negocio}`,
}

/** Substitui {variavel} pelo valor. Variáveis desconhecidas ficam como estão. */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template
    .replace(/\{([a-z_]+)\}/g, (match, key: string) => {
      const v = vars[key]
      return v === undefined ? match : v
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const SAMPLE_TEMPLATE_VARS: Record<string, string> = {
  cliente: 'Ana Souza',
  telefone: '(85) 99999-9999',
  servico: 'Corte + barba',
  profissional: 'Rafael Costa',
  data: 'Quinta-feira, 06/11',
  hora: '14:00',
  hora_fim: '15:00',
  valor: 'R$ 70,00',
  negocio: 'Studio Vértice',
  link: 'https://marcai.app/a/abc123',
  link_confirmar: 'https://marcai.app/a/abc123?acao=confirmar',
  link_remarcar: 'https://marcai.app/a/abc123?acao=remarcar',
  link_agendar: 'https://marcai.app/studiovertice',
  respostas:
    '📝 É sua primeira vez aqui? Sim\n📝 Comprimento do cabelo: Médio\n📝 Observações: Quero manter o volume em cima',
  motivo: 'Imprevisto no trabalho',
  endereco: 'Rua das Flores, 123 - Aldeota, Fortaleza',
  politica: 'Cancelamentos e remarcações até 12h antes pelo link.',
  data_anterior: 'Quarta-feira, 05/11',
  hora_anterior: '10:00',
  total: 'R$ 480,00',
  agenda: '08:00 · Ana Souza · Escova\n10:00 · Pedro Lima · Corte + barba',
}
