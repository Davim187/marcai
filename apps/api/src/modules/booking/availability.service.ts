import type { Service, Tenant } from '@prisma/client'
import {
  addDaysToDate,
  type AvailabilityInput,
  getAvailableDates,
  getDaySlots,
  isSlotAvailable,
  localToUtc,
  toLocalDate,
} from '@marcai/shared'
import { prisma } from '../../lib/prisma'

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'] as const

type TenantRules = Pick<
  Tenant,
  'id' | 'timezone' | 'minAdvanceMinutes' | 'maxAdvanceDays' | 'slotIntervalMinutes'
>

/**
 * Carrega do banco tudo o que o motor de disponibilidade precisa para uma profissional
 * e um serviço, num intervalo de datas locais.
 */
export async function loadAvailabilityInput(opts: {
  tenant: TenantRules
  professionalId: string
  service: Pick<Service, 'durationMinutes' | 'bufferMinutes'>
  fromDate: string
  toDate: string
  excludeBookingId?: string
  now?: Date
  ignoreRules?: boolean
}): Promise<AvailabilityInput> {
  const { tenant, professionalId } = opts
  // Margem de 1 dia para cobrir turnos que viram a meia-noite e diferenças de fuso.
  const rangeStart = localToUtc(addDaysToDate(opts.fromDate, -1), 0, tenant.timezone)
  const rangeEnd = localToUtc(addDaysToDate(opts.toDate, 2), 0, tenant.timezone)

  const [workingHours, timeOffs, recurringBlocks, holidays, bookings] = await Promise.all([
    prisma.workingHours.findMany({ where: { tenantId: tenant.id, professionalId } }),
    prisma.timeOff.findMany({
      where: {
        tenantId: tenant.id,
        OR: [{ professionalId }, { professionalId: null }],
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
    }),
    prisma.recurringBlock.findMany({
      where: { tenantId: tenant.id, OR: [{ professionalId }, { professionalId: null }] },
    }),
    prisma.holiday.findMany({
      where: {
        tenantId: tenant.id,
        closed: true,
        date: { gte: addDaysToDate(opts.fromDate, -1), lte: opts.toDate },
      },
    }),
    prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        professionalId,
        status: { in: [...ACTIVE_STATUSES] },
        startsAt: { lt: rangeEnd },
        blockedUntil: { gt: rangeStart },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      select: { startsAt: true, blockedUntil: true },
    }),
  ])

  return {
    timezone: tenant.timezone,
    now: opts.now ?? new Date(),
    shifts: workingHours.map((w) => ({ weekday: w.weekday, start: w.start, end: w.end })),
    timeOffs: timeOffs.map((t) => ({ startsAt: t.startsAt, endsAt: t.endsAt })),
    recurringBlocks: recurringBlocks.map((b) => ({
      weekday: b.weekday,
      start: b.start,
      end: b.end,
    })),
    closedDates: holidays.map((h) => h.date),
    busy: bookings.map((b) => ({ startsAt: b.startsAt, endsAt: b.blockedUntil })),
    durationMinutes: opts.service.durationMinutes,
    bufferMinutes: opts.service.bufferMinutes,
    slotIntervalMinutes: tenant.slotIntervalMinutes,
    minAdvanceMinutes: opts.ignoreRules ? 0 : tenant.minAdvanceMinutes,
    maxAdvanceDays: opts.ignoreRules ? 3650 : tenant.maxAdvanceDays,
  }
}

export async function availableDates(opts: Parameters<typeof loadAvailabilityInput>[0]) {
  const input = await loadAvailabilityInput(opts)
  return getAvailableDates(input, opts.fromDate, opts.toDate)
}

export async function daySlots(
  opts: Omit<Parameters<typeof loadAvailabilityInput>[0], 'fromDate' | 'toDate'> & { date: string },
) {
  const input = await loadAvailabilityInput({ ...opts, fromDate: opts.date, toDate: opts.date })
  return getDaySlots(input, opts.date)
}

export async function checkSlot(
  opts: Omit<Parameters<typeof loadAvailabilityInput>[0], 'fromDate' | 'toDate'> & {
    startsAt: Date
  },
) {
  const date = toLocalDate(opts.startsAt, opts.tenant.timezone)
  const input = await loadAvailabilityInput({
    ...opts,
    fromDate: addDaysToDate(date, -1),
    toDate: date,
  })
  return isSlotAvailable(input, opts.startsAt)
}
