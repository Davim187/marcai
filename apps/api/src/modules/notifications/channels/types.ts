import { z } from 'zod'

/** Mensagem que sai por um canal. Cada canal usa os campos que fazem sentido para ele. */
export interface OutboundMessage {
  tenantId: string
  /** Destino: telefone (WhatsApp), e-mail, userId (push) */
  to?: string
  title: string
  body: string
  url?: string
  /** Remetente exibido no e-mail (nome do estabelecimento) */
  fromName?: string
  color?: string
  /** Só para o aviso no painel */
  type?: string
  bookingId?: string
  userId?: string | null
}

/** Validação do que sai da fila (o JSON gravado no banco nunca é usado sem conferir). */
export const outboundMessageSchema = z
  .object({
    tenantId: z.string(),
    to: z.string().optional(),
    title: z.string(),
    body: z.string(),
    url: z.string().optional(),
    fromName: z.string().optional(),
    color: z.string().optional(),
    type: z.string().optional(),
    bookingId: z.string().optional(),
    userId: z.string().nullish(),
    /** Lembrete: horário do agendamento quando foi agendado (detecta remarcação) */
    startsAt: z.string().optional(),
  })
  .passthrough()

export type ChannelName = 'inapp' | 'push' | 'whatsapp' | 'email'

export interface NotificationChannel {
  readonly name: ChannelName
  send(message: OutboundMessage): Promise<void>
}

/** Erro definitivo: não adianta tentar de novo (ex.: número inválido, inscrição expirada). */
export class PermanentChannelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentChannelError'
  }
}
