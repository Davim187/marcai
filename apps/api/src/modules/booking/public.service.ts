import { ACCOUNT_SUB_INCLUDE, withAccountSub } from '../../lib/account'
import { activePrepaymentMethod } from '../prepayment/prepayment.service'
import type { Tenant } from '@prisma/client'
import { accessLevel } from '@marcai/shared'
import { env } from '../../config/env'
import { notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'

/** Resolve o estabelecimento público pelo slug (ou o único, no modo exclusivo). */
export async function resolvePublicTenant(slug: string) {
  const where =
    env.APP_MODE === 'single_tenant' &&
    env.SINGLE_TENANT_SLUG &&
    (slug === '_' || slug === env.SINGLE_TENANT_SLUG)
      ? { slug: env.SINGLE_TENANT_SLUG }
      : { slug }
  let tenant = await prisma.tenant.findUnique({ where, include: ACCOUNT_SUB_INCLUDE })
  if (!tenant && 'slug' in where) {
    // Link antigo: leva para o estabelecimento que trocou de endereço
    const old = await prisma.slugHistory.findUnique({
      where: { slug: where.slug },
      include: { tenant: { include: ACCOUNT_SUB_INCLUDE } },
    })
    tenant = old?.tenant ?? null
  }
  if (!tenant || tenant.deletedAt || !tenant.onboardingCompleted)
    throw notFound('Página não encontrada')
  tenant = withAccountSub(tenant)
  const available =
    !tenant.blocked && accessLevel(tenant.subscription, new Date(), env.APP_MODE) !== 'blocked'
  return { tenant: tenant as Tenant, available }
}

export async function publicProfile(tenant: Tenant, available: boolean) {
  const base = {
    slug: tenant.slug,
    name: tenant.name,
    bio: tenant.bio,
    logoUrl: tenant.logoUrl,
    coverUrl: tenant.coverUrl,
    coverPositionX: tenant.coverPositionX,
    coverPositionY: tenant.coverPositionY,
    coverZoom: tenant.coverZoom,
    faviconUrl: tenant.faviconUrl,
    primaryColor: tenant.primaryColor,
    address: tenant.address,
    city: tenant.city,
    instagram: tenant.instagram,
    whatsapp: tenant.whatsapp,
    timezone: tenant.timezone,
    cancellationPolicy: tenant.cancellationPolicy,
    cancelMinHours: tenant.cancelMinHours,
    maxAdvanceDays: tenant.maxAdvanceDays,
    whiteLabel: env.APP_MODE === 'single_tenant',
    // Sinal antecipado: a página avisa antes de confirmar quanto e como pagar
    prepayment: activePrepaymentMethod(tenant)
      ? {
          percent: tenant.prepaymentPercent,
          method: activePrepaymentMethod(tenant),
          holdMinutes: tenant.prepaymentHoldMinutes,
        }
      : null,
    available,
  }
  if (!available) return { ...base, categories: [], services: [], professionals: [], fields: [] }

  const [categories, services, professionals, fields] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.service.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        active: true,
        professionals: { some: { professional: { active: true, deletedAt: null } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
        priceFrom: true,
        photoUrl: true,
        professionals: { select: { professionalId: true } },
      },
    }),
    prisma.professional.findMany({
      where: { tenantId: tenant.id, deletedAt: null, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, bio: true, photoUrl: true },
    }),
    prisma.formField.findMany({
      where: { tenantId: tenant.id, deletedAt: null, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        label: true,
        type: true,
        required: true,
        helpText: true,
        appliesToAll: true,
        options: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } },
        services: { select: { serviceId: true } },
      },
    }),
  ])
  return {
    ...base,
    categories,
    services: services.map(({ professionals: p, ...s }) => ({
      ...s,
      professionalIds: p.map((x) => x.professionalId),
    })),
    professionals,
    fields: fields.map(({ services: s, ...f }) => ({
      ...f,
      serviceIds: s.map((x) => x.serviceId),
    })),
  }
}
