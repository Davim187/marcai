import type { FastifyInstance } from 'fastify'
import { authRoutes } from './auth/auth.routes'
import { tenantRoutes } from './tenants/tenant.routes'

export async function registerModules(app: FastifyInstance) {
  app.get('/api/health', { schema: { hide: true } }, async () => ({
    ok: true,
    at: new Date().toISOString(),
  }))
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(tenantRoutes, { prefix: '/api/tenant' })
}
