import { MINUTE_MS } from '@marcai/shared'
import bcrypt from 'bcryptjs'
import type { RegisterInput } from '@marcai/shared'
import { env, isSuperAdminEmail } from '../../config/env'
import { hashToken, randomToken, safeEqual } from '../../lib/crypto'
import { logger } from '../../lib/logger'
import { bestEffort } from '../../lib/best-effort'
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../../lib/errors'
import { emailLayout, sendEmail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/** Tokens que vão nos cookies (só os hashes ficam no banco). */
export interface IssuedTokens {
  token: string
  refreshToken: string
  csrfToken: string
  accessExpiresAt: Date
  expiresAt: Date
}

/**
 * Janela em que reapresentar o refresh token anterior não é tratado como roubo: duas abas
 * renovando ao mesmo tempo mandam o mesmo cookie.
 */
const REFRESH_RACE_WINDOW_MS = 60_000
const SUPPORT_SESSION_MS = 86_400_000

/** Fim da sessão: renovado a cada uso; a de suporte vale no máximo 1 dia desde o início. */
function sessionExpiry(s: { impersonatorId: string | null; createdAt: Date }) {
  return s.impersonatorId
    ? new Date(s.createdAt.getTime() + SUPPORT_SESSION_MS)
    : new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000)
}

function accessExpiry(sessionEnd: Date) {
  const t = Date.now() + env.ACCESS_TOKEN_TTL_MINUTES * MINUTE_MS
  return new Date(Math.min(t, sessionEnd.getTime()))
}

export async function createSession(
  userId: string,
  opts: {
    tenantId?: string | null
    impersonatorId?: string | null
    /** Modo suporte: sessão do admin para onde voltar ao encerrar */
    parentSessionId?: string | null
    returnTokenHash?: string | null
    userAgent?: string
    ip?: string
  } = {},
) {
  let tenantId = opts.tenantId
  if (tenantId === undefined) {
    const membership = await prisma.tenantMember.findFirst({
      where: { userId, acceptedAt: { not: null }, tenant: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
    })
    tenantId = membership?.tenantId ?? null
  }
  const token = randomToken()
  const refreshToken = randomToken(48)
  const csrfToken = randomToken(24)
  const impersonatorId = opts.impersonatorId ?? null
  const expiresAt = sessionExpiry({ impersonatorId, createdAt: new Date() })
  const accessExpiresAt = accessExpiry(expiresAt)
  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      accessExpiresAt,
      refreshTokenHash: hashToken(refreshToken),
      userId,
      tenantId,
      impersonatorId,
      parentSessionId: opts.parentSessionId ?? null,
      returnTokenHash: opts.returnTokenHash ?? null,
      csrfToken,
      userAgent: opts.userAgent?.slice(0, 300),
      ip: opts.ip,
      expiresAt,
    },
  })
  const issued: IssuedTokens = { token, refreshToken, csrfToken, accessExpiresAt, expiresAt }
  return { ...issued, issued, session }
}

/**
 * Gera um par novo (access + refresh) para uma sessão existente. Com `expectedRefreshHash`,
 * só gira se o refresh token ainda for o atual (duas renovações simultâneas não giram duas vezes).
 */
async function reissueTokens(
  session: { id: string; csrfToken: string; impersonatorId: string | null; createdAt: Date },
  expectedRefreshHash?: string,
): Promise<IssuedTokens | null> {
  const token = randomToken()
  const refreshToken = randomToken(48)
  const expiresAt = sessionExpiry(session)
  const accessExpiresAt = accessExpiry(expiresAt)
  const now = new Date()
  const res = await prisma.session.updateMany({
    where: {
      id: session.id,
      ...(expectedRefreshHash ? { refreshTokenHash: expectedRefreshHash } : {}),
    },
    data: {
      tokenHash: hashToken(token),
      accessExpiresAt,
      refreshTokenHash: hashToken(refreshToken),
      previousRefreshHash: expectedRefreshHash ?? null,
      refreshedAt: now,
      lastSeenAt: now,
      expiresAt,
    },
  })
  if (!res.count) return null
  return { token, refreshToken, csrfToken: session.csrfToken, accessExpiresAt, expiresAt }
}

const SESSION_EXPIRED = 'Sua sessão expirou. Entre de novo.'

/**
 * Troca o refresh token por um par novo (rotação). `raced`: outra aba acabou de renovar com o
 * mesmo token; os cookies novos já chegaram (ou vão chegar) por ela.
 * Reuso de um token já girado fora da janela de corrida encerra a sessão inteira.
 */
