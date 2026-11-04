import type { FastifyInstance } from 'fastify'
import { authRoutes } from './auth/auth.routes'
import { bookingPanelRoutes } from './booking/panel.routes'
import { publicRoutes } from './booking/public.routes'
import { customerRoutes } from './customers/customer.routes'
import { dashboardRoutes } from './dashboard/dashboard.routes'
import { notificationRoutes } from './notifications/notification.routes'
import { whatsappWebhookRoutes } from './notifications/webhooks.routes'
import { formRoutes } from './forms/form.routes'
import { scheduleRoutes } from './schedule/schedule.routes'
import { serviceRoutes } from './services/service.routes'
import { teamRoutes } from './team/team.routes'
import { tenantRoutes } from './tenants/tenant.routes'
import { registerUploadStatic, uploadRoutes } from './uploads/upload.routes'

export async function registerModules(app: FastifyInstance) {
  app.get('/api/health', { schema: { hide: true } }, async () => ({
    ok: true,
    at: new Date().toISOString(),
  }))
  await registerUploadStatic(app)
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(tenantRoutes, { prefix: '/api/tenant' })
  await app.register(serviceRoutes, { prefix: '/api/services' })
  await app.register(teamRoutes, { prefix: '/api/team' })
  await app.register(scheduleRoutes, { prefix: '/api/schedule' })
  await app.register(formRoutes, { prefix: '/api/forms' })
  await app.register(uploadRoutes, { prefix: '/api/uploads' })
  await app.register(publicRoutes, { prefix: '/api/public' })
  await app.register(bookingPanelRoutes, { prefix: '/api/bookings' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(notificationRoutes, { prefix: '/api/notifications' })
  await app.register(whatsappWebhookRoutes, { prefix: '/api/webhooks' })
}
