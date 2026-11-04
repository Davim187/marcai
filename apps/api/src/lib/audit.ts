import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

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
  await prisma.auditLog.create({ data: { ...entry } })
}
