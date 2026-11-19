import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@marcai/shared'
import { env, isSuperAdminEmail } from '../../config/env'
import { hashToken, randomToken, safeEqual } from '../../lib/crypto'
import { badRequest, forbidden, unauthorized } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import {
  clearSessionCookies,
  clearSupportReturnCookie,
  cookieOptions,
  REFRESH_COOKIE,
  requireAuth,
  setSessionCookies,
  SUPPORT_RETURN_COOKIE,
} from '../../plugins/auth'
import { audit } from '../../lib/audit'
import { getTenantSummary } from '../tenants/tenant.summary'
import {
  buildMe,
  createSession,
  exitSupportSession,
  hashPassword,
  registerUser,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
  verifyLogin,
} from './auth.service'
import { exchangeGoogleCode, googleAuthUrl, googleEnabled } from './google'
import bcrypt from 'bcryptjs'

const STATE_COOKIE = 'marcai_oauth_state'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const strictLimit = { rateLimit: { max: 10, timeWindow: '15 minutes' } }

  app.post(
    '/register',
    {
      config: strictLimit,
      schema: { tags: ['auth'], summary: 'Criar conta', body: registerSchema },
    },
    async (request, reply) => {
      if (env.APP_MODE === 'single_tenant')
        throw forbidden('Cadastro público desativado nesta instalação')
      const user = await registerUser(request.body)
      const { issued } = await createSession(user.id, {
        tenantId: null,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      })
      setSessionCookies(reply, issued)
      return reply.status(201).send({
        ok: true,
        csrfToken: issued.csrfToken,
        accessExpiresAt: issued.accessExpiresAt.toISOString(),
      })
    },
  )

  app.post(
    '/login',
    {
      config: strictLimit,
      schema: { tags: ['auth'], summary: 'Entrar com e-mail e senha', body: loginSchema },
    },
    async (request, reply) => {
      const user = await verifyLogin(request.body.email, request.body.password)
      const { issued } = await createSession(user.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      })
      setSessionCookies(reply, issued)
      return {
        ok: true,
        csrfToken: issued.csrfToken,
        accessExpiresAt: issued.accessExpiresAt.toISOString(),
      }
    },
  )

  /**
   * Troca o refresh token (cookie) por um par novo. Sem CSRF: só gira os próprios cookies do
   * navegador e devolve o token de CSRF para quem já está na origem certa (CORS).
   */
  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['auth'], summary: 'Renovar a sessão (refresh token)' },
    },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE]
      if (!refreshToken) throw unauthorized('Sua sessão expirou. Entre de novo.')
      try {
        const res = await rotateRefreshToken(refreshToken)
        if (res.raced) return { ok: true, raced: true }
        setSessionCookies(reply, res.tokens)
        return {
          ok: true,
          csrfToken: res.tokens.csrfToken,
          accessExpiresAt: res.tokens.accessExpiresAt.toISOString(),
        }
      } catch (err) {
        clearSessionCookies(reply)
        throw err
      }
    },
  )

  app.post('/logout', { schema: { tags: ['auth'], summary: 'Sair' } }, async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE]
    if (request.auth) {
      await prisma.session.deleteMany({ where: { id: request.auth.sessionId } })
    } else if (refreshToken) {
      // Access token já vencido: acha a sessão pelo refresh token
      await prisma.session.deleteMany({ where: { refreshTokenHash: hashToken(refreshToken) } })
    }
    clearSessionCookies(reply)
    return { ok: true }
  })

  app.get('/me', { schema: { tags: ['auth'], summary: 'Sessão atual' } }, async (request) => {
    if (!request.auth)
      return {
        authenticated: false as const,
        appMode: env.APP_MODE,
        googleEnabled: googleEnabled(),
        /** Há refresh token: o front tenta renovar antes de mandar para o login */
        canRefresh: Boolean(request.cookies[REFRESH_COOKIE]),
      }
    const me = await buildMe(request.auth.user.id, request.auth.tenantId)
    const tenant = request.auth.tenantId
      ? await getTenantSummary(request.auth.tenantId, request.auth.user.id)
      : null
    return {
      authenticated: true as const,
      appMode: env.APP_MODE,
      googleEnabled: googleEnabled(),
      csrfToken: request.auth.csrfToken,
      accessExpiresAt: request.auth.accessExpiresAt.toISOString(),
      impersonating: Boolean(request.auth.impersonatorId),
      ...me,
      tenant,
    }
  })

  app.post(
    '/switch-tenant',
    {
      onRequest: requireAuth,
      schema: { tags: ['auth'], body: z.object({ tenantId: z.string() }) },
    },
    async (request) => {
      const member = await prisma.tenantMember.findUnique({
        where: {
          tenantId_userId: { tenantId: request.body.tenantId, userId: request.auth!.user.id },
        },
      })
      if (!member) throw forbidden('Você não faz parte deste estabelecimento')
      if (!member.acceptedAt)
        throw forbidden('Aceite o convite antes de entrar nesse estabelecimento')
      await prisma.session.update({
        where: { id: request.auth!.sessionId },
        data: { tenantId: member.tenantId },
      })
      return { ok: true }
    },
  )

  /**
   * Encerra o modo suporte ("entrar como") e volta para a sessão do admin, em vez de sair do
   * sistema. Sem a sessão do admin (expirou, foi encerrada), apenas sai.
   */
  app.post(
    '/support/exit',
    { onRequest: requireAuth, schema: { tags: ['auth'], summary: 'Encerrar modo suporte' } },
    async (request, reply) => {
      const auth = request.auth!
      if (!auth.impersonatorId) throw badRequest('Você não está no modo suporte')
      await audit({
        action: 'admin.impersonation_ended',
        tenantId: auth.tenantId,
        actorUserId: auth.user.id,
        impersonatorId: auth.impersonatorId,
        ip: request.ip,
      })
      const tokens = await exitSupportSession(
        auth.sessionId,
        request.cookies[SUPPORT_RETURN_COOKIE],
      )
      if (!tokens) {
        clearSessionCookies(reply)
        return { ok: true, restored: false as const }
      }
      setSessionCookies(reply, tokens)
      clearSupportReturnCookie(reply)
      return {
        ok: true,
        restored: true as const,
        tenantId: auth.tenantId,
        csrfToken: tokens.csrfToken,
        accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      }
    },
  )

  /** Convite para a equipe de outro estabelecimento: aceitar ou recusar. */
  app.post(
    '/invites/:tenantId/accept',
    {
      onRequest: requireAuth,
      schema: { tags: ['auth'], params: z.object({ tenantId: z.string() }) },
    },
    async (request) => {
      const res = await prisma.tenantMember.updateMany({
        where: {
          tenantId: request.params.tenantId,
          userId: request.auth!.user.id,
          acceptedAt: null,
        },
        data: { acceptedAt: new Date() },
      })
      if (!res.count) throw forbidden('Convite não encontrado')
      await prisma.session.update({
        where: { id: request.auth!.sessionId },
        data: { tenantId: request.params.tenantId },
      })
      return { ok: true }
    },
  )

  app.post(
    '/invites/:tenantId/decline',
    {
      onRequest: requireAuth,
      schema: { tags: ['auth'], params: z.object({ tenantId: z.string() }) },
    },
    async (request) => {
      await prisma.tenantMember.deleteMany({
        where: {
          tenantId: request.params.tenantId,
          userId: request.auth!.user.id,
          acceptedAt: null,
        },
      })
      return { ok: true }
    },
  )

  app.post(
    '/forgot-password',
    { config: strictLimit, schema: { tags: ['auth'], body: forgotPasswordSchema } },
    async (request) => {
      requestPasswordReset(request.body.email)
      return {
        ok: true,
        message: 'Se o e-mail estiver cadastrado, você vai receber um link em instantes.',
      }
    },
  )

  app.post(
    '/reset-password',
    { config: strictLimit, schema: { tags: ['auth'], body: resetPasswordSchema } },
    async (request) => {
      await resetPassword(request.body.token, request.body.password)
      return { ok: true }
    },
  )

  app.post(
    '/change-password',
    { onRequest: requireAuth, schema: { tags: ['auth'], body: changePasswordSchema } },
    async (request) => {
      if (request.auth!.impersonatorId) {
        throw forbidden('No modo suporte não é possível alterar a senha da conta')
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.auth!.user.id } })
      if (user.passwordHash) {
        const ok = await bcrypt.compare(request.body.currentPassword ?? '', user.passwordHash)
        if (!ok) throw badRequest('Senha atual incorreta', 'SENHA_INCORRETA')
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(request.body.newPassword) },
      })
      await prisma.session.deleteMany({
        where: { userId: user.id, id: { not: request.auth!.sessionId } },
      })
      return { ok: true }
    },
  )

  // ---------- Google OAuth ----------
  app.get(
    '/google',
    { schema: { tags: ['auth'], summary: 'Iniciar login com Google' } },
    async (_request, reply) => {
      if (!googleEnabled()) throw badRequest('Login com Google não configurado')
      const state = randomToken(16)
      reply.setCookie(STATE_COOKIE, hashToken(state), { ...cookieOptions(600), sameSite: 'lax' })
      return reply.redirect(googleAuthUrl(state))
    },
  )

  app.get(
    '/google/callback',
    {
      schema: {
        tags: ['auth'],
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query
      const expected = request.cookies[STATE_COOKIE]
      reply.clearCookie(STATE_COOKIE, cookieOptions())
      if (error || !code || !state || !expected || !safeEqual(hashToken(state), expected)) {
        return reply.redirect(`${env.APP_URL}/entrar?erro=google`)
      }
      const profile = await exchangeGoogleCode(code)
      let user = await prisma.user.findFirst({
        where: { OR: [{ googleId: profile.sub }, { email: profile.email.toLowerCase() }] },
      })
      if (!user) {
        if (env.APP_MODE === 'single_tenant')
          return reply.redirect(`${env.APP_URL}/entrar?erro=sem-conta`)
        user = await prisma.user.create({
          data: {
            email: profile.email.toLowerCase(),
            name: profile.name,
            googleId: profile.sub,
            avatarUrl: profile.picture,
            emailVerifiedAt: new Date(),
          },
        })
      } else if (!user.googleId) {
        // Conta criada com senha e e-mail nunca verificado: quem criou pode não ser o dono do
        // e-mail (pré-sequestro). O Google prova a posse do e-mail, então a senha anterior e as
        // sessões abertas são descartadas antes de vincular.
        const unverified = !user.emailVerifiedAt
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.sub,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            ...(unverified ? { passwordHash: null } : {}),
          },
        })
        if (unverified) await prisma.session.deleteMany({ where: { userId: user.id } })
      }
      if (user.disabledAt) return reply.redirect(`${env.APP_URL}/entrar?erro=desativada`)
      const { issued, session } = await createSession(user.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      })
      setSessionCookies(reply, issued)
      const isAdmin = user.isSuperAdmin || isSuperAdminEmail(user.email)
      const home = session.tenantId ? '/painel' : isAdmin ? '/admin' : '/onboarding'
      return reply.redirect(`${env.APP_URL}${home}`)
    },
  )
}
