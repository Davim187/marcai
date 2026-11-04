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
function client() {
  if (!env.RESEND_API_KEY) return null
  resend ??= new Resend(env.RESEND_API_KEY)
  return resend
}

/** Envia e-mail pelo Resend. Sem chave configurada, apenas registra no log (modo dev). */
export async function sendEmail(msg: EmailMessage): Promise<{ id: string | null }> {
  const c = client()
  const from = msg.fromName
    ? `${msg.fromName} <${env.EMAIL_FROM.match(/<(.+)>/)?.[1] ?? env.EMAIL_FROM}>`
    : env.EMAIL_FROM
  if (!c) {
    logger.info({ to: msg.to, subject: msg.subject, text: msg.text }, '📧 [e-mail simulado]')
    return { id: null }
  }
  const { data, error } = await c.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  })
  if (error) throw new Error(`Falha ao enviar e-mail: ${error.message}`)
  return { id: data?.id ?? null }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Layout simples e responsivo para e-mails transacionais. */
export function emailLayout(opts: {
  title: string
  body: string
  cta?: { label: string; url: string }
  brandName?: string
  color?: string
}): { html: string; text: string } {
  const color = opts.color ?? '#4F46E5'
  const brand = opts.brandName ?? env.APP_NAME
  const paragraphs = opts.body
    .split('\n')
    .map((l) => (l.trim() ? `<p style="margin:0 0 12px">${escape(l)}</p>` : ''))
    .join('')
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f8fafc;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:700;color:${color};padding-bottom:16px">${escape(brand)}</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${escape(opts.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${paragraphs}</td></tr>
${opts.cta ? `<tr><td style="padding-top:16px"><a href="${escape(opts.cta.url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escape(opts.cta.label)}</a></td></tr>` : ''}
</table>
<p style="font-size:12px;color:#64748b;margin-top:16px">Você recebeu este e-mail por causa da sua conta em ${escape(brand)}.</p>
</td></tr></table></body></html>`
  const text = `${opts.title}\n\n${opts.body}${opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ''}`
  return { html, text }
}
