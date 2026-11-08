import { MINUTE_MS } from '@marcai/shared'
import bcrypt from 'bcryptjs'
import type { RegisterInput } from '@marcai/shared'
import { env, isSuperAdminEmail } from '../../config/env'
import { hashToken, randomToken } from '../../lib/crypto'
import { bestEffort } from '../../lib/best-effort'
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../../lib/errors'
import { emailLayout, sendEmail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function createSession(
  userId: string,
  opts: {
    tenantId?: string | null
    impersonatorId?: string | null
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
  const csrfToken = randomToken(24)
  const ttlDays = opts.impersonatorId ? 1 : env.SESSION_TTL_DAYS
  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      tenantId,
      impersonatorId: opts.impersonatorId ?? null,
      csrfToken,
      userAgent: opts.userAgent?.slice(0, 300),
      ip: opts.ip,
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    },
  })
  return { token, csrfToken, session }
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
