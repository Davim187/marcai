import { emailLayout, sendEmail } from '../../../lib/mailer'
import { PermanentChannelError, type NotificationChannel, type OutboundMessage } from './types'

export class EmailChannel implements NotificationChannel {
  readonly name = 'email' as const
  async send(msg: OutboundMessage) {
    if (!msg.to || !msg.to.includes('@'))
      throw new PermanentChannelError('E-mail de destino inválido')
    const { html, text } = emailLayout({
      title: msg.title,
      body: msg.body,
      cta: msg.url ? { label: 'Ver detalhes', url: msg.url } : undefined,
      brandName: msg.fromName,
      color: msg.color,
    })
    await sendEmail({ to: msg.to, subject: msg.title, html, text, fromName: msg.fromName })
  }
}