export async function rotateRefreshToken(
  refreshToken: string,
): Promise<{ raced: true } | { raced: false; tokens: IssuedTokens }> {
  const hash = hashToken(refreshToken)
  const session = await prisma.session.findFirst({
    where: { OR: [{ refreshTokenHash: hash }, { previousRefreshHash: hash }] },
    include: { user: { select: { disabledAt: true } } },
  })
  if (!session) throw unauthorized(SESSION_EXPIRED)
  if (session.refreshTokenHash !== hash) {
    const recent =
      session.refreshedAt && Date.now() - session.refreshedAt.getTime() < REFRESH_RACE_WINDOW_MS
    if (recent) return { raced: true }
    await prisma.session.deleteMany({ where: { id: session.id } })
    logger.warn(
      { userId: session.userId, sessionId: session.id },
      'Reuso de refresh token detectado: sessão encerrada',
    )
    throw unauthorized(SESSION_EXPIRED)
  }
  if (session.expiresAt <= new Date() || session.user.disabledAt) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    throw unauthorized(session.user.disabledAt ? DISABLED_MESSAGE : SESSION_EXPIRED)
  }
  const tokens = await reissueTokens(session, hash)
  return tokens ? { raced: false, tokens } : { raced: true }
}

/**
 * Encerra o modo suporte e devolve o admin à própria sessão. Exige o segredo do cookie de
 * retorno (só o navegador que entrou como tem) e que a sessão do admin ainda esteja válida.
 */
export async function exitSupportSession(supportSessionId: string, returnToken?: string) {
  const support = await prisma.session.findUnique({ where: { id: supportSessionId } })
  await prisma.session.deleteMany({ where: { id: supportSessionId } })
  if (
    !support?.impersonatorId ||
    !support.parentSessionId ||
    !support.returnTokenHash ||
    !returnToken ||
    !safeEqual(hashToken(returnToken), support.returnTokenHash)
  )
    return null
  const parent = await prisma.session.findUnique({
    where: { id: support.parentSessionId },
    include: { user: { select: { disabledAt: true } } },
  })
  if (
    !parent ||
    parent.userId !== support.impersonatorId ||
    parent.impersonatorId ||
    parent.expiresAt <= new Date() ||
    parent.user.disabledAt
  )
    return null
  return reissueTokens(parent)
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw conflict('Já existe uma conta com esse e-mail. Tente entrar.', 'EMAIL_EM_USO')
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    },
  })
  const { html, text } = emailLayout({
    title: `Boas-vindas, ${input.name.split(' ')[0]}!`,
    body: 'Sua conta foi criada. Falta pouco para sua agenda online ficar pronta: termine o cadastro do seu negócio e compartilhe o link na bio do Instagram.\nVocê tem 30 dias grátis para testar tudo, sem cartão.',
    cta: { label: 'Continuar cadastro', url: `${env.APP_URL}/onboarding` },
  })
  void bestEffort(
    sendEmail({ to: user.email, subject: `Boas-vindas ao ${env.APP_NAME}!`, html, text }),
    'enviar e-mail de boas-vindas',
    { userId: user.id },
  )
  return user
}

/**
 * Bloqueio por conta (além do rate limit por IP): depois de 10 senhas erradas em 15 min
 * o e-mail fica bloqueado por 15 min, mesmo que o atacante troque de IP.
 * Em memória por instância; com várias instâncias, use Redis (ver ARQUITETURA.md).
 */
const LOGIN_MAX_FAILURES = 10
const LOGIN_WINDOW_MS = 15 * MINUTE_MS
const failedLogins = new Map<string, { count: number; firstAt: number }>()

function assertNotLocked(email: string) {
  const entry = failedLogins.get(email)
  if (!entry) return
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) failedLogins.delete(email)
  else if (entry.count >= LOGIN_MAX_FAILURES) {
    throw tooMany('Muitas tentativas de login nesta conta. Aguarde 15 minutos ou redefina a senha.')
  }
}

function registerFailure(email: string) {
  const entry = failedLogins.get(email)
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS)
    failedLogins.set(email, { count: 1, firstAt: Date.now() })
  else entry.count++
}

