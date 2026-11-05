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
import { forbidden } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { ctx, requireAuth, requireOwner, requireTenant } from '../../plugins/auth'
import { createTenantFromOnboarding, isSlugAvailable, loadNationalHolidays } from './tenant.service'
import { publicUrlFor } from './tenant.summary'

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
      const { tenant } = ctx(request)
      const { blocked: _b, blockedReason: _r, deletedAt: _d, ...rest } = tenant
      return { ...rest, publicUrl: publicUrlFor(tenant.slug) }
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
      return prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...b,
          instagram,
          whatsapp: b.whatsapp ? normalizeBrazilianMobile(b.whatsapp) : null,
        },
      })
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
      const { tenantId, db } = ctx(request)
      const updated = await prisma.tenant.update({ where: { id: tenantId }, data: request.body })
      if (request.body.loadHolidays) {
        await prisma.$transaction((tx) => loadNationalHolidays(tx, tenantId))
      } else {
        await db.holiday.deleteMany({ where: { source: 'national' } })
      }
      return updated
    },
  )
}
