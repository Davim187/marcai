import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { requestContext } from './request-context'

export async function audit(entry: {
  action: string
  tenantId?: string | null
  actorUserId?: string | null
  impersonatorId?: string | null
  entity?: string
  entityId?: string
  metadata?: Prisma.InputJsonValue
  ip?: string
}) {
  // Em modo suporte ("entrar como"), toda ação fica registrada com o admin responsável
  const impersonatorId = entry.impersonatorId ?? requestContext.getStore()?.impersonatorId ?? null
  await prisma.auditLog.create({ data: { ...entry, impersonatorId } })
}
