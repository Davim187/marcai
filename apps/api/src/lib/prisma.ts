import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Cliente "cru" — use apenas em rotas públicas resolvidas por slug, no super admin,
 * em auth e no worker. Em rotas do painel, use SEMPRE `request.db` (escopado por tenant).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.PRISMA_LOG === '1'
        ? ['query', 'warn', 'error']
        : process.env.NODE_ENV === 'test'
          ? []
          : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