export async function verifyLogin(email: string, password: string) {
  assertNotLocked(email)
  const user = await prisma.user.findUnique({ where: { email } })
  // Compara mesmo quando o usuário não existe, para não vazar por tempo de resposta.
  const hash = user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5x8Qe8cRZzQ8V0cY1o8q2pUuC7m2Gzq'
  const ok = await bcrypt.compare(password, hash)
  if (!user || !user.passwordHash || !ok) {
    registerFailure(email)
    throw unauthorized('E-mail ou senha incorretos')
  }
  failedLogins.delete(email)
  assertNotDisabled(user)
  return user
}

export const DISABLED_MESSAGE = 'Esta conta foi desativada. Fale com o suporte.'

export function assertNotDisabled(user: { disabledAt: Date | null }) {
  if (user.disabledAt) throw forbidden(DISABLED_MESSAGE)
}

/**
 * Gera o link de redefinição e dispara o e-mail em segundo plano: a resposta tem o mesmo
 * tempo e o mesmo resultado exista ou não a conta, e uma falha do SMTP não vira erro 500
 * (fica no log). Devolve a promessa do envio só para os testes poderem aguardar.
 */
export function requestPasswordReset(email: string): { sending: Promise<unknown> } {
  const sending = bestEffort(sendPasswordReset(email), 'enviar e-mail de redefinição de senha')
  return { sending }
}

/** Intervalo mínimo entre dois e-mails de redefinição para a mesma conta (anti-spam). */
const RESET_COOLDOWN_MS = 60_000

/** Marca dos e-mails da conta: no modo exclusivo, o nome e a cor do estabelecimento. */
async function accountBrand(): Promise<{ brandName?: string; color?: string }> {
  if (env.APP_MODE !== 'single_tenant' || !env.SINGLE_TENANT_SLUG) return {}
  const t = await prisma.tenant.findUnique({
    where: { slug: env.SINGLE_TENANT_SLUG },
    select: { name: true, primaryColor: true },
  })
  return t ? { brandName: t.name, color: t.primaryColor } : {}
}

async function sendPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.disabledAt) return // não revela se o e-mail existe
  // Pedidos repetidos em sequência não lotam a caixa de entrada de ninguém
  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESET_COOLDOWN_MS) },
    },
  })
  if (recent) return
  // Só o link mais recente vale: os anteriores deixam de funcionar
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } })
  const token = randomToken()
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })
  const url = `${env.APP_URL}/redefinir-senha?token=${token}`
  const brand = await accountBrand()
  const { html, text } = emailLayout({
    ...brand,
    title: 'Redefinir sua senha',
    body: 'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.\nSe não foi você, é só ignorar este e-mail.',
    cta: { label: 'Criar nova senha', url },
  })
  await sendEmail({
    to: user.email,
    subject: 'Redefinição de senha',
    html,
    text,
    fromName: brand.brandName,
  })
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('Link inválido ou expirado. Peça um novo.', 'TOKEN_INVALIDO')
  }
  const passwordHash = await hashPassword(password)
  await prisma.$transaction(async (tx) => {
    // Marca o link como usado de forma condicional: dois envios simultâneos não trocam a
    // senha duas vezes (o segundo recebe "link inválido")
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (!claimed.count)
      throw badRequest('Link inválido ou expirado. Peça um novo.', 'TOKEN_INVALIDO')
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
    await tx.session.deleteMany({ where: { userId: record.userId } })
    // Outros links de redefinição pendentes deixam de valer
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  })
}

/** Monta o payload de `/auth/me`. */
export async function buildMe(userId: string, sessionTenantId: string | null) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      avatarUrl: true,
      isSuperAdmin: true,
      passwordHash: true,
      googleId: true,
    },
  })
  const all = await prisma.tenantMember.findMany({
    where: { userId, tenant: { deletedAt: null } },
    include: { tenant: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  })
  const memberships = all.filter((m) => m.acceptedAt)
  const { passwordHash, ...safe } = user
  safe.isSuperAdmin ||= isSuperAdminEmail(user.email)
  return {
    user: { ...safe, hasPassword: Boolean(passwordHash), hasGoogle: Boolean(user.googleId) },
    memberships: memberships.map((m) => ({ tenantId: m.tenantId, role: m.role, tenant: m.tenant })),
    /** Convites de outros estabelecimentos aguardando aceite */
    invites: all
      .filter((m) => !m.acceptedAt)
      .map((m) => ({ tenantId: m.tenantId, role: m.role, tenant: m.tenant })),
    activeTenantId: sessionTenantId,
  }
}
