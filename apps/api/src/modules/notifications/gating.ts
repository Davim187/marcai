import type { Subscription, Tenant } from '@prisma/client'
import { accessLevel, type Feature, hasFeature } from '@marcai/shared'
import { env } from '../../config/env'

/** Feature gating aplicado às notificações (plano + assinatura em dia). */
export function canNotify(
  tenant: Tenant & { subscription: Subscription | null },
  feature: Feature,
) {
  if (tenant.blocked) return false
  if (accessLevel(tenant.subscription, new Date(), env.APP_MODE) === 'blocked') return false
  return hasFeature(tenant.subscription, feature, env.APP_MODE)
}
