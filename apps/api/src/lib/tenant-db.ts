import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Modelos que pertencem a um tenant. Toda operação feita via `forTenant()` recebe
 * `tenantId` obrigatório no `where` e no `data` — é impossível ler/escrever dados de
 * outro estabelecimento por esse cliente, mesmo esquecendo o filtro na query.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'TenantMember',
  'Professional',
  'ServiceCategory',
  'Service',
  'ProfessionalService',
  'WorkingHours',
  'TimeOff',
  'RecurringBlock',
  'Holiday',
  'Customer',
  'Booking',
  'BookingFieldAnswer',
  'FormField',
  'FormFieldOption',
  'FormFieldService',
  'Notification',
  'MessageTemplate',
  'WhatsAppConnection',
  'PushSubscription',
  'Subscription',
  'Invoice',
])

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
])

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantIsolationError'
  }
}

function assertSameTenant(data: unknown, tenantId: string, model: string) {
  if (data && typeof data === 'object' && 'tenantId' in data) {
    const v = (data as { tenantId?: unknown }).tenantId
    if (v !== undefined && v !== tenantId) {
      throw new TenantIsolationError(`Tentativa de gravar ${model} em outro tenant`)
    }
  }
}

function withTenant<T>(data: T, tenantId: string, model: string): T {
  assertSameTenant(data, tenantId, model)
  return { ...(data as object), tenantId } as T
}

export function forTenant(tenantId: string) {
  if (!tenantId) throw new TenantIsolationError('tenantId é obrigatório')
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args)
          const a = (args ?? {}) as Record<string, unknown>

          if (WHERE_OPS.has(operation)) {
            assertSameTenant(a.where, tenantId, model)
            a.where = { ...((a.where as object) ?? {}), tenantId }
          }
          if (operation === 'create') a.data = withTenant(a.data, tenantId, model)
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const list = Array.isArray(a.data) ? a.data : [a.data]
            a.data = list.map((d) => withTenant(d, tenantId, model))
          }
          if (operation === 'upsert') a.create = withTenant(a.create, tenantId, model)
          if (operation === 'update' || operation === 'updateMany' || operation === 'upsert') {
            const key = operation === 'upsert' ? 'update' : 'data'
            assertSameTenant(a[key], tenantId, model)
          }
          return query(a as typeof args)
        },
      },
    },
  })
}

export type TenantDb = ReturnType<typeof forTenant>
export type TxClient = Prisma.TransactionClient
