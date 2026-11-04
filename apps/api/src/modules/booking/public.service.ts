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
  const tenant = await prisma.tenant.findUnique({ where, include: { subscription: true } })
  if (!tenant || tenant.deletedAt || !tenant.onboardingCompleted)
    throw notFound('Página não encontrada')
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
