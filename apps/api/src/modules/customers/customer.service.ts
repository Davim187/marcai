import type { Prisma } from '@prisma/client'
import { emailSchema, normalizeBrazilianMobile, OPEN_BOOKING_STATUSES } from '@marcai/shared'
import { badRequest, conflict } from '../../lib/errors'
import { parseCsv } from '../../lib/csv'
import type { TenantDb } from '../../lib/tenant-db'
import { prisma } from '../../lib/prisma'
import { deletePrivateFiles } from '../uploads/private-cleanup'

export interface CustomerStats {
  totalSpentCents: number
  visits: number
  noShows: number
  cancellations: number
  lastVisit: Date | null
  nextVisit: Date | null
}

/** Estatísticas por cliente a partir dos agendamentos (uma consulta agregada por status). */
export async function customerStats(
  db: TenantDb,
  customerIds: string[],
): Promise<Map<string, CustomerStats>> {
  const map = new Map<string, CustomerStats>()
  if (!customerIds.length) return map
  const now = new Date()
  const [byStatus, last, next] = await Promise.all([
    db.booking.groupBy({
      by: ['customerId', 'status'],
      where: { customerId: { in: customerIds } },
      _sum: { priceCents: true },
      _count: { _all: true },
    }),
    db.booking.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, status: 'completed' },
      _max: { startsAt: true },
    }),
    db.booking.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: customerIds },
        status: { in: [...OPEN_BOOKING_STATUSES] },
        startsAt: { gte: now },
      },
      _min: { startsAt: true },
    }),
  ])
  for (const id of customerIds)
    map.set(id, {
      totalSpentCents: 0,
      visits: 0,
      noShows: 0,
      cancellations: 0,
      lastVisit: null,
      nextVisit: null,
    })
  for (const r of byStatus) {
    const s = map.get(r.customerId)!
    if (r.status === 'completed') {
      s.visits = r._count._all
      s.totalSpentCents = r._sum.priceCents ?? 0
    }
    if (r.status === 'no_show') s.noShows = r._count._all
    if (r.status === 'canceled') s.cancellations = r._count._all
  }
  for (const r of last) map.get(r.customerId)!.lastVisit = r._max.startsAt
  for (const r of next) map.get(r.customerId)!.nextVisit = r._min.startsAt
  return map
}

// ---------------------------------------------------------------------------
// Cadastro de clientes: regra única para "buscar ou criar pelo telefone"
// ---------------------------------------------------------------------------

export interface CustomerFields {
  name?: string
  email?: string | null
  notes?: string | null
  tags?: string[]
  birthday?: string | null
}

/**
 * Políticas de "buscar ou criar" pelo WhatsApp:
 * - `reuse` (reserva pública e agendamento manual): reaproveita quem já existe **sem alterar**
 *   os dados dela (um visitante anônimo não pode trocar nome/e-mail de uma cliente);
 * - `merge` (importação): atualiza só os campos informados e não vazios;
 * - `unique` (cadastro manual): recusa se o telefone já existe.
 */
export async function upsertCustomerByPhone(
  db: TenantDb,
  phoneInput: string,
  fields: CustomerFields & { consent?: boolean },
  policy: 'reuse' | 'merge' | 'unique',
) {
  const phone = normalizeBrazilianMobile(phoneInput)
  if (!phone) throw badRequest('Informe um WhatsApp válido')
  const existing = await db.customer.findFirst({ where: { phone, deletedAt: null } })
  if (existing) {
    if (policy === 'unique') throw conflict('Já existe um cliente com esse WhatsApp')
    const data: Prisma.CustomerUpdateInput = {}
    // Uma reserva anônima com o telefone de alguém não registra consentimento em nome dela
    if (fields.consent && !existing.consentAt && policy !== 'reuse') data.consentAt = new Date()
    if (policy === 'merge') {
      if (fields.name) data.name = fields.name
      if (fields.email) data.email = fields.email
      if (fields.notes) data.notes = fields.notes
      if (fields.tags?.length)
        data.tags = [...new Set([...existing.tags, ...fields.tags])].slice(0, 20)
      if (fields.birthday) data.birthday = fields.birthday
    }
    const customer = Object.keys(data).length
      ? await db.customer.update({ where: { id: existing.id }, data })
      : existing
    return { customer, created: false }
  }
  if (!fields.name?.trim()) throw badRequest('Informe o nome do cliente')
  let customer
  try {
    customer = await db.customer.create({
      data: {
        tenantId: db.$tenantId(),
        phone,
        name: fields.name.trim(),
        email: fields.email || null,
        notes: fields.notes || null,
        tags: fields.tags ?? [],
        birthday: fields.birthday || null,
        consentAt: fields.consent ? new Date() : null,
      },
    })
  } catch (err) {
    // Duas reservas simultâneas de uma cliente nova: a outra criou o cadastro primeiro
    if ((err as { code?: string }).code === 'P2002' && policy !== 'unique')
      return upsertCustomerByPhone(db, phone, fields, policy)
    if ((err as { code?: string }).code === 'P2002')
      throw conflict('Já existe um cliente com esse WhatsApp')
    throw err
  }
  return { customer, created: true }
}

