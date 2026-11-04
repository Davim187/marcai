export type WhatsAppStatus = 'disconnected' | 'connecting' | 'connected'

export interface WhatsAppConnectResult {
  status: WhatsAppStatus
  /** QR Code em data URL (image/png) para a profissional ler no celular */
  qrCode?: string
  phone?: string | null
}

/**
 * Provedor de WhatsApp. Trocável por variável de ambiente (WHATSAPP_PROVIDER).
 * - perTenantNumber = true: cada estabelecimento conecta o próprio número (Evolution, QR Code).
 * - perTenantNumber = false: mensagens saem do número oficial da plataforma (Meta Cloud API).
 */
export interface WhatsAppProvider {
  readonly name: 'evolution' | 'meta' | 'console'
  readonly perTenantNumber: boolean
  sendText(opts: { tenantId: string; to: string; text: string }): Promise<{ id?: string }>
  connect(tenantId: string): Promise<WhatsAppConnectResult>
  status(tenantId: string): Promise<WhatsAppConnectResult>
  disconnect(tenantId: string): Promise<void>
}
