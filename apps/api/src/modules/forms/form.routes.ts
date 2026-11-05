import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { z } from 'zod'
import { formFieldSchema, MANICURE_FIELDS, reorderSchema } from '@marcai/shared'
import { notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { ctx, requireOwner, requireTenant } from '../../plugins/auth'
import { createPresetFields } from '../tenants/tenant.service'
import { idParam } from '../../lib/route-schemas'

export async function listFormFields(
  db: ReturnType<typeof ctx>['db'],
  opts: { onlyActive?: boolean } = {},
) {
  const fields = await db.formField.findMany({
    where: { deletedAt: null, ...(opts.onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } },
      services: { select: { serviceId: true } },
    },
  })
  return fields.map(({ services, ...f }) => ({
    ...f,
    serviceIds: services.map((s) => s.serviceId),
  }))
}

export const formRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/fields',
    { onRequest: requireTenant, schema: { tags: ['formulário'] } },
    async (request) => listFormFields(ctx(request).db),
  )

  async function save(
    request: { body: z.infer<typeof formFieldSchema> },
    c: ReturnType<typeof ctx>,
    id?: string,
  ) {
    const { options, serviceIds, ...data } = request.body
    const services = await c.db.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    })
    return prisma.$transaction(async (tx) => {
      let fieldId = id
      if (fieldId) {
        await tx.formField.update({ where: { id: fieldId, tenantId: c.tenantId }, data })
        await tx.formFieldOption.deleteMany({ where: { fieldId, tenantId: c.tenantId } })
        await tx.formFieldService.deleteMany({ where: { fieldId, tenantId: c.tenantId } })
      } else {
        const count = await tx.formField.count({ where: { tenantId: c.tenantId, deletedAt: null } })
        fieldId = (
          await tx.formField.create({ data: { ...data, tenantId: c.tenantId, sortOrder: count } })
        ).id
      }
      const needsOptions = data.type === 'single_select' || data.type === 'multi_select'
      if (needsOptions) {
        await tx.formFieldOption.createMany({
          data: options.map((label, i) => ({
            tenantId: c.tenantId,
            fieldId: fieldId!,
            label,
            sortOrder: i,
          })),
        })
      }
      if (!data.appliesToAll) {
        await tx.formFieldService.createMany({
          data: services.map((s) => ({ tenantId: c.tenantId, fieldId: fieldId!, serviceId: s.id })),
        })
      }
      return fieldId
    })
  }

  app.post(
    '/fields',
    { onRequest: requireOwner, schema: { tags: ['formulário'], body: formFieldSchema } },
    async (request, reply) => {
      const id = await save(request, ctx(request))
      return reply.status(201).send({ id })
    },
  )

  app.put(
    '/fields/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['formulário'], params: idParam, body: formFieldSchema },
    },
    async (request) => {
      const c = ctx(request)
      const f = await c.db.formField.findFirst({
        where: { id: request.params.id, deletedAt: null },
      })
      if (!f) throw notFound('Pergunta não encontrada')
      await save(request, c, f.id)
      return { ok: true }
    },
  )

  app.delete(
    '/fields/:id',
    { onRequest: requireOwner, schema: { tags: ['formulário'], params: idParam } },
    async (request) => {
      await ctx(request).db.formField.updateMany({
        where: { id: request.params.id },
        data: { deletedAt: new Date(), active: false },
      })
      return { ok: true }
    },
  )

  app.put(
    '/fields-order',
    { onRequest: requireOwner, schema: { tags: ['formulário'], body: reorderSchema } },
    async (request) => {
      const { db } = ctx(request)
      await Promise.all(
        request.body.ids.map((id, i) =>
          db.formField.updateMany({ where: { id }, data: { sortOrder: i } }),
        ),
      )
      return { ok: true }
    },
  )

  app.post(
    '/presets/manicure',
    {
      onRequest: requireOwner,
      schema: { tags: ['formulário'], summary: 'Adiciona o preset de manicure' },
    },
    async (request) => {
      const c = ctx(request)
      const existing = await c.db.formField.findMany({
        where: { deletedAt: null },
        select: { label: true },
      })
      const labels = new Set(existing.map((e) => e.label.toLowerCase()))
      const toCreate = MANICURE_FIELDS.filter((f) => !labels.has(f.label.toLowerCase()))
      await prisma.$transaction((tx) =>
        createPresetFields(tx, c.tenantId, toCreate, existing.length),
      )
      return { created: toCreate.length }
    },
  )
}
