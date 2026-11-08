import nodemailer, { type Transporter } from 'nodemailer'
import { Resend } from 'resend'
import { env } from '../config/env'
import { logger } from './logger'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
  fromName?: string
}

let resend: Resend | null = null
let smtp: Transporter | null = null

/** Qual serviço de e-mail está configurado (para a tela de diagnóstico). */
export function emailTransport(): 'resend' | 'smtp' | 'log' {
  if (env.RESEND_API_KEY) return 'resend'
  if (env.SMTP_HOST) return 'smtp'
  return 'log'
}

function smtpClient() {
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  })
  return smtp
}

/**
 * O Resend limita as requisições por segundo da conta (padrão 2/s) e o worker envia em
 * paralelo: sem esse espaçamento, parte dos e-mails volta com "rate_limit_exceeded" e só sai
 * na repetição. Cada envio reserva o próximo horário livre (vale para este processo).
 */
const RESEND_GAP_MS = Math.ceil(1000 / env.RESEND_MAX_PER_SECOND)
let nextResendAt = 0
function resendSlot() {
  const now = Date.now()
  const at = Math.max(now, nextResendAt)
  nextResendAt = at + RESEND_GAP_MS
  return at > now ? new Promise((r) => setTimeout(r, at - now)) : Promise.resolve()
}

/** Erros que não adianta repetir (endereço recusado). */
export class EmailRejectedError extends Error {}

/**
 * Envia e-mail pelo Resend ou por SMTP. Sem nenhum configurado, apenas registra no log
 * (modo dev). Erros lançam exceção para a fila tentar de novo.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ id: string | null }> {
  const address = env.EMAIL_FROM.match(/<(.+)>/)?.[1] ?? env.EMAIL_FROM
  // O nome do remetente vira cabeçalho: tira aspas e quebras de linha
  const safeName = msg.fromName?.replace(/["<>\\\r\n]/g, '').trim()
  const from = safeName ? `"${safeName}" <${address}>` : env.EMAIL_FROM
  const transport = emailTransport()
  if (transport === 'log') {
    logger.info({ to: msg.to, subject: msg.subject, text: msg.text }, '📧 [e-mail simulado]')
    return { id: null }
  }
  if (transport === 'smtp') {
    try {
      const info = await smtpClient().sendMail({
        from: safeName ? { name: safeName, address } : env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      })
      return { id: info.messageId ?? null }
    } catch (err) {
      const code = (err as { responseCode?: number }).responseCode ?? 0
      // 550/553: caixa inexistente ou endereço recusado
      if (code === 550 || code === 553) throw new EmailRejectedError((err as Error).message)
      throw err
    }
  }
  resend ??= new Resend(env.RESEND_API_KEY)
  await resendSlot()
  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  })
  if (error) {
    if (error.name === 'validation_error') throw new EmailRejectedError(error.message)
    throw new Error(`Falha ao enviar e-mail: ${error.message}`)
  }
  return { id: data?.id ?? null }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Cores da identidade do Marcaí (as mesmas do painel, em hex para os clientes de e-mail). */
const UI = {
  page: '#EEEFF1',
  card: '#FFFFFF',
  border: '#D9DCE1',
  ink: '#1C1E21',
  muted: '#565D69',
  graphite: '#25282D',
  cream: '#F7F4EC',
  mustard: '#E2A823',
  cobalt: '#2B4CC0',
}
const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif"
const FONT_LETTERS = "'Barlow Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif"

/** Texto legível sobre a cor: tinta escura em cores claras, creme nas escuras. */
function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return UI.cream
  const n = parseInt(m[1]!, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? UI.ink : UI.cream
}

/** Cor hexadecimal segura para estilo inline (a do salão já é validada, mas não custa). */
const safeColor = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined)

/** Escapa a linha e transforma endereços http(s) em links clicáveis. */
function richLine(line: string) {
  return escape(line).replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (url) => `<a href="${url}" style="color:${UI.cobalt};text-decoration:underline">${url}</a>`,
  )
}

/**
 * Layout dos e-mails transacionais, com a cara do painel: faixa grafite com o nome da marca
 * em letras condensadas, o ponto mostarda do logo e cartão branco com borda fina.
 * Tabelas e estilo inline para funcionar no Gmail, Outlook e Apple Mail. Quando o e-mail é
 * de um estabelecimento (`brandName` + `color`), a faixa e o botão usam a cor dele.
 */
