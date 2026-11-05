import { accessLevel, effectivePlan, FEATURES, hasFeature, trialDaysLeft } from '@marcai/shared'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'

export function publicUrlFor(slug: string) {
  return env.APP_MODE === 'single_tenant' ? env.APP_URL : `${env.APP_URL}/${slug}`
}

export async function getTenantSummary(tenantId: string, userId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: true,
      members: { where: { userId } },
      _count: { select: { professionals: { where: { deletedAt: null, active: true } } } },
    },
  })
  if (!tenant || tenant.deletedAt) return null
  const sub = tenant.subscription
  const member = tenant.members[0]
  const access = tenant.blocked ? 'blocked' : accessLevel(sub, new Date(), env.APP_MODE)
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    businessType: tenant.businessType,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
    timezone: tenant.timezone,
    onboardingCompleted: tenant.onboardingCompleted,
    notifySound: tenant.notifySound,
    blocked: tenant.blocked,
    publicUrl: publicUrlFor(tenant.slug),
    role: member?.role ?? 'owner',
    professionalId: member?.professionalId ?? null,
    professionalsCount: tenant._count.professionals,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialDaysLeft: trialDaysLeft(sub),
          /** Já escolheu plano e forma de pagamento */
          billingType: sub.billingType,
        }
      : null,
    effectivePlan: effectivePlan(sub, env.APP_MODE),
    access,
    features: FEATURES.filter((f) => hasFeature(sub, f, env.APP_MODE)),
  }
}
export type TenantSummary = NonNullable<Awaited<ReturnType<typeof getTenantSummary>>>
