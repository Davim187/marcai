import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

/**
 * Guarda o corpo bruto (Buffer) em `request.rawBody` antes de fazer o parse do JSON.
 * Necessário para validar assinaturas HMAC de webhooks. Registre dentro do escopo
 * (plugin) das rotas de webhook, nunca globalmente.
 */
export function registerRawJsonBody(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const buffer = body as Buffer
    request.rawBody = buffer
    try {
      done(null, buffer.length ? JSON.parse(buffer.toString('utf8')) : {})
    } catch (err) {
      ;(err as Error & { statusCode?: number }).statusCode = 400
      done(err as Error, undefined)
    }
  })
}
