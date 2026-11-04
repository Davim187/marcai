import bcrypt from 'bcryptjs'
import type { RegisterInput } from '@marcai/shared'
import { env } from '../../config/env'
import { hashToken, randomToken } from '../../lib/crypto'
import { badRequest, conflict, unauthorized } from '../../lib/errors'
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
      where: { userId, tenant: { deletedAt: null } },
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
    title: `Boas-vindas, ${input.name.split(' ')[0]}! 💖`,
    body: 'Sua conta foi criada. Falta pouco para sua agenda online ficar pronta: termine o cadastro do seu negócio e compartilhe o link na bio do Instagram.\nVocê tem 30 dias grátis para testar tudo, sem cartão.',
    cta: { label: 'Continuar cadastro', url: `${env.APP_URL}/onboarding` },
  })
  sendEmail({ to: user.email, subject: `Boas-vindas ao ${env.APP_NAME}!`, html, text }).catch(
    () => undefined,
  )
  return user
}

export async function verifyLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  // Compara mesmo quando a usuária não existe, para não vazar por tempo de resposta.
  const hash = user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5x8Qe8cRZzQ8V0cY1o8q2pUuC7m2Gzq'
  const ok = await bcrypt.compare(password, hash)
  if (!user || !user.passwordHash || !ok) throw unauthorized('E-mail ou senha incorretos')
  return user
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // não revela se o e-mail existe
  const token = randomToken()
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })
  const url = `${env.APP_URL}/redefinir-senha?token=${token}`
  const { html, text } = emailLayout({
    title: 'Redefinir sua senha',
    body: 'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.\nSe não foi você, é só ignorar este e-mail.',
    cta: { label: 'Criar nova senha', url },
  })
  await sendEmail({ to: user.email, subject: 'Redefinição de senha', html, text })
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('Link inválido ou expirado. Peça um novo.', 'TOKEN_INVALIDO')
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ])
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
  const memberships = await prisma.tenantMember.findMany({
    where: { userId, tenant: { deletedAt: null } },
    include: { tenant: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  })
  const { passwordHash, ...safe } = user
  return {
    user: { ...safe, hasPassword: Boolean(passwordHash), hasGoogle: Boolean(user.googleId) },
    memberships: memberships.map((m) => ({ tenantId: m.tenantId, role: m.role, tenant: m.tenant })),
    activeTenantId: sessionTenantId,
  }
}
