import type { Tenant } from '@prisma/client'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  bookingRulesSchema,
  isValidSlug,
  normalizeBrazilianMobile,
  onboardingSchema,
  slugify,
  tenantProfileSchema,
} from '@marcai/shared'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, paymentRequired } from '../../lib/errors'
import { accountRootId, assertCanAddLocation, assertCanAddProfessional } from '../../lib/account'
import { prisma } from '../../lib/prisma'
import { ctx, requireAuth, requireOwner, requireTenant } from '../../plugins/auth'
import { createTenantFromOnboarding, isSlugAvailable, loadNationalHolidays } from './tenant.service'
import { publicUrlFor } from './tenant.summary'

/** Dados do estabelecimento para o painel: nunca devolve segredos (token do Mercado Pago). */
function forPanel<T extends Tenant>(tenant: T) {
  const { mpAccessTokenEnc, blocked: _b, blockedReason: _r, deletedAt: _d, ...rest } = tenant
  return { ...rest, mpConnected: !!mpAccessTokenEnc, publicUrl: publicUrlFor(tenant.slug) }
}

export const tenantRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/slug-availability',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['tenant'],
        summary: 'Checa se um link está livre',
        querystring: z.object({ slug: z.string().max(60) }),
      },
    },
    async (request) => {
      const slug = slugify(request.query.slug)
      const valid = isValidSlug(slug)
      const available = valid && (await isSlugAvailable(slug, request.auth?.tenantId ?? undefined))
      let suggestion: string | null = null
      if (!available && slug.length >= 2) {
        for (const suffix of ['', '-studio', '-beauty', '-oficial', '1', '2']) {
          const candidate = slugify(`${slug}${suffix}`)
          if (candidate !== slug && (await isSlugAvailable(candidate))) {
            suggestion = candidate
            break
          }
        }
      }
      return { slug, valid, available, suggestion }
    },
  )

  app.post(
    '/onboarding',
    {
      onRequest: requireAuth,
      schema: {
        tags: ['tenant'],
        summary: 'Cria o estabelecimento (wizard)',
        body: onboardingSchema,
      },
    },
    async (request, reply) => {
      if (env.APP_MODE === 'single_tenant') throw forbidden('Cadastro desativado nesta instalação')
      const tenant = await createTenantFromOnboarding(request.auth!.user.id, request.body)
      await prisma.session.update({
        where: { id: request.auth!.sessionId },
        data: { tenantId: tenant.id },
      })
      await audit({
        action: 'tenant.created',
        tenantId: tenant.id,
        actorUserId: request.auth!.user.id,
      })
      return reply
        .status(201)
        .send({ id: tenant.id, slug: tenant.slug, publicUrl: publicUrlFor(tenant.slug) })
    },
  )

  app.get(
    '/',
    { onRequest: requireTenant, schema: { tags: ['tenant'], summary: 'Dados do estabelecimento' } },
    async (request) => {
      return forPanel(ctx(request).tenant)
    },
  )

  app.put(
    '/profile',
    {
      onRequest: requireOwner,
      schema: {
        tags: ['tenant'],
        summary: 'Aparência e dados públicos',
        body: tenantProfileSchema,
      },
    },
    async (request) => {
      const { tenantId } = ctx(request)
      const b = request.body
      const instagram =
        b.instagram
          ?.replace(/^@/, '')
          .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
          .replace(/\/$/, '') || null
      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...b,
          instagram,
          whatsapp: b.whatsapp ? normalizeBrazilianMobile(b.whatsapp) : null,
        },
      })
      return forPanel(updated)
    },
  )

  app.put(
    '/slug',
    { onRequest: requireOwner, schema: { tags: ['tenant'], body: z.object({ slug: z.string() }) } },
    async (request) => {
      const { tenantId } = ctx(request)
      const slug = slugify(request.body.slug)
      if (!(await isSlugAvailable(slug, tenantId))) throw forbidden('Esse link não está disponível')
      const current = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
      if (current.slug !== slug) {
        await prisma.$transaction([
          // O link antigo (bio do Instagram, cartões...) continua levando para cá
          prisma.slugHistory.upsert({
            where: { slug: current.slug },
            create: { slug: current.slug, tenantId },
            update: { tenantId, createdAt: new Date() },
          }),
          prisma.slugHistory.deleteMany({ where: { slug } }),
          prisma.tenant.update({ where: { id: tenantId }, data: { slug } }),
        ])
        await audit({
          action: 'tenant.slug_changed',
          tenantId,
          actorUserId: request.auth!.user.id,
          metadata: { from: current.slug, to: slug },
        })
      }
      return { slug, publicUrl: publicUrlFor(slug) }
    },
  )

  app.put(
    '/booking-rules',
    {
      onRequest: requireOwner,
      schema: {
        tags: ['tenant'],
        summary: 'Regras de agendamento e cancelamento',
        body: bookingRulesSchema,
      },
    },
    async (request) => {
      const { tenantId, tenant, db } = ctx(request)
      const b = request.body
      const pixKey = b.pixKey === undefined ? tenant.pixKey : b.pixKey || null
      const method = b.prepaymentMethod ?? tenant.prepaymentMethod
      if (b.requirePrepayment && !tenant.requirePrepayment && !ctx(request).can('prepayment'))
        throw paymentRequired(
          'O sinal antecipado é do plano Premium. Mude de plano para ativar.',
          'PLANO',
        )
      if (b.requirePrepayment) {
        if (method === 'pix_manual' && !pixKey)
          throw badRequest('Informe a chave PIX que vai receber o sinal.', 'PIX_SEM_CHAVE')
        if (method === 'mercadopago' && !tenant.mpAccessTokenEnc)
          throw badRequest(
            'Conecte sua conta do Mercado Pago antes de cobrar o sinal por lá.',
            'MP_NAO_CONECTADO',
          )
      }
      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...b,
          ...(b.pixKey !== undefined ? { pixKey } : {}),
          ...(b.pixKeyHolder !== undefined ? { pixKeyHolder: b.pixKeyHolder || null } : {}),
        },
      })
      if (request.body.loadHolidays) {
        await prisma.$transaction((tx) => loadNationalHolidays(tx, tenantId))
      } else {
        await db.holiday.deleteMany({ where: { source: 'national' } })
      }
      return forPanel(updated)
    },
  )

  /** Unidades da conta (principal + extras). Todas usam a assinatura da principal. */
  app.get(
    '/units',
    { onRequest: requireOwner, schema: { tags: ['tenant'], summary: 'Unidades da conta' } },
    async (request) => {
      const { tenant } = ctx(request)
      const rootId = accountRootId(tenant)
      const units = await prisma.tenant.findMany({
        where: { OR: [{ id: rootId }, { parentTenantId: rootId }], deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          parentTenantId: true,
          _count: { select: { professionals: { where: { deletedAt: null, active: true } } } },
          members: { where: { userId: request.auth!.user.id }, select: { role: true } },
        },
      })
      return units.map((u) => ({
        id: u.id,
        name: u.name,
        slug: u.slug,
        city: u.city,
        isMain: !u.parentTenantId,
        current: u.id === tenant.id,
        professionals: u._count.professionals,
        canEnter: u.members.length > 0,
        publicUrl: publicUrlFor(u.slug),
      }))
    },
  )

  app.post(
    '/units',
    {
      onRequest: requireOwner,
      schema: {
        tags: ['tenant'],
        summary: 'Cria uma unidade extra na mesma assinatura',
        body: onboardingSchema,
      },
    },
    async (request, reply) => {
      if (env.APP_MODE === 'single_tenant') throw forbidden('Unidades desativadas nesta instalação')
      const { tenant } = ctx(request)
      const userId = request.auth!.user.id
      const rootId = accountRootId(tenant)
      const ownerOfRoot = await prisma.tenantMember.findFirst({
        where: { tenantId: rootId, userId, role: 'owner', acceptedAt: { not: null } },
      })
      if (!ownerOfRoot) throw forbidden('Só a dona da unidade principal cria novas unidades')
      await assertCanAddLocation(rootId)
      // A unidade nova já nasce com a dona como profissional
      await assertCanAddProfessional({ id: rootId, parentTenantId: null })
      const unit = await createTenantFromOnboarding(userId, request.body, {
        parentTenantId: rootId,
      })
      await prisma.session.update({
        where: { id: request.auth!.sessionId },
        data: { tenantId: unit.id },
      })
      await audit({
        action: 'tenant.unit_created',
        tenantId: unit.id,
        actorUserId: userId,
        metadata: { rootId, slug: unit.slug },
      })
      return reply
        .status(201)
        .send({ id: unit.id, slug: unit.slug, publicUrl: publicUrlFor(unit.slug) })
    },
  )
}
