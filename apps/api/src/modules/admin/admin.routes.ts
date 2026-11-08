import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { blockTenantSchema, extendTrialSchema, PLANS } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { notifyOwners } from '../notifications/owners'
import { badRequest, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { env, isSuperAdminEmail } from '../../config/env'
import { requireSuperAdmin, setSessionCookies } from '../../plugins/auth'
import { createSession } from '../auth/auth.service'
import { publicUrlFor } from '../tenants/tenant.summary'
import { idParam } from '../../lib/route-schemas'

/** Considera "online" quem usou o sistema nos últimos 15 minutos. */
const ONLINE_MS = 15 * 60_000

/** Sessão válida da própria pessoa (as de suporte, "entrar como", não contam). */
const liveSessionWhere = (now: Date) => ({ expiresAt: { gt: now }, impersonatorId: null })
const onlineSessionWhere = (now: Date) => ({
  ...liveSessionWhere(now),
  lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) },
})

/** Painel do dono do SaaS. Toda ação sensível vai para o log de auditoria. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireSuperAdmin)

  app.get('/overview', { schema: { tags: ['admin'] } }, async () => {
    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 86_400_000)
    const [
      subs,
      tenants,
      signups,
      canceledLast30,
      bookings30,
      users,
      online,
      recentTenants,
      onlineUsers,
    ] = await Promise.all([
      prisma.subscription.findMany({ select: { plan: true, status: true } }),
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true } }),
      prisma.subscription.count({ where: { status: 'canceled', canceledAt: { gte: d30 } } }),
      prisma.booking.count({ where: { createdAt: { gte: d30 } } }),
      prisma.user.count(),
      prisma.user.count({ where: { sessions: { some: onlineSessionWhere(now) } } }),
      prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          subscription: { select: { plan: true, status: true } },
        },
      }),
      prisma.user.findMany({
        where: { sessions: { some: onlineSessionWhere(now) } },
        select: { id: true, name: true, email: true, avatarUrl: true },
        take: 8,
      }),
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
      users,
      online,
      mrrCents,
      byStatus,
      byPlan: {
        essencial: active.filter((s) => s.plan === 'essencial').length,
        pro: active.filter((s) => s.plan === 'pro').length,
      },
      churnRate: base ? canceledLast30 / base : 0,
      signupsByDay: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      bookingsLast30: bookings30,
      recentTenants,
      onlineUsers,
    }
  })

  app.get(
    '/tenants',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({
          q: z.string().max(80).optional(),
          status: z.enum(['trial', 'active', 'past_due', 'canceled']).optional(),
          /** Mostrar os excluídos (lixeira) em vez dos ativos */
          deleted: z.enum(['true', 'false']).optional(),
        }),
      },
    },
    async (request) => {
      const { q, status, deleted } = request.query
      const tenants = await prisma.tenant.findMany({
        where: {
          deletedAt: deleted === 'true' ? { not: null } : null,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { slug: { contains: q.toLowerCase() } },
                  { members: { some: { user: { email: { contains: q.toLowerCase() } } } } },
                ],
              }
            : {}),
          ...(status ? { subscription: { status } } : {}),
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
        deletedAt: t.deletedAt,
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
      // A dona sempre fica sabendo do acesso de suporte (LGPD/transparência)
      await notifyOwners({
        tenantId: tenant.id,
        kind: 'support_access',
        title: 'Acesso de suporte à sua conta',
        body: `A equipe de suporte acessou o painel de ${tenant.name} em ${new Date().toLocaleString('pt-BR', { timeZone: tenant.timezone })} para ajudar você. Se não pediu ajuda, troque sua senha e fale com o suporte.`,
        path: '/painel',
        inApp: false,
      })
      setSessionCookies(reply, token, csrfToken)
      return { ok: true }
    },
  )

  // ---------- Gestão de acessos: quem está no sistema ----------

  app.get(
    '/users',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({
          q: z.string().max(80).optional(),
          filter: z.enum(['all', 'online', 'admins', 'disabled', 'no_business']).optional(),
        }),
      },
    },
    async (request) => {
      const { q, filter = 'all' } = request.query
      const now = new Date()
      const filters = {
        all: {},
        online: { sessions: { some: onlineSessionWhere(now) } },
        admins: { OR: [{ isSuperAdmin: true }, { email: { in: env.SUPER_ADMIN_EMAILS } }] },
        disabled: { disabledAt: { not: null } },
        no_business: { memberships: { none: { acceptedAt: { not: null } } } },
      } satisfies Record<typeof filter, Prisma.UserWhereInput>
      const users = await prisma.user.findMany({
        where: {
          AND: [
            q
              ? {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q.toLowerCase() } },
                  ],
                }
              : {},
            filters[filter],
          ],
        },
        include: {
          memberships: {
            where: { tenant: { deletedAt: null } },
            include: { tenant: { select: { id: true, name: true, slug: true } } },
          },
          sessions: {
            where: liveSessionWhere(now),
            select: { lastSeenAt: true },
            orderBy: { lastSeenAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })
      return users.map((u) => {
        const lastSeenAt = u.sessions[0]?.lastSeenAt ?? null
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          createdAt: u.createdAt,
          isSuperAdmin: u.isSuperAdmin || isSuperAdminEmail(u.email),
          /** Admin pela configuração do servidor: não dá para remover pela tela */
          adminFromConfig: isSuperAdminEmail(u.email),
          disabledAt: u.disabledAt,
          hasPassword: Boolean(u.passwordHash),
          hasGoogle: Boolean(u.googleId),
          activeSessions: u.sessions.length,
          lastSeenAt,
          online: Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() < ONLINE_MS),
          memberships: u.memberships.map((m) => ({
            tenant: m.tenant,
            role: m.role,
            pending: !m.acceptedAt,
          })),
        }
      })
    },
  )

  app.get(
    '/users/:id/sessions',
    { schema: { tags: ['admin'], params: idParam } },
    async (request) => {
      const sessions = await prisma.session.findMany({
        where: { userId: request.params.id, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          lastSeenAt: true,
          impersonatorId: true,
        },
      })
      return sessions.map((s) => ({ ...s, current: s.id === request.auth!.sessionId }))
    },
  )

  /** Encerra uma sessão específica (ex.: um aparelho perdido). */
  app.delete('/sessions/:id', { schema: { tags: ['admin'], params: idParam } }, async (request) => {
    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) throw notFound('Sessão não encontrada')
    if (session.id === request.auth!.sessionId)
      throw badRequest('Para encerrar a sua sessão atual, use "Sair".')
    await prisma.session.delete({ where: { id: session.id } })
    await audit({
      action: 'admin.session_revoked',
      actorUserId: request.auth!.user.id,
      entity: 'user',
      entityId: session.userId,
      ip: request.ip,
    })
    return { ok: true }
  })

  /** Desconecta a pessoa de todos os aparelhos (menos a sessão atual do próprio admin). */
  app.post(
    '/users/:id/logout-all',
    { schema: { tags: ['admin'], params: idParam } },
    async (request) => {
      const { count } = await prisma.session.deleteMany({
        where: { userId: request.params.id, id: { not: request.auth!.sessionId } },
      })
      await audit({
        action: 'admin.sessions_revoked',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: request.params.id,
        metadata: { count },
        ip: request.ip,
      })
      return { count }
    },
  )

  app.post(
    '/users/:id/disable',
    {
      schema: { tags: ['admin'], params: idParam, body: z.object({ disabled: z.boolean() }) },
    },
    async (request) => {
      if (request.params.id === request.auth!.user.id)
        throw badRequest('Você não pode desativar a sua própria conta')
      const user = await prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user) throw notFound('Usuário não encontrado')
      const { disabled } = request.body
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { disabledAt: disabled ? (user.disabledAt ?? new Date()) : null },
        }),
        // Desativar derruba a pessoa de todos os aparelhos na hora
        ...(disabled ? [prisma.session.deleteMany({ where: { userId: user.id } })] : []),
      ])
      await audit({
        action: disabled ? 'admin.user_disabled' : 'admin.user_enabled',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { email: user.email },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  app.post(
    '/users/:id/super-admin',
    { schema: { tags: ['admin'], params: idParam, body: z.object({ value: z.boolean() }) } },
    async (request) => {
      const user = await prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user) throw notFound('Usuário não encontrado')
      const { value } = request.body
      if (!value && user.id === request.auth!.user.id)
        throw badRequest('Você não pode remover o seu próprio acesso de administrador')
      if (!value && isSuperAdminEmail(user.email))
        throw badRequest(
          'Este e-mail é administrador pela configuração do servidor (SUPER_ADMIN_EMAILS). Remova de lá.',
        )
      if (value && user.disabledAt) throw badRequest('Reative a conta antes de torná-la admin')
      await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: value } })
      await audit({
        action: value ? 'admin.super_admin_granted' : 'admin.super_admin_revoked',
        actorUserId: request.auth!.user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { email: user.email },
        ip: request.ip,
      })
      return { ok: true }
    },
  )

  app.get(
    '/audit',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({
          tenantId: z.string().optional(),
          /** Só ações feitas pelo painel admin */
          onlyAdmin: z.enum(['true', 'false']).optional(),
          action: z.string().max(60).optional(),
        }),
      },
    },
    async (request) => {
      const { tenantId, onlyAdmin, action } = request.query
      const logs = await prisma.auditLog.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(action
            ? { action }
            : onlyAdmin === 'true'
              ? { action: { startsWith: 'admin.' } }
              : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      // Nomes legíveis para a tela (o log guarda só os ids)
      const userIds = [
        ...new Set(
          logs.flatMap((l) => [
            l.actorUserId,
            l.impersonatorId,
            l.entity === 'user' ? l.entityId : null,
          ]),
        ),
      ].filter((id): id is string => Boolean(id))
      const tenantIds = [...new Set(logs.map((l) => l.tenantId))].filter((id): id is string =>
        Boolean(id),
      )
      const [users, tenants] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        }),
        prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        }),
      ])
      const userById = new Map(users.map((u) => [u.id, u]))
      const tenantById = new Map(tenants.map((t) => [t.id, t.name]))
      return logs.map((l) => ({
        ...l,
        actor: (l.actorUserId && userById.get(l.actorUserId)) || null,
        impersonator: (l.impersonatorId && userById.get(l.impersonatorId)) || null,
        targetUser: (l.entity === 'user' && l.entityId && userById.get(l.entityId)) || null,
        tenantName: (l.tenantId && tenantById.get(l.tenantId)) || null,
      }))
    },
  )
}
