import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { categorySchema, reorderSchema, serviceSchema } from '@marcai/shared'
import { badRequest, notFound } from '../../lib/errors'
import { ctx, requireOwner, requireTenant } from '../../plugins/auth'
import { idParam } from '../../lib/route-schemas'

export const serviceRoutes: FastifyPluginAsyncZod = async (app) => {
  // ---------- Categorias ----------
  app.get(
    '/categories',
    { onRequest: requireTenant, schema: { tags: ['serviços'] } },
    async (request) => {
      return ctx(request).db.serviceCategory.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      })
    },
  )

  app.post(
    '/categories',
    { onRequest: requireOwner, schema: { tags: ['serviços'], body: categorySchema } },
    async (request, reply) => {
      const { db } = ctx(request)
      const count = await db.serviceCategory.count({ where: { deletedAt: null } })
      const cat = await db.serviceCategory.create({
        data: { tenantId: db.$tenantId(), name: request.body.name, sortOrder: count },
      })
      return reply.status(201).send(cat)
    },
  )

  app.put(
    '/categories/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['serviços'], params: idParam, body: categorySchema },
    },
    async (request) => {
      const { db } = ctx(request)
      const res = await db.serviceCategory.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: { name: request.body.name },
      })
      if (!res.count) throw notFound('Categoria não encontrada')
      return { ok: true }
    },
  )

  app.delete(
    '/categories/:id',
    { onRequest: requireOwner, schema: { tags: ['serviços'], params: idParam } },
    async (request) => {
      const { db } = ctx(request)
      await db.service.updateMany({
        where: { categoryId: request.params.id },
        data: { categoryId: null },
      })
      await db.serviceCategory.updateMany({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      })
      return { ok: true }
    },
  )

  app.put(
    '/categories-order',
    { onRequest: requireOwner, schema: { tags: ['serviços'], body: reorderSchema } },
    async (request) => {
      const { db } = ctx(request)
      await Promise.all(
        request.body.ids.map((id, i) =>
          db.serviceCategory.updateMany({ where: { id }, data: { sortOrder: i } }),
        ),
      )
      return { ok: true }
    },
  )

  // ---------- Serviços ----------
  app.get(
    '/',
    { onRequest: requireTenant, schema: { tags: ['serviços'], summary: 'Lista os serviços' } },
    async (request) => {
      const services = await ctx(request).db.service.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { professionals: { select: { professionalId: true } } },
      })
      return services.map(({ professionals, ...s }) => ({
        ...s,
        professionalIds: professionals.map((p) => p.professionalId),
      }))
    },
  )

  app.post(
    '/',
    { onRequest: requireOwner, schema: { tags: ['serviços'], body: serviceSchema } },
    async (request, reply) => {
      const { db, tenantId } = ctx(request)
      const { professionalIds, ...data } = request.body
      const count = await db.service.count({ where: { deletedAt: null } })
      let profIds = professionalIds
      if (!profIds?.length) {
        profIds = (
          await db.professional.findMany({ where: { deletedAt: null }, select: { id: true } })
        ).map((p) => p.id)
      }
      await assertCategory(db, data.categoryId)
      const valid = await db.professional.findMany({
        where: { id: { in: profIds }, deletedAt: null },
        select: { id: true },
      })
      const service = await db.service.create({
        data: {
          ...data,
          tenantId,
          sortOrder: count,
          professionals: { create: valid.map((p) => ({ tenantId, professionalId: p.id })) },
        },
      })
      return reply.status(201).send(service)
    },
  )

  app.put(
    '/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['serviços'], params: idParam, body: serviceSchema },
    },
    async (request) => {
      const { db, tenantId } = ctx(request)
      const { professionalIds, ...data } = request.body
      const existing = await db.service.findFirst({
        where: { id: request.params.id, deletedAt: null },
      })
      if (!existing) throw notFound('Serviço não encontrado')
      await assertCategory(db, data.categoryId)
      // Serviço ativo sem ninguém que faça some da página pública sem aviso: recusa
      if (professionalIds && !professionalIds.length && (data.active ?? existing.active))
        throw badRequest(
          'Escolha pelo menos um profissional. Para tirar o serviço da página, desative o serviço.',
          'SERVICO_SEM_PROFISSIONAL',
        )
      await db.service.update({ where: { id: existing.id }, data })
      if (professionalIds) {
        const valid = await db.professional.findMany({
          where: { id: { in: professionalIds }, deletedAt: null },
          select: { id: true },
        })
        await db.professionalService.deleteMany({ where: { serviceId: existing.id } })
        await db.professionalService.createMany({
          data: valid.map((p) => ({ tenantId, serviceId: existing.id, professionalId: p.id })),
        })
      }
      return { ok: true }
    },
  )

  app.patch(
    '/:id/active',
    {
      onRequest: requireOwner,
      schema: { tags: ['serviços'], params: idParam, body: z.object({ active: z.boolean() }) },
    },
    async (request) => {
      const res = await ctx(request).db.service.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: { active: request.body.active },
      })
      if (!res.count) throw notFound('Serviço não encontrado')
      return { ok: true }
    },
  )

  /** Soft delete: o histórico de agendamentos continua apontando para o serviço. */
  app.delete(
    '/:id',
    { onRequest: requireOwner, schema: { tags: ['serviços'], params: idParam } },
    async (request) => {
      const res = await ctx(request).db.service.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: { deletedAt: new Date(), active: false },
      })
      if (!res.count) throw notFound('Serviço não encontrado')
      return { ok: true }
    },
  )

  app.put(
    '/order',
    { onRequest: requireOwner, schema: { tags: ['serviços'], body: reorderSchema } },
    async (request) => {
      const { db } = ctx(request)
      await Promise.all(
        request.body.ids.map((id, i) =>
          db.service.updateMany({ where: { id }, data: { sortOrder: i } }),
        ),
      )
      return { ok: true }
    },
  )
}

async function assertCategory(
  db: ReturnType<typeof ctx>['db'],
  categoryId: string | null | undefined,
) {
  if (!categoryId) return
  const c = await db.serviceCategory.findFirst({ where: { id: categoryId, deletedAt: null } })
  if (!c) throw notFound('Categoria não encontrada')
}