const HEADER_ALIASES = {
  name: ['nome', 'name', 'cliente'],
  phone: ['whatsapp', 'telefone', 'celular', 'phone', 'fone'],
  email: ['e-mail', 'email'],
  tags: ['tags', 'etiquetas'],
  notes: ['observacoes', 'observacao', 'notas', 'notes'],
} as const

const normalizeHeader = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Importa clientes de CSV. Campos ausentes ou vazios nunca apagam o que já existe. */
export async function importCustomersCsv(db: TenantDb, csv: string) {
  const rows = parseCsv(csv)
  if (!rows.length) throw badRequest('O arquivo está vazio')
  const header = rows[0]!.map(normalizeHeader)
  const hasHeader = header.some(
    (h) =>
      (HEADER_ALIASES.name as readonly string[]).includes(h) ||
      (HEADER_ALIASES.phone as readonly string[]).includes(h),
  )
  const column = (key: keyof typeof HEADER_ALIASES, positional: number) =>
    hasHeader
      ? header.findIndex((h) => (HEADER_ALIASES[key] as readonly string[]).includes(h))
      : positional
  const col = {
    name: column('name', 0),
    phone: column('phone', 1),
    email: column('email', 2),
    tags: column('tags', 3),
    notes: column('notes', 4),
  }
  if (col.name < 0 || col.phone < 0)
    throw badRequest('A planilha precisa das colunas Nome e WhatsApp')
  const cell = (row: string[], index: number) =>
    index >= 0 ? row[index]?.trim() || undefined : undefined

  let created = 0
  let updated = 0
  const errors: string[] = []
  const dataRows = rows.slice(hasHeader ? 1 : 0)
  if (!dataRows.length) throw badRequest('A planilha não tem nenhuma linha de cliente')
  for (const [index, row] of dataRows.entries()) {
    const line = index + (hasHeader ? 2 : 1)
    const name = cell(row, col.name)
    const phone = cell(row, col.phone) ?? ''
    if (!name || !normalizeBrazilianMobile(phone)) {
      errors.push(`Linha ${line}: nome ou WhatsApp inválido`)
      continue
    }
    // E-mail inválido não derruba a linha: o cliente entra sem e-mail e a linha é avisada
    const rawEmail = cell(row, col.email)?.toLowerCase()
    const email = rawEmail && emailSchema.safeParse(rawEmail).success ? rawEmail : undefined
    if (rawEmail && !email) errors.push(`Linha ${line}: e-mail "${rawEmail}" ignorado (inválido)`)
    const tags = cell(row, col.tags)
      ?.split(/[,|]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20)
    const result = await upsertCustomerByPhone(
      db,
      phone,
      { name, email, notes: cell(row, col.notes), tags },
      'merge',
    )
    if (result.created) created++
    else updated++
  }
  return { created, updated, skipped: errors.length, errors: errors.slice(0, 20) }
}

/** LGPD: anonimiza os dados pessoais, mantém o histórico financeiro sem identificação. */
export async function anonymizeCustomer(db: TenantDb, customerId: string) {
  const now = new Date()
  await db.booking.updateMany({
    where: { customerId, status: { in: [...OPEN_BOOKING_STATUSES] }, startsAt: { gte: now } },
    data: {
      status: 'canceled',
      canceledAt: now,
      canceledBy: 'professional',
      cancelReason: 'Dados do cliente excluídos (LGPD)',
    },
  })
  // Mensagens para a cliente na fila: cancela as pendentes e apaga telefone/e-mail de todas
  const bookingIds = (
    await db.booking.findMany({ where: { customerId }, select: { id: true } })
  ).map((b) => b.id)
  if (bookingIds.length) {
    const customerJobs = {
      bookingId: { in: bookingIds },
      kind: { startsWith: 'customer_' },
    } satisfies Prisma.NotificationJobWhereInput
    await prisma.notificationJob.updateMany({
      where: { ...customerJobs, status: { in: ['pending', 'processing'] } },
      data: { status: 'canceled', dedupeKey: null, lastError: 'Cliente excluída (LGPD)' },
    })
    await prisma.notificationJob.updateMany({
      where: customerJobs,
      data: { payload: {} },
    })
  }
  // Fotos de referência da cliente também são apagadas do disco
  const photos = await db.bookingFieldAnswer.findMany({
    where: { booking: { customerId }, type: 'photo' },
    select: { value: true },
  })
  await deletePrivateFiles(photos.map((p) => p.value))
  await db.bookingFieldAnswer.deleteMany({ where: { booking: { customerId } } })
  await db.booking.updateMany({ where: { customerId }, data: { notes: null } })
  await db.customer.update({
    where: { id: customerId },
    data: {
      name: 'Cliente removido',
      // Telefone único por tenant: troca por um valor que nunca é um número válido
      phone: `anon-${customerId}`,
      email: null,
      notes: null,
      tags: [],
      birthday: null,
      deletedAt: now,
    },
  })
}
