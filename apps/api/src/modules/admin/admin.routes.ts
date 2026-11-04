import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { blockTenantSchema, extendTrialSchema, PLANS } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { requireSuperAdmin, setSessionCookies } from '../../plugins/auth'
import { createSession } from '../auth/auth.service'
import { publicUrlFor } from '../tenants/tenant.summary'

const idParam = z.object({ id: z.string() })

/** Painel do dono do SaaS. Toda ação sensível vai para o log de auditoria. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSuperAdmin)

  app.get('/overview', { schema: { tags: ['admin'] } }, async () => {
    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 86_400_000)
    const [subs, tenants, signups, canceledLast30, bookings30] = await Promise.all([
      prisma.subscription.findMany({ select: { plan: true, status: true } }),
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true } }),
      prisma.subscription.count({ where: { status: 'canceled', canceledAt: { gte: d30 } } }),
      prisma.booking.count({ where: { createdAt: { gte: d30 } } }),
    ])
    const active = subs.filter((s) => s.status === 'active')
    const mrrCents = active.reduce((sum, s) => sum + PLANS[s.plan].priceCents, 0)
    const byStatus = Object.fromEntries(
      ['trial', 'active', 'past_due', 'canceled'].map((st) => [
        st,
        subs.filter((s) => s.status === st).length,
      ]),
    )
    const byDay = new Map<string, number>()
    for (let i = 29; i >= 0; i--)
      byDay.set(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), 0)
    for (const t of signups) {
      const d = t.createdAt.toISOString().slice(0, 10)
      if (byDay.has(d)) byDay.set(d, byDay.get(d)! + 1)
    }
    const base = active.length + canceledLast30
    return {
      tenants,
      mrrCents,
      byStatus,
      byPlan: {
        essencial: active.filter((s) => s.plan === 'essencial').length,
        pro: active.filter((s) => s.plan === 'pro').length,
      },
      churnRate: base ? canceledLast30 / base : 0,
      signupsByDay: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      bookingsLast30: bookings30,
    }
  })

  app.get(
    '/tenants',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({ q: z.string().max(80).optional(), status: z.string().optional() }),
      },
    },
    async (request) => {
      const { q, status } = request.query
      const tenants = await prisma.tenant.findMany({
        where: {
          deletedAt: null,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { slug: { contains: q.toLowerCase() } },
                  { members: { some: { user: { email: { contains: q.toLowerCase() } } } } },
                ],
              }
            : {}),
          ...(status ? { subscription: { status: status as never } } : {}),
        },
        include: {
          subscription: true,
          members: {
            where: { role: 'owner' },
            include: { user: { select: { name: true, email: true } } },
            take: 1,
          },
          _count: { select: { bookings: true, customers: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        businessType: t.businessType,
        createdAt: t.createdAt,
        blocked: t.blocked,
        blockedReason: t.blockedReason,
        publicUrl: publicUrlFor(t.slug),
        owner: t.members[0]?.user ?? null,
        subscription: t.subscription && {
          plan: t.subscription.plan,
          status: t.subscription.status,
          trialEndsAt: t.subscription.trialEndsAt,
          currentPeriodEnd: t.subscription.currentPeriodEnd,
        },
        counts: t._count,
      }))
    },
  )

  app.post(
    '/tenants/:id/extend-trial',
    { schema: { tags: ['admin'], params: idParam, body: extendTrialSchema } },
    async (request) => {
      const sub = await prisma.subscription.findUnique({ where: { tenantId: request.params.id } })
      if (!sub) throw notFound('Assinatura não encontrada')
      const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date()
      const trialEndsAt = new Date(base.getTime() + request.body.days * 86_400_000)
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEndsAt, ...(sub.status !== 'active' ? { status: 'trial' } : {}) },
      })
      await audit({
        action: 'admin.trial_extended',
        tenantId: request.params.id,
        actorUserId: request.auth!.user.id,
        metadata: { days: request.body.days },
        ip: request.ip,
      })
      return { trialEndsAt }
    },
  )

  app.post(
    '/tenants/:id/block',
    { schema: { tags: ['admin'], params: idParam, body: blockTenantSchema } },
    async (request) => {
      await prisma.tenant.update({
        where: { id: request.params.id },
        data: { blocked: request.body.blocked, blockedReason: request.body.reason ?? null },
      })
      await audit({
        action: request.body.blocked ? 'admin.tenant_blocked' : 'admin.tenant_unblocked',
        tenantId: request.params.id,
        actorUserId: request.auth!.user.id,
        metadata: { reason: request.body.reason ?? null },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  /** "Entrar como": cria uma sessão de suporte (1 dia) marcada com o super admin, com auditoria. */
  app.post(
    '/tenants/:id/impersonate',
    { schema: { tags: ['admin'], params: idParam } },
    async (request, reply) => {
      const owner = await prisma.tenantMember.findFirst({
        where: { tenantId: request.params.id, role: 'owner' },
      })
      const tenant = await prisma.tenant.findUnique({ where: { id: request.params.id } })
      if (!tenant) throw notFound('Estabelecimento não encontrado')
      const userId = owner?.userId ?? request.auth!.user.id
      const { token, csrfToken } = await createSession(userId, {
        tenantId: tenant.id,
        impersonatorId: request.auth!.user.id,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      })
      await audit({
        action: 'admin.impersonated',
        tenantId: tenant.id,
        actorUserId: userId,
        impersonatorId: request.auth!.user.id,
        ip: request.ip,
      })
      setSessionCookies(reply, token, csrfToken)
      return { ok: true }
    },
  )

  app.get(
    '/audit',
    { schema: { tags: ['admin'], querystring: z.object({ tenantId: z.string().optional() }) } },
    async (request) =>
      prisma.auditLog.findMany({
        where: request.query.tenantId ? { tenantId: request.query.tenantId } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
  )
}