export function emailLayout(opts: {
  title: string
  body: string
  cta?: { label: string; url: string }
  brandName?: string
  color?: string
}): { html: string; text: string } {
  // "Studio X via Marcaí" é o remetente; no cabeçalho basta o nome do estabelecimento
  const brand = (opts.brandName ?? env.APP_NAME).replace(` via ${env.APP_NAME}`, '')
  const isPlatform = brand === env.APP_NAME
  const whiteLabel = env.APP_MODE === 'single_tenant'
  // E-mails da plataforma (painel) usam a identidade do Marcaí; a cor do salão só nos dele
  const tenantColor = isPlatform ? undefined : safeColor(opts.color)
  const band = tenantColor ?? UI.graphite
  const bandText = tenantColor ? textOn(tenantColor) : UI.cream
  const button = tenantColor ?? UI.graphite
  const buttonText = tenantColor ? textOn(tenantColor) : UI.cream
  const lines = opts.body.split('\n').map((l) => l.trim())
  const preheader = lines.find(Boolean) ?? opts.title

  // Linhas seguidas formam um bloco (como no WhatsApp); linha em branco separa parágrafos.
  // Corpo de uma linha por frase, sem linhas em branco, vira um parágrafo por linha.
  const hasBlankLines = lines.includes('')
  const blocks = hasBlankLines
    ? opts.body
        .split(/\n\s*\n/)
        .map((b) =>
          b
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        )
        .filter((b) => b.length)
    : lines.filter(Boolean).map((l) => [l])
  const paragraphs = blocks
    .map(
      (b) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${UI.ink}">${b.map(richLine).join('<br>')}</p>`,
    )
    .join('')

  const cta = opts.cta
    ? `<tr><td class="px" style="padding:12px 40px 8px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${button}" style="border-radius:6px;background:${button}">
<a href="${escape(opts.cta.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT_LETTERS};font-size:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${buttonText};text-decoration:none;border-radius:6px">${escape(opts.cta.label)}</a>
</td></tr></table>
</td></tr>
<tr><td class="px" style="padding:16px 40px 0">
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${UI.muted}">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${escape(opts.cta.url)}" style="color:${UI.cobalt};word-break:break-all">${escape(opts.cta.url)}</a></p>
</td></tr>`
    : ''

  // Ponto mostarda do logo do Marcaí (só na marca da plataforma)
  const dot = isPlatform
    ? `<span style="display:inline-block;width:8px;height:8px;margin-left:6px;border-radius:4px;background:${UI.mustard};vertical-align:top"></span>`
    : ''

  const footer = isPlatform
    ? `${escape(env.APP_NAME)} · Sua agenda cheia, sem precisar responder mensagem.`
    : whiteLabel
      ? escape(brand)
      : `Enviado por ${escape(brand)} pelo ${escape(env.APP_NAME)}.`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Barlow:wght@400;600&display=swap" rel="stylesheet">
<style>
  @media (max-width:600px){ .px{padding-left:24px!important;padding-right:24px!important} .title{font-size:30px!important} }
  a{color:${UI.cobalt}}
</style>
</head>
<body style="margin:0;padding:0;background:${UI.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${UI.page}" style="background:${UI.page}">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${UI.card};border:1px solid ${UI.border};border-radius:6px;border-collapse:separate;overflow:hidden">
<tr><td class="px" bgcolor="${band}" style="background:${band};padding:22px 40px;border-radius:6px 6px 0 0">
<span style="font-family:${FONT_LETTERS};font-size:22px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${bandText}">${escape(brand)}</span>${dot}
</td></tr>
${isPlatform ? `<tr><td style="height:4px;line-height:4px;font-size:0;background:${UI.mustard}">&nbsp;</td></tr>` : ''}
<tr><td class="px" style="padding:36px 40px 8px">
<h1 class="title" style="margin:0 0 20px;font-family:${FONT_LETTERS};font-size:34px;line-height:1.05;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${UI.ink}">${escape(opts.title)}</h1>
${paragraphs}
</td></tr>
${cta}
<tr><td class="px" style="padding:32px 40px 0"><div style="border-top:1px solid ${UI.border};height:1px;line-height:1px;font-size:0">&nbsp;</div></td></tr>
<tr><td class="px" style="padding:16px 40px 28px">
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${UI.muted}">E-mail automático, não é preciso responder.<br>${footer}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  const text = `${opts.title}\n\n${opts.body}${opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ''}\n\n—\n${isPlatform || whiteLabel ? brand : `${brand} via ${env.APP_NAME}`}`
  return { html, text }
}
