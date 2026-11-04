import { EmailChannel } from './email'
import { InAppChannel } from './inapp'
import { WebPushChannel } from './push'
import type { ChannelName, NotificationChannel } from './types'
import { WhatsAppChannel } from './whatsapp'

export const channels: Record<ChannelName, NotificationChannel> = {
  inapp: new InAppChannel(),
  push: new WebPushChannel(),
  whatsapp: new WhatsAppChannel(),
  email: new EmailChannel(),
}
