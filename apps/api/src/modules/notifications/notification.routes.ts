import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  DEFAULT_TEMPLATES,
  MESSAGE_TEMPLATE_KEYS,
  messageTemplateSchema,
  normalizeBrazilianMobile,
  notificationSettingsSchema,
  pushSubscriptionSchema,
  renderTemplate,
  SAMPLE_TEMPLATE_VARS,
  TEMPLATE_META,
} from '@marcai/shared'
import { env } from '../../config/env'
import { badRequest, conflict } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import {
  ctx,
  requireFeature,
  requireOwner,
  requireTenant,
  type TenantContext,
} from '../../plugins/auth'
import { pushEnabled } from './channels/push'
import { channels } from './channels/registry'
import { sseHub } from './channels/sse-hub'
import { whatsappProvider } from './channels/whatsapp'

/** Profissional (não dona) vê só os avisos dos próprios agendamentos. */
async function notificationScope(c: TenantContext): Promise<Prisma.NotificationWhereInput> {
  if (c.role === 'owner' || !c.professionalId) return {}
  return {
    OR: [
      { bookingId: null },
      {
        bookingId: {
          in: (
            await c.db.booking.findMany({
              where: { professionalId: c.professionalId },
              select: { id: true },
            })
          ).map((b) => b.id),
        },
      },
    ],
  }
}

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      onRequest: requireTenant,
      schema: { tags: ['notificações'], summary: 'Últimos avisos e contagem de não lidos' },
    },
    async (request) => {
      const c = ctx(request)
      const scope = await notificationScope(c)
      const [items, unread] = await Promise.all([
        c.db.notification.findMany({ where: scope, orderBy: { createdAt: 'desc' }, take: 30 }),
        c.db.notification.count({ where: { ...scope, readAt: null } }),
      ])
      return { items, unread }
    },
  )

  app.post(
    '/read-all',
    { onRequest: requireTenant, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      await c.db.notification.updateMany({
        where: { ...(await notificationScope(c)), readAt: null },
        data: { readAt: new Date() },
      })
      return { ok: true }
    },
  )

  app.post(
    '/read/:id',
    {
      onRequest: requireTenant,
      schema: { tags: ['notificações'], params: z.object({ id: z.string() }) },
    },
    async (request) => {
      await ctx(request).db.notification.updateMany({
        where: { id: request.params.id },
        data: { readAt: new Date() },
      })
      return { ok: true }
    },
  )

  /** Tempo real via Server-Sent Events. O painel cai para polling de 15s se a conexão falhar. */
  app.get(
    '/stream',
    {
      onRequest: requireTenant,
      schema: { tags: ['notificações'], summary: 'SSE de avisos em tempo real' },
    },
    (request, reply) => {
      const c = ctx(request)
      const { tenantId } = c
      reply.hijack()
      const res = reply.raw
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      res.write(`retry: 5000\n\n`)
      const write = (payload: unknown) =>
        res.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`)
      // Mesmo escopo da listagem: profissional só recebe avisos dos próprios agendamentos
      const send = (payload: unknown) => {
        if (c.role === 'owner') return write(payload)
        const bookingId = (payload as { notification?: { bookingId?: string | null } }).notification
          ?.bookingId
        if (!bookingId) return write(payload)
        c.db.booking
          .findFirst({
            where: { id: bookingId, professionalId: c.professionalId ?? '__sem_agenda__' },
            select: { id: true },
          })
          .then((own) => own && write(payload))
          .catch(() => undefined)
      }
      const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000)
      sseHub.on(`tenant:${tenantId}`, send)
      request.raw.on('close', () => {
        clearInterval(heartbeat)
        sseHub.off(`tenant:${tenantId}`, send)
      })
    },
  )

  // ---------- Preferências ----------
  app.get(
    '/settings',
    { onRequest: requireTenant, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      const t = c.tenant
      const wa = await c.db.whatsAppConnection.findFirst({})
      const provider = whatsappProvider()
      return {
        inApp: t.notifyInApp,
        push: t.notifyPush,
        email: t.notifyEmail,
        whatsappProfessional: t.notifyWhatsappProfessional,
        whatsappCustomer: t.notifyWhatsappCustomer,
        sound: t.notifySound,
        notifyPhone: t.notifyPhone,
        reminderHours: t.reminderHours,
        features: { whatsapp: c.can('whatsapp_professional') },
        pushConfig: { enabled: pushEnabled(), publicKey: env.VAPID_PUBLIC_KEY ?? null },
        whatsapp: {
          provider: provider.name,
          perTenantNumber: provider.perTenantNumber,
          status:
            provider.name === 'console'
              ? 'connected'
              : provider.perTenantNumber
                ? (wa?.status ?? 'disconnected')
                : (await provider.status(c.tenantId)).status,
          phone: wa?.phone ?? null,
        },
      }
    },
  )

  app.put(
    '/settings',
    {
      onRequest: requireOwner,
      schema: { tags: ['notificações'], body: notificationSettingsSchema },
    },
    async (request) => {
      const c = ctx(request)
      const b = request.body
      await prisma.tenant.update({
        where: { id: c.tenantId },
        data: {
          notifyInApp: b.inApp,
          notifyPush: b.push,
          notifyEmail: b.email,
          notifyWhatsappProfessional: b.whatsappProfessional,
          notifyWhatsappCustomer: b.whatsappCustomer,
          notifySound: b.sound,
          notifyPhone: b.notifyPhone ? normalizeBrazilianMobile(b.notifyPhone) : null,
        },
      })
      return { ok: true }
    },
  )

  // ---------- Textos das mensagens ----------
  app.get(
    '/templates',
    { onRequest: requireTenant, schema: { tags: ['notificações'] } },
    async (request) => {
      const custom = await ctx(request).db.messageTemplate.findMany({})
      return MESSAGE_TEMPLATE_KEYS.map((key) => ({
        ...TEMPLATE_META[key],
        body: custom.find((t) => t.key === key)?.body ?? DEFAULT_TEMPLATES[key],
        isDefault: !custom.some((t) => t.key === key),
        defaultBody: DEFAULT_TEMPLATES[key],
      }))
    },
  )

  app.put(
    '/templates',
    { onRequest: requireOwner, schema: { tags: ['notificações'], body: messageTemplateSchema } },
    async (request) => {
      const c = ctx(request)
      // Variável que não existe iria literal para o cliente ("Oi {nome_da_cliente}")
      const allowed = new Set(TEMPLATE_META[request.body.key].variables)
      const unknown = [...request.body.body.matchAll(/\{([a-z_]+)\}/g)]
        .map((m) => m[1]!)
        .filter((v) => !allowed.has(v))
      if (unknown.length) {
        throw badRequest(
          `Variável desconhecida: ${[...new Set(unknown)].map((v) => `{${v}}`).join(', ')}. Use só as variáveis da lista.`,
          'VARIAVEL_DESCONHECIDA',
        )
      }
      await c.db.messageTemplate.upsert({
        where: { tenantId_key: { tenantId: c.tenantId, key: request.body.key } },
        create: { tenantId: c.tenantId, key: request.body.key, body: request.body.body },
        update: { body: request.body.body },
      })
      return { ok: true }
    },
  )

  app.delete(
    '/templates/:key',
    {
      onRequest: requireOwner,
      schema: { tags: ['notificações'], params: z.object({ key: z.enum(MESSAGE_TEMPLATE_KEYS) }) },
    },
    async (request) => {
      await ctx(request).db.messageTemplate.deleteMany({ where: { key: request.params.key } })
      return { ok: true }
    },
  )

  app.post(
    '/templates/preview',
    {
      onRequest: requireTenant,
      schema: { tags: ['notificações'], body: z.object({ body: z.string().max(2000) }) },
    },
    async (request) => {
      const c = ctx(request)
      return {
        text: renderTemplate(request.body.body, {
          ...SAMPLE_TEMPLATE_VARS,
          negocio: c.tenant.name,
        }),
      }
    },
  )

  // ---------- Web Push ----------
  app.post(
    '/push/subscribe',
    { onRequest: requireTenant, schema: { tags: ['notificações'], body: pushSubscriptionSchema } },
    async (request) => {
      const c = ctx(request)
      const { endpoint, keys } = request.body
      // Uma inscrição já ligada a outra pessoa só é transferida por quem tem as mesmas chaves
      // do navegador (ou seja, está de fato naquele aparelho).
      const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } })
      if (
        existing &&
        existing.userId !== request.auth!.user.id &&
        (existing.p256dh !== keys.p256dh || existing.auth !== keys.auth)
      ) {
        throw conflict('Esse aparelho já está inscrito por outra conta')
      }
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: {
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          tenantId: c.tenantId,
          userId: request.auth!.user.id,
          userAgent: request.headers['user-agent']?.slice(0, 300),
        },
        update: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          tenantId: c.tenantId,
          userId: request.auth!.user.id,
        },
      })
      return { ok: true }
    },
  )

  app.post(
    '/push/unsubscribe',
    {
      onRequest: requireTenant,
      schema: { tags: ['notificações'], body: z.object({ endpoint: z.string().max(1000) }) },
    },
    async (request) => {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: request.body.endpoint, userId: request.auth!.user.id },
      })
      return { ok: true }
    },
  )

  app.post(
    '/push/test',
    { onRequest: requireTenant, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      await channels.push.send({
        tenantId: c.tenantId,
        to: request.auth!.user.id,
        title: 'Tudo certo! 🎉',
        body: 'As notificações estão funcionando neste aparelho.',
        url: '/painel',
      })
      return { ok: true }
    },
  )

  // ---------- WhatsApp (plano Pro) ----------
  const proOnly = [requireOwner, requireFeature('whatsapp_professional')]

  app.post(
    '/whatsapp/connect',
    {
      onRequest: proOnly,
      schema: { tags: ['notificações'], summary: 'Gera o QR Code para conectar o WhatsApp' },
    },
    async (request) => {
      const c = ctx(request)
      const p = whatsappProvider()
      const r = await p.connect(c.tenantId)
      await prisma.whatsAppConnection.upsert({
        where: { tenantId: c.tenantId },
        create: {
          tenantId: c.tenantId,
          provider: p.name,
          instanceName: `marcai-${c.tenantId}`,
          status: r.status,
          connectedAt: r.status === 'connected' ? new Date() : null,
        },
        update: { provider: p.name, status: r.status },
      })
      return r
    },
  )

  app.get(
    '/whatsapp/status',
    { onRequest: proOnly, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      const p = whatsappProvider()
      const r = await p.status(c.tenantId)
      // No provedor de desenvolvimento, simula a leitura do QR Code depois do primeiro "connect".
      const existing = await prisma.whatsAppConnection.findUnique({
        where: { tenantId: c.tenantId },
      })
      if (existing && existing.status !== r.status) {
        await prisma.whatsAppConnection.update({
          where: { tenantId: c.tenantId },
          data: {
            status: r.status,
            connectedAt: r.status === 'connected' ? new Date() : existing.connectedAt,
          },
        })
      }
      return r
    },
  )

  app.post(
    '/whatsapp/disconnect',
    { onRequest: proOnly, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      await whatsappProvider().disconnect(c.tenantId)
      await prisma.whatsAppConnection.updateMany({
        where: { tenantId: c.tenantId },
        data: { status: 'disconnected' },
      })
      return { ok: true }
    },
  )

  app.post(
    '/whatsapp/test',
    { onRequest: proOnly, schema: { tags: ['notificações'] } },
    async (request) => {
      const c = ctx(request)
      if (!c.tenant.notifyPhone) throw badRequest('Cadastre o número que vai receber os avisos')
      await channels.whatsapp.send({
        tenantId: c.tenantId,
        to: c.tenant.notifyPhone,
        title: 'Teste',
        body: `✅ Teste do ${env.APP_MODE === 'single_tenant' ? c.tenant.name : env.APP_NAME}: seus avisos de agendamento vão chegar aqui!`,
      })
      return { ok: true }
    },
  )
}
