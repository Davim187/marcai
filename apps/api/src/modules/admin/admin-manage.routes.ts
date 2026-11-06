import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { emailSchema, PLANS, passwordSchema } from '@marcai/shared'
import { env, isSuperAdminEmail } from '../../config/env'
import { audit } from '../../lib/audit'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { emailTransport } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'
import { idParam } from '../../lib/route-schemas'
import { requireSuperAdmin } from '../../plugins/auth'
import { hashPassword, requestPasswordReset } from '../auth/auth.service'
import { googleEnabled } from '../auth/google'
import { pushEnabled } from '../notifications/channels/push'
import { publicUrlFor } from '../tenants/tenant.summary'

/**
 * Gestão do sistema pelo administrador: contas, estabelecimentos, financeiro e saúde.
 * Complementa `admin.routes.ts`. Toda ação que altera dados vai para o log de auditoria.
 */
export const adminManageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSuperAdmin)

  // ---------- Usuários ----------

  /** Cria uma conta já com senha (ex.: outro administrador ou uma cliente com dificuldade). */
  app.post(
    '/users',
    {
      schema: {
        tags: ['admin'],
        body: z.object({
          name: z.string().trim().min(2).max(80),
          email: emailSchema,
          password: passwordSchema,
          isSuperAdmin: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const { name, email, password, isSuperAdmin } = request.body
      if (await prisma.user.findUnique({ where: { email } }))
        throw conflict('Já existe uma conta com esse e-mail', 'EMAIL_EM_USO')
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: await hashPassword(password),
          isSuperAdmin,
          // Criada pelo admin: o e-mail foi informado por quem administra o sistema
          emailVerifiedAt: new Date(),
        },
      })
      await audit({
        action: 'admin.user_created',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { email, isSuperAdmin },
        ip: request.ip,
      })
      return reply.status(201).send({ id: user.id })
    },
  )

  app.patch(
    '/users/:id',
    {
      schema: {
        tags: ['admin'],
        params: idParam,
        body: z.object({ name: z.string().trim().min(2).max(80), email: emailSchema }),
      },
    },
    async (request) => {
      const user = await prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user) throw notFound('Usuário não encontrado')
      const { name, email } = request.body
      if (email !== user.email) {
        if (await prisma.user.findUnique({ where: { email } }))
          throw conflict('Já existe uma conta com esse e-mail', 'EMAIL_EM_USO')
        if (isSuperAdminEmail(user.email))
          throw badRequest('Este e-mail está em SUPER_ADMIN_EMAILS: altere a configuração primeiro')
      }
      await prisma.user.update({
        where: { id: user.id },
        // E-mail novo: a posse ainda não foi comprovada
        data: { name, email, ...(email !== user.email ? { emailVerifiedAt: null } : {}) },
      })
      await audit({
        action: 'admin.user_updated',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { from: { name: user.name, email: user.email }, to: { name, email } },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  /** Envia para a própria pessoa o link de criar uma senha nova. O admin nunca vê a senha. */
  app.post(
    '/users/:id/password-reset',
    { schema: { tags: ['admin'], params: idParam } },
    async (request) => {
      const user = await prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user) throw notFound('Usuário não encontrado')
      await requestPasswordReset(user.email)
      await audit({
        action: 'admin.password_reset_sent',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: user.id,
        ip: request.ip,
      })
      return { ok: true, emailTransport: emailTransport() }
    },
  )

  /**
   * Exclui a conta. Se ela for a única dona de um estabelecimento ativo, recusa: exclua (ou
   * transfira) o estabelecimento antes, para não deixar negócio sem dona nem cobrança órfã.
   */
  app.delete('/users/:id', { schema: { tags: ['admin'], params: idParam } }, async (request) => {
    if (request.params.id === request.auth!.user.id)
      throw badRequest('Você não pode excluir a sua própria conta por aqui')
    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      include: {
        memberships: {
          where: { role: 'owner', tenant: { deletedAt: null } },
          include: { tenant: { select: { id: true, name: true } } },
        },
      },
    })
    if (!user) throw notFound('Usuário não encontrado')
    if (isSuperAdminEmail(user.email))
      throw badRequest('Este e-mail está em SUPER_ADMIN_EMAILS: remova da configuração primeiro')
    for (const m of user.memberships) {
      const owners = await prisma.tenantMember.count({
        where: { tenantId: m.tenantId, role: 'owner' },
      })
      if (owners <= 1)
        throw badRequest(
          `Esta conta é a única dona de "${m.tenant.name}". Exclua o estabelecimento antes.`,
          'UNICA_DONA',
        )
    }
    await prisma.user.delete({ where: { id: user.id } })
    await audit({
      action: 'admin.user_deleted',
      actorUserId: request.auth!.user.id,
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email, name: user.name },
      ip: request.ip,
    })
    return { ok: true }
  })

  // ---------- Estabelecimentos ----------

  app.get('/tenants/:id', { schema: { tags: ['admin'], params: idParam } }, async (request) => {
    const t = await prisma.tenant.findUnique({
      where: { id: request.params.id },
      include: {
        subscription: true,
        whatsappConnection: { select: { status: true, phone: true, provider: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        invoices: { orderBy: { dueDate: 'desc' }, take: 12 },
        _count: {
          select: { bookings: true, customers: true, services: true, professionals: true },
        },
      },
    })
    if (!t) throw notFound('Estabelecimento não encontrado')
    const d30 = new Date(Date.now() - 30 * 86_400_000)
    const [bookingsLast30, lastBooking] = await Promise.all([
      prisma.booking.count({ where: { tenantId: t.id, createdAt: { gte: d30 } } }),
      prisma.booking.findFirst({
        where: { tenantId: t.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      businessType: t.businessType,
      city: t.city,
      whatsapp: t.whatsapp,
      instagram: t.instagram,
      timezone: t.timezone,
      createdAt: t.createdAt,
      deletedAt: t.deletedAt,
      onboardingCompleted: t.onboardingCompleted,
      blocked: t.blocked,
      blockedReason: t.blockedReason,
      publicUrl: publicUrlFor(t.slug),
      whatsappConnection: t.whatsappConnection,
      members: t.members.map((m) => ({
        user: m.user,
        role: m.role,
        pending: !m.acceptedAt,
      })),
      subscription: t.subscription && {
        plan: t.subscription.plan,
        status: t.subscription.status,
        trialEndsAt: t.subscription.trialEndsAt,
        currentPeriodEnd: t.subscription.currentPeriodEnd,
        billingType: t.subscription.billingType,
        canceledAt: t.subscription.canceledAt,
      },
      invoices: t.invoices.map((i) => ({
        id: i.id,
        amountCents: i.amountCents,
        status: i.status,
        dueDate: i.dueDate,
        paidAt: i.paidAt,
        paymentMethod: i.paymentMethod,
      })),
      counts: { ...t._count, bookingsLast30 },
      lastBookingAt: lastBooking?.createdAt ?? null,
    }
  })

  /**
   * Ajuste manual da assinatura (cortesia, acerto de pagamento feito por fora, correção).
   * Não mexe no Mercado Pago: só no que o sistema libera para o estabelecimento.
   */
  app.post(
    '/tenants/:id/subscription',
    {
      schema: {
        tags: ['admin'],
        params: idParam,
        body: z.object({
          plan: z.enum(['essencial', 'pro']),
          status: z.enum(['trial', 'active', 'past_due', 'canceled']),
          /** Até quando vale (fim do teste ou do período pago) */
          until: z.string().date().optional(),
        }),
      },
    },
    async (request) => {
      const sub = await prisma.subscription.findUnique({ where: { tenantId: request.params.id } })
      if (!sub) throw notFound('Assinatura não encontrada')
      const { plan, status, until } = request.body
      const untilDate = until ? new Date(`${until}T23:59:59.000Z`) : undefined
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan,
          status,
          ...(status === 'trial' && untilDate ? { trialEndsAt: untilDate } : {}),
          ...(status === 'active' && untilDate ? { currentPeriodEnd: untilDate } : {}),
          canceledAt: status === 'canceled' ? (sub.canceledAt ?? new Date()) : null,
        },
      })
      await audit({
        action: 'admin.subscription_changed',
        tenantId: request.params.id,
        actorUserId: request.auth!.user.id,
        metadata: {
          from: { plan: sub.plan, status: sub.status },
          to: { plan, status, until: until ?? null },
        },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  /**
   * Exclusão reversível: o estabelecimento some do sistema e da página pública, mas os dados
   * ficam guardados (dá para restaurar). Recusa se ainda houver cobrança ativa no cartão.
   */
  app.post(
    '/tenants/:id/delete',
    {
      schema: { tags: ['admin'], params: idParam, body: z.object({ deleted: z.boolean() }) },
    },
    async (request) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: request.params.id },
        include: { subscription: true },
      })
      if (!tenant) throw notFound('Estabelecimento não encontrado')
      const { deleted } = request.body
      const sub = tenant.subscription
      if (
        deleted &&
        sub?.providerSubscriptionId &&
        sub.billingType === 'CREDIT_CARD' &&
        sub.status !== 'canceled'
      )
        throw badRequest(
          'Este estabelecimento ainda tem cobrança ativa no cartão. Cancele a assinatura antes.',
          'COBRANCA_ATIVA',
        )
      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenant.id },
          data: { deletedAt: deleted ? (tenant.deletedAt ?? new Date()) : null },
        }),
        // Quem estava dentro dele sai da sessão do estabelecimento
        ...(deleted
          ? [
              prisma.session.updateMany({
                where: { tenantId: tenant.id },
                data: { tenantId: null },
              }),
            ]
          : []),
      ])
      await audit({
        action: deleted ? 'admin.tenant_deleted' : 'admin.tenant_restored',
        tenantId: tenant.id,
        actorUserId: request.auth!.user.id,
        metadata: { name: tenant.name },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  // ---------- Financeiro ----------

  app.get(
    '/finance',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({
          status: z.enum(['pending', 'paid', 'overdue', 'refunded', 'canceled']).optional(),
        }),
      },
    },
    async (request) => {
      const now = new Date()
      const d30 = new Date(now.getTime() - 30 * 86_400_000)
      const [subs, paid30, open, invoices] = await Promise.all([
        prisma.subscription.findMany({
          where: { tenant: { deletedAt: null } },
          select: { plan: true, status: true, trialEndsAt: true },
        }),
        prisma.invoice.aggregate({
          where: { status: 'paid', paidAt: { gte: d30 } },
          _sum: { amountCents: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: { status: { in: ['pending', 'overdue'] } },
          _sum: { amountCents: true },
          _count: true,
        }),
        prisma.invoice.findMany({
          where: request.query.status ? { status: request.query.status } : {},
          include: { tenant: { select: { id: true, name: true, slug: true } } },
          orderBy: { dueDate: 'desc' },
          take: 100,
        }),
      ])
      const active = subs.filter((s) => s.status === 'active')
      const in7days = new Date(now.getTime() + 7 * 86_400_000)
      return {
        mrrCents: active.reduce((sum, s) => sum + PLANS[s.plan].priceCents, 0),
        activeByPlan: {
          essencial: active.filter((s) => s.plan === 'essencial').length,
          pro: active.filter((s) => s.plan === 'pro').length,
        },
        pastDue: subs.filter((s) => s.status === 'past_due').length,
        trialsEndingIn7Days: subs.filter(
          (s) => s.status === 'trial' && s.trialEndsAt && s.trialEndsAt <= in7days,
        ).length,
        paidLast30: { cents: paid30._sum.amountCents ?? 0, count: paid30._count },
        open: { cents: open._sum.amountCents ?? 0, count: open._count },
        invoices: invoices.map((i) => ({
          id: i.id,
          tenant: i.tenant,
          amountCents: i.amountCents,
          status: i.status,
          dueDate: i.dueDate,
          paidAt: i.paidAt,
          paymentMethod: i.paymentMethod ?? i.billingType,
        })),
      }
    },
  )

  // ---------- Sistema ----------

  app.get('/system', { schema: { tags: ['admin'] } }, async () => {
    const [jobsByStatus, failedJobs, counts] = await Promise.all([
      prisma.notificationJob.groupBy({ by: ['status'], _count: true }),
      prisma.notificationJob.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          channel: true,
          kind: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          tenantId: true,
        },
      }),
      Promise.all([
        prisma.user.count(),
        prisma.tenant.count({ where: { deletedAt: null } }),
        prisma.tenant.count({ where: { deletedAt: { not: null } } }),
        prisma.booking.count(),
        prisma.customer.count(),
        prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      ]),
    ])
    const [users, tenants, deletedTenants, bookings, customers, sessions] = counts
    return {
      appMode: env.APP_MODE,
      environment: env.NODE_ENV,
      integrations: {
        email: emailTransport(),
        whatsapp: env.WHATSAPP_PROVIDER,
        billing: env.BILLING_PROVIDER,
        google: googleEnabled(),
        push: pushEnabled(),
      },
      superAdminEmails: env.SUPER_ADMIN_EMAILS,
      queue: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count])),
      failedJobs,
      counts: { users, tenants, deletedTenants, bookings, customers, sessions },
    }
  })

  /** Recoloca na fila um envio que falhou (ex.: depois de corrigir o SMTP ou o WhatsApp). */
  app.post('/jobs/:id/retry', { schema: { tags: ['admin'], params: idParam } }, async (request) => {
    const { count } = await prisma.notificationJob.updateMany({
      where: { id: request.params.id, status: 'failed' },
      data: { status: 'pending', attempts: 0, runAt: new Date(), lockedAt: null },
    })
    if (!count) throw notFound('Envio não encontrado ou já reprocessado')
    return { ok: true }
  })

  /** Encerra todas as sessões vencidas e limpa a fila de envios já concluídos há mais de 30 dias. */
  app.post('/maintenance/cleanup', { schema: { tags: ['admin'] } }, async (request) => {
    const d30 = new Date(Date.now() - 30 * 86_400_000)
    const [sessions, jobs] = await Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      prisma.notificationJob.deleteMany({
        where: { status: { in: ['done', 'canceled'] }, createdAt: { lt: d30 } },
      }),
    ])
    await audit({
      action: 'admin.maintenance_cleanup',
      actorUserId: request.auth!.user.id,
      metadata: { sessions: sessions.count, jobs: jobs.count },
      ip: request.ip,
    })
    return { sessions: sessions.count, jobs: jobs.count }
  })
}
