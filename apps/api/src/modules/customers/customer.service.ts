import type { TenantDb } from '../../lib/tenant-db'

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
        status: { in: ['pending', 'confirmed'] },
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
