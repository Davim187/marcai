import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { customerSchema, formatPhone, normalizeBrazilianMobile } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { toCsv } from '../../lib/csv'
import { conflict, notFound } from '../../lib/errors'
import { ctx, requireOwner, requireTenant, type TenantContext } from '../../plugins/auth'
import { bookingInclude, scopeWhere } from '../booking/panel.routes'
import {
  anonymizeCustomer,
  customerStats,
  importCustomersCsv,
  upsertCustomerByPhone,
} from './customer.service'

const idParam = z.object({ id: z.string() })

/**
 * Profissional (sem acesso total) só enxerga clientes que já agendaram com ela.
 * Exportar, importar, editar e excluir é só para a gestão.
 */
function customerScope(c: TenantContext): Prisma.CustomerWhereInput {
  const bookingScope = scopeWhere(c)
  return Object.keys(bookingScope).length ? { bookings: { some: bookingScope } } : {}
}

const listQuery = z.object({
  q: z.string().max(80).optional(),
  tag: z.string().max(30).optional(),
  sort: z.enum(['name', 'recent', 'spent']).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
})

export const customerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { onRequest: requireTenant, schema: { tags: ['clientes'], querystring: listQuery } },
    async (request) => {
      const c = ctx(request)
      const { q, tag, sort, page, pageSize } = request.query
      const digits = q?.replace(/\D/g, '') ?? ''
      const where: Prisma.CustomerWhereInput = {
        deletedAt: null,
        ...customerScope(c),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      }
      const skip = (page - 1) * pageSize
      let pageCustomers
      if (sort === 'spent') {
        // Ordena pelo total gasto direto no banco e só depois carrega a página.
        const ranking = await c.db.booking.groupBy({
          by: ['customerId'],
          where: { status: 'completed', customer: where },
          _sum: { priceCents: true },
          orderBy: { _sum: { priceCents: 'desc' } },
        })
        const rankedIds = ranking.map((r) => r.customerId)
        const others = await c.db.customer.findMany({
          where: { ...where, id: { notIn: rankedIds } },
          select: { id: true },
          orderBy: { name: 'asc' },
        })
        const pageIds = [...rankedIds, ...others.map((o) => o.id)].slice(skip, skip + pageSize)
        const rows = await c.db.customer.findMany({ where: { id: { in: pageIds } } })
        pageCustomers = pageIds.map((id) => rows.find((r) => r.id === id)!).filter(Boolean)
      } else {
        pageCustomers = await c.db.customer.findMany({
          where,
          orderBy: sort === 'recent' ? { createdAt: 'desc' } : { name: 'asc' },
          skip,
          take: pageSize,
        })
      }
      const [total, stats, tagRows] = await Promise.all([
        c.db.customer.count({ where }),
        customerStats(
          c.db,
          pageCustomers.map((p) => p.id),
        ),
        c.db.customer.findMany({
          where: { deletedAt: null, ...customerScope(c), NOT: { tags: { isEmpty: true } } },
          select: { tags: true },
        }),
      ])
      return {
        items: pageCustomers.map((p) => ({ ...p, stats: stats.get(p.id)! })),
        total,
        page,
        pageSize,
        allTags: [...new Set(tagRows.flatMap((t) => t.tags))].sort(),
      }
    },
  )

  app.get(
    '/export.csv',
    { onRequest: requireOwner, schema: { tags: ['clientes'], summary: 'Exporta clientes em CSV' } },
    async (request, reply) => {
      const { db, tenantId } = ctx(request)
      const list = await db.customer.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      })
      const stats = await customerStats(
        db,
        list.map((customer) => customer.id),
      )
      const csv = toCsv(
        list.map((customer) => {
          const s = stats.get(customer.id)!
          return {
            name: customer.name,
            phone: formatPhone(customer.phone),
            email: customer.email,
            tags: customer.tags.join(', '),
            notes: customer.notes,
            visits: s.visits,
            spent: (s.totalSpentCents / 100).toFixed(2).replace('.', ','),
            noShows: s.noShows,
            lastVisit: s.lastVisit?.toISOString().slice(0, 10) ?? '',
          }
        }),
        [
          { key: 'name', label: 'Nome' },
          { key: 'phone', label: 'WhatsApp' },
          { key: 'email', label: 'E-mail' },
          { key: 'tags', label: 'Tags' },
          { key: 'notes', label: 'Observações' },
          { key: 'visits', label: 'Atendimentos' },
          { key: 'spent', label: 'Total gasto (R$)' },
          { key: 'noShows', label: 'Faltas' },
          { key: 'lastVisit', label: 'Último atendimento' },
        ],
      )
      await audit({ action: 'customers.exported', tenantId, actorUserId: request.auth!.user.id })
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="clientes.csv"')
        .send(csv)
    },
  )

  app.post(
    '/import',
    {
      onRequest: requireOwner,
      schema: {
        tags: ['clientes'],
        summary: 'Importa clientes de CSV (nome; whatsapp; e-mail; tags; observações)',
        body: z.object({ csv: z.string().max(2_000_000) }),
      },
    },
    async (request) => {
      const { db, tenantId } = ctx(request)
      const result = await importCustomersCsv(db, request.body.csv)
      await audit({
        action: 'customers.imported',
        tenantId,
        actorUserId: request.auth!.user.id,
        metadata: { created: result.created, updated: result.updated },
      })
      return result
    },
  )

  app.get(
    '/:id',
    { onRequest: requireTenant, schema: { tags: ['clientes'], params: idParam } },
    async (request) => {
      const c = ctx(request)
      const customer = await c.db.customer.findFirst({
        where: { id: request.params.id, deletedAt: null, ...customerScope(c) },
      })
      if (!customer) throw notFound('Cliente não encontrado')
      const [stats, bookings] = await Promise.all([
        customerStats(c.db, [customer.id]),
        c.db.booking.findMany({
          where: { customerId: customer.id, ...scopeWhere(c) },
          include: bookingInclude,
          orderBy: { startsAt: 'desc' },
          take: 100,
        }),
      ])
      return { ...customer, stats: stats.get(customer.id), bookings }
    },
  )

  app.post(
    '/',
    { onRequest: requireOwner, schema: { tags: ['clientes'], body: customerSchema } },
    async (request, reply) => {
      const { db } = ctx(request)
      const { phone, ...fields } = request.body
      const { customer } = await upsertCustomerByPhone(db, phone, fields, 'unique')
      return reply.status(201).send(customer)
    },
  )

  app.put(
    '/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['clientes'], params: idParam, body: customerSchema },
    },
    async (request) => {
      const { db } = ctx(request)
      const phone = normalizeBrazilianMobile(request.body.phone)!
      const duplicate = await db.customer.findFirst({
        where: { phone, id: { not: request.params.id } },
      })
      if (duplicate) throw conflict('Já existe outro cliente com esse WhatsApp')
      const res = await db.customer.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: {
          ...request.body,
          phone,
          email: request.body.email || null,
          birthday: request.body.birthday || null,
        },
      })
      if (!res.count) throw notFound('Cliente não encontrado')
      return { ok: true }
    },
  )

  /** LGPD: exportação dos dados do cliente. */
  app.get(
    '/:id/export',
    { onRequest: requireOwner, schema: { tags: ['clientes'], params: idParam } },
    async (request, reply) => {
      const { db, tenantId } = ctx(request)
      const customer = await db.customer.findFirst({
        where: { id: request.params.id },
        include: { bookings: { include: { answers: true }, orderBy: { startsAt: 'desc' } } },
      })
      if (!customer) throw notFound('Cliente não encontrado')
      await audit({
        action: 'customer.data_exported',
        tenantId,
        actorUserId: request.auth!.user.id,
        entity: 'Customer',
        entityId: customer.id,
      })
      return reply
        .header('content-disposition', `attachment; filename="dados-${customer.id}.json"`)
        .send(customer)
    },
  )

  /** LGPD: exclusão — anonimiza os dados pessoais e mantém só o histórico financeiro. */
  app.delete(
    '/:id',
    { onRequest: requireOwner, schema: { tags: ['clientes'], params: idParam } },
    async (request) => {
      const { db, tenantId } = ctx(request)
      const customer = await db.customer.findFirst({
        where: { id: request.params.id, deletedAt: null },
      })
      if (!customer) throw notFound('Cliente não encontrado')
      await anonymizeCustomer(db, customer.id)
      await audit({
        action: 'customer.deleted',
        tenantId,
        actorUserId: request.auth!.user.id,
        entity: 'Customer',
        entityId: customer.id,
      })
      return { ok: true }
    },
  )
}
