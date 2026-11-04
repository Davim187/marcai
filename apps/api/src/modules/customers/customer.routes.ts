import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { customerSchema, formatPhone, normalizeBrazilianMobile } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { parseCsv, toCsv } from '../../lib/csv'
import { conflict, notFound } from '../../lib/errors'
import { ctx, requireTenant } from '../../plugins/auth'
import { bookingInclude, scopeWhere } from '../booking/panel.routes'
import { customerStats } from './customer.service'

const idParam = z.object({ id: z.string() })

export const customerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireTenant)

  app.get(
    '/',
    {
      schema: {
        tags: ['clientes'],
        querystring: z.object({
          q: z.string().max(80).optional(),
          tag: z.string().max(30).optional(),
          sort: z.enum(['name', 'recent', 'spent']).default('name'),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(30),
        }),
      },
    },
    async (request) => {
      const { db } = ctx(request)
      const { q, tag, sort, page, pageSize } = request.query
      const digits = q?.replace(/\D/g, '') ?? ''
      const where: Prisma.CustomerWhereInput = {
        deletedAt: null,
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
      const [all, total] = await Promise.all([
        db.customer.findMany({
          where,
          orderBy: sort === 'recent' ? { createdAt: 'desc' } : { name: 'asc' },
          ...(sort === 'spent' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
        }),
        db.customer.count({ where }),
      ])
      const stats = await customerStats(
        db,
        all.map((c) => c.id),
      )
      let items = all.map((c) => ({ ...c, stats: stats.get(c.id)! }))
      if (sort === 'spent') {
        items = items
          .sort((a, b) => b.stats.totalSpentCents - a.stats.totalSpentCents)
          .slice((page - 1) * pageSize, page * pageSize)
      }
      const tags = await db.customer.findMany({
        where: { deletedAt: null, NOT: { tags: { isEmpty: true } } },
        select: { tags: true },
      })
      return {
        items,
        total,
        page,
        pageSize,
        allTags: [...new Set(tags.flatMap((t) => t.tags))].sort(),
      }
    },
  )

  app.get(
    '/export.csv',
    { schema: { tags: ['clientes'], summary: 'Exporta clientes em CSV' } },
    async (request, reply) => {
      const { db, tenantId } = ctx(request)
      const list = await db.customer.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      })
      const stats = await customerStats(
        db,
        list.map((c) => c.id),
      )
      const csv = toCsv(
        list.map((c) => {
          const s = stats.get(c.id)!
          return {
            name: c.name,
            phone: formatPhone(c.phone),
            email: c.email,
            tags: c.tags.join(', '),
            notes: c.notes,
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
      schema: {
        tags: ['clientes'],
        summary: 'Importa clientes de CSV (nome; whatsapp; e-mail; tags; observações)',
        body: z.object({ csv: z.string().max(2_000_000) }),
      },
    },
    async (request) => {
      const { db } = ctx(request)
      const rows = parseCsv(request.body.csv)
      if (!rows.length) return { created: 0, updated: 0, skipped: 0, errors: [] }
      const header = rows[0]!.map((h) =>
        h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      )
      const hasHeader = header.some((h) =>
        ['nome', 'name', 'whatsapp', 'telefone', 'celular', 'phone'].includes(h),
      )
      const col = (names: string[], fallback: number) => {
        const i = header.findIndex((h) => names.includes(h))
        return hasHeader ? i : fallback
      }
      const iName = col(['nome', 'name'], 0)
      const iPhone = col(['whatsapp', 'telefone', 'celular', 'phone'], 1)
      const iEmail = col(['e-mail', 'email'], 2)
      const iTags = col(['tags', 'etiquetas'], 3)
      const iNotes = col(['observacoes', 'notas', 'notes'], 4)
      let created = 0
      let updated = 0
      const errors: string[] = []
      for (const [n, r] of rows.slice(hasHeader ? 1 : 0).entries()) {
        const line = n + (hasHeader ? 2 : 1)
        const name = r[iName]?.trim()
        const phone = normalizeBrazilianMobile(r[iPhone] ?? '')
        if (!name || !phone) {
          errors.push(`Linha ${line}: nome ou WhatsApp inválido`)
          continue
        }
        const data = {
          name,
          email: iEmail >= 0 ? r[iEmail]?.trim() || null : null,
          tags:
            iTags >= 0
              ? (r[iTags] ?? '')
                  .split(/[,|]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 20)
              : [],
          notes: iNotes >= 0 ? r[iNotes]?.trim() || null : null,
        }
        const existing = await db.customer.findFirst({ where: { phone } })
        if (existing) {
          await db.customer.update({
            where: { id: existing.id },
            data: { ...data, deletedAt: null },
          })
          updated++
        } else {
          await db.customer.create({ data: { ...data, phone } as never })
          created++
        }
      }
      return { created, updated, skipped: errors.length, errors: errors.slice(0, 20) }
    },
  )

  app.get('/:id', { schema: { tags: ['clientes'], params: idParam } }, async (request) => {
    const c = ctx(request)
    const customer = await c.db.customer.findFirst({
      where: { id: request.params.id, deletedAt: null },
    })
    if (!customer) throw notFound('Cliente não encontrada')
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
  })

  app.post(
    '/',
    { schema: { tags: ['clientes'], body: customerSchema } },
    async (request, reply) => {
      const { db } = ctx(request)
      const phone = normalizeBrazilianMobile(request.body.phone)!
      const existing = await db.customer.findFirst({ where: { phone } })
      if (existing && !existing.deletedAt) throw conflict('Já existe uma cliente com esse WhatsApp')
      const data = {
        ...request.body,
        phone,
        email: request.body.email || null,
        birthday: request.body.birthday || null,
      }
      const customer = existing
        ? await db.customer.update({
            where: { id: existing.id },
            data: { ...data, deletedAt: null },
          })
        : await db.customer.create({ data: data as never })
      return reply.status(201).send(customer)
    },
  )

  app.put(
    '/:id',
    { schema: { tags: ['clientes'], params: idParam, body: customerSchema } },
    async (request) => {
      const { db } = ctx(request)
      const phone = normalizeBrazilianMobile(request.body.phone)!
      const dup = await db.customer.findFirst({ where: { phone, id: { not: request.params.id } } })
      if (dup) throw conflict('Já existe outra cliente com esse WhatsApp')
      const res = await db.customer.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: {
          ...request.body,
          phone,
          email: request.body.email || null,
          birthday: request.body.birthday || null,
        },
      })
      if (!res.count) throw notFound('Cliente não encontrada')
      return { ok: true }
    },
  )

  /** LGPD: exportação dos dados da cliente. */
  app.get(
    '/:id/export',
    { schema: { tags: ['clientes'], params: idParam } },
    async (request, reply) => {
      const { db, tenantId } = ctx(request)
      const customer = await db.customer.findFirst({
        where: { id: request.params.id },
        include: { bookings: { include: { answers: true }, orderBy: { startsAt: 'desc' } } },
      })
      if (!customer) throw notFound('Cliente não encontrada')
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
  app.delete('/:id', { schema: { tags: ['clientes'], params: idParam } }, async (request) => {
    const { db, tenantId } = ctx(request)
    const customer = await db.customer.findFirst({
      where: { id: request.params.id, deletedAt: null },
    })
    if (!customer) throw notFound('Cliente não encontrada')
    await db.booking.updateMany({
      where: {
        customerId: customer.id,
        status: { in: ['pending', 'confirmed'] },
        startsAt: { gte: new Date() },
      },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
        canceledBy: 'professional',
        cancelReason: 'Cliente removida',
      },
    })
    await db.bookingFieldAnswer.deleteMany({ where: { booking: { customerId: customer.id } } })
    await db.booking.updateMany({ where: { customerId: customer.id }, data: { notes: null } })
    await db.customer.update({
      where: { id: customer.id },
      data: {
        name: 'Cliente removida',
        phone: `removida-${customer.id}`,
        email: null,
        notes: null,
        tags: [],
        birthday: null,
        deletedAt: new Date(),
      },
    })
    await audit({
      action: 'customer.deleted',
      tenantId,
      actorUserId: request.auth!.user.id,
      entity: 'Customer',
      entityId: customer.id,
    })
    return { ok: true }
  })
}
