import type { Prisma, Subscription, Tenant } from '@prisma/client'
import { minPlanFor, PLANS, planLimits, type PlanId } from '@marcai/shared'
import { env } from '../config/env'
import { paymentRequired } from './errors'
import { prisma } from './prisma'

/**
 * Conta = unidade principal + unidades extras (Tenant.parentTenantId). A assinatura, o plano e
 * os limites são sempre os da principal; as unidades extras não têm assinatura própria.
 */
export const ACCOUNT_SUB_INCLUDE = {
  subscription: true,
  parent: { include: { subscription: true } },
} satisfies Prisma.TenantInclude

type WithSub = Tenant & {
  subscription: Subscription | null
  parent?: (Tenant & { subscription: Subscription | null }) | null
}

/** Troca a assinatura da unidade extra pela da principal (bloqueio da principal também vale). */
export function withAccountSub<T extends WithSub>(t: T): T {
  if (!t.parentTenantId || !t.parent) return t
  return { ...t, subscription: t.parent.subscription, blocked: t.blocked || t.parent.blocked }
}

export const accountRootId = (t: Pick<Tenant, 'id' | 'parentTenantId'>) => t.parentTenantId ?? t.id

/** Uso atual da conta: unidades ativas e profissionais ativos somando todas elas. */
export async function accountUsage(rootId: string) {
  const units = await prisma.tenant.findMany({
    where: { OR: [{ id: rootId }, { parentTenantId: rootId }], deletedAt: null },
    select: { id: true },
  })
  const professionals = await prisma.professional.count({
    where: { tenantId: { in: units.map((u) => u.id) }, deletedAt: null, active: true },
  })
  return { locations: units.length, professionals }
}

function limitMessage(what: string, limit: number, plan: PlanId) {
  const next = plan === 'essencial' ? PLANS.pro : PLANS.premium
  return `Seu plano ${PLANS[plan].name} permite até ${limit} ${what}. Mude para o ${next.name} para adicionar mais.`
}

async function loadRoot(rootId: string) {
  return prisma.tenant.findUniqueOrThrow({
    where: { id: rootId },
    include: { subscription: true },
  })
}

/** Barra um profissional a mais além do limite do plano. */
export async function assertCanAddProfessional(tenant: Pick<Tenant, 'id' | 'parentTenantId'>) {
  const root = await loadRoot(accountRootId(tenant))
  const limit = planLimits(root.subscription, env.APP_MODE).professionals
  if (limit === null) return
  const usage = await accountUsage(root.id)
  if (usage.professionals >= limit) {
    const plan = root.subscription?.plan ?? 'essencial'
    throw paymentRequired(
      limitMessage(limit === 1 ? 'profissional' : 'profissionais', limit, plan),
      'LIMITE_PROFISSIONAIS',
    )
  }
}

/** Barra uma unidade a mais além do limite do plano. */
export async function assertCanAddLocation(rootId: string) {
  const root = await loadRoot(rootId)
  const limit = planLimits(root.subscription, env.APP_MODE).locations
  if (limit === null) return
  const usage = await accountUsage(root.id)
  if (usage.locations >= limit) {
    const plan = root.subscription?.plan ?? 'essencial'
    throw paymentRequired(
      limitMessage(limit === 1 ? 'unidade' : 'unidades', limit, plan),
      'LIMITE_UNIDADES',
    )
  }
}

/** Troca para um plano menor só se o uso atual couber nele. */
export async function assertPlanFits(rootId: string, plan: PlanId) {
  const usage = await accountUsage(rootId)
  const l = PLANS[plan].limits
  const tooMany: string[] = []
  if (l.locations !== null && usage.locations > l.locations)
    tooMany.push(`${usage.locations} unidades (o limite é ${l.locations})`)
  if (l.professionals !== null && usage.professionals > l.professionals)
    tooMany.push(`${usage.professionals} profissionais ativos (o limite é ${l.professionals})`)
  if (tooMany.length)
    throw paymentRequired(
      `O plano ${PLANS[plan].name} não comporta o que você usa hoje: ${tooMany.join(' e ')}. Desative o excedente ou escolha o ${PLANS[minPlanFor(usage)].name}.`,
      'PLANO_PEQUENO',
    )
}
