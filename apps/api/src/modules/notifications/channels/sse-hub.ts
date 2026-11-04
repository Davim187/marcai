import { EventEmitter } from 'node:events'

/**
 * Hub de eventos em memória para o SSE do painel. Em várias instâncias, cada uma só
 * avisa as conexões dela; o painel também faz polling a cada 15s como garantia.
 */
class SseHub extends EventEmitter {
  publish(tenantId: string, payload: unknown) {
    this.emit(`tenant:${tenantId}`, payload)
  }
}
export const sseHub = new SseHub()
sseHub.setMaxListeners(0)
