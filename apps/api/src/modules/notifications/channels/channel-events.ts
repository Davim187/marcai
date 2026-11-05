import { EventEmitter } from 'node:events'

/**
 * Eventos emitidos pelos canais (camada de baixo) e tratados em notifications/owners.ts
 * (camada de cima). Assim os canais não importam a fila nem o registro: sem ciclo de imports.
 */
export const channelEvents = new EventEmitter<{ 'whatsapp.disconnected': [tenantId: string] }>()
