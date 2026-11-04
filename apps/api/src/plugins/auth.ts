import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { MemberRole, Subscription, Tenant } from '@prisma/client'
import { accessLevel, type AccessLevel, type Feature, hasFeature } from '@marcai/shared'
import { env, isProd } from '../config/env'
import { hashToken, safeEqual } from '../lib/crypto'
import { forbidden, paymentRequired, unauthorized } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { forTenant, type TenantDb } from '../lib/tenant-db'

export const SESSION_COOKIE = 'marcai_session'
export const CSRF_COOKIE = 'marcai_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface AuthContext {
  sessionId: string
  csrfToken: string
  user: { id: string; email: string; name: string; isSuperAdmin: boolean }
  tenantId: string | null
  impersonatorId: string | null
}

export interface TenantContext {
  tenantId: string
  tenant: Tenant
  subscription: Subscription | null
  role: MemberRole
  professionalId: string | null
  db: TenantDb
  access: AccessLevel
  can: (feature: Feature) => boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
    tenantCtx: TenantContext | null
  }
}

export function cookieOptions(maxAgeSeconds?: number) {
  return {
    path: '/',
    httpOnly: true,
    secure: isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  } as const
}

export function setSessionCookies(reply: FastifyReply, token: string, csrfToken: string) {
  const maxAge = env.SESSION_TTL_DAYS * 86_400
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(maxAge))
  reply.setCookie(CSRF_COOKIE, csrfToken, { ...cookieOptions(maxAge), httpOnly: false })
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, cookieOptions())
  reply.clearCookie(CSRF_COOKIE, { ...cookieOptions(), httpOnly: false })
}

/** Lê o cookie de sessão em toda requisição e popula `request.auth`. */
export const authPlugin = fp(async (app) => {
  app.decorateRequest('auth', null)
  app.decorateRequest('tenantCtx', null)
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) return
    request.auth = {
      sessionId: session.id,
      csrfToken: session.csrfToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        isSuperAdmin: session.user.isSuperAdmin,
      },
      tenantId: session.tenantId,
      impersonatorId: session.impersonatorId,
    }
    // Atualiza "visto por último" no máximo a cada 10 minutos
    if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
      prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined)
    }
  })
})

function checkCsrf(request: FastifyRequest) {
  if (SAFE_METHODS.has(request.method)) return
  const header = request.headers['x-csrf-token']
  if (typeof header !== 'string' || !request.auth || !safeEqual(header, request.auth.csrfToken)) {
    throw forbidden('Sessão expirada ou requisição inválida. Recarregue a página e tente de novo.')
  }
}

/** Guard: usuária logada (com CSRF em métodos que alteram dados). */
export async function requireAuth(request: FastifyRequest) {
  if (!request.auth) throw unauthorized()
  checkCsrf(request)
}

export async function requireSuperAdmin(request: FastifyRequest) {
  await requireAuth(request)
  if (!request.auth!.user.isSuperAdmin || request.auth!.impersonatorId) {
    throw forbidden('Área restrita ao administrador do sistema')
  }
}

/** Rotas que continuam liberadas mesmo com a assinatura vencida (modo somente leitura). */
const READ_ONLY_ALLOWED = [
  /^\/api\/billing/,
  /^\/api\/account/,
  /^\/api\/auth/,
  /^\/api\/notifications\/(read|read-all)/,
]

/** Guard: usuária logada e com estabelecimento ativo na sessão. Popula `request.tenantCtx`. */
export async function requireTenant(request: FastifyRequest) {
  await requireAuth(request)
  const auth = request.auth!
  if (!auth.tenantId) throw forbidden('Conclua o cadastro do seu negócio para continuar')

  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: auth.tenantId, userId: auth.user.id } },
    include: { tenant: { include: { subscription: true } } },
  })
  // Super admin "entrando como" o tenant: age como dona, com auditoria.
  let role: MemberRole
  let tenant: (Tenant & { subscription: Subscription | null }) | null
  let professionalId: string | null = null
  if (member) {
    role = member.role
    tenant = member.tenant
    professionalId = member.professionalId
  } else if (auth.impersonatorId) {
    tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      include: { subscription: true },
    })
    role = 'owner'
  } else {
    throw forbidden('Você não faz parte deste estabelecimento')
  }
  if (!tenant || tenant.deletedAt) throw forbidden('Estabelecimento não encontrado')

  const access = tenant.blocked
    ? 'blocked'
    : accessLevel(tenant.subscription, new Date(), env.APP_MODE)
  request.tenantCtx = {
    tenantId: tenant.id,
    tenant,
    subscription: tenant.subscription,
    role,
    professionalId,
    db: forTenant(tenant.id),
    access,
    can: (feature) => hasFeature(tenant!.subscription, feature, env.APP_MODE),
  }

  if (
    access === 'blocked' &&
    !SAFE_METHODS.has(request.method) &&
    !READ_ONLY_ALLOWED.some((r) => r.test(request.url))
  ) {
    throw paymentRequired(
      tenant.blocked
        ? 'Sua conta está bloqueada. Fale com o suporte.'
        : 'Sua assinatura está vencida há mais de 7 dias. O painel está em modo somente leitura — regularize para voltar a editar.',
      'SOMENTE_LEITURA',
    )
  }
}

export async function requireOwner(request: FastifyRequest) {
  await requireTenant(request)
  if (request.tenantCtx!.role !== 'owner') {
    throw forbidden('Somente a dona do estabelecimento pode fazer isso')
  }
}

/** Atalho para obter o contexto já validado dentro do handler. */
export function ctx(request: FastifyRequest): TenantContext {
  if (!request.tenantCtx) throw unauthorized()
  return request.tenantCtx
}

export function requireFeature(feature: Feature) {
  return async (request: FastifyRequest) => {
    if (!ctx(request).can(feature)) {
      throw paymentRequired(
        'Esse recurso faz parte do plano Pro. Faça o upgrade para liberar.',
        'PLANO_PRO',
      )
    }
  }
}
