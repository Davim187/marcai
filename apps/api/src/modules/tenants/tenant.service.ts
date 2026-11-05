import type { Prisma } from '@prisma/client'
import {
  type BusinessType,
  brazilianHolidays,
  DAY_MS,
  DEFAULT_TIMEZONE,
  isValidSlug,
  type OnboardingInput,
  PRESETS,
  type PresetField,
  TRIAL_DAYS,
} from '@marcai/shared'
import { env } from '../../config/env'
import { conflict } from '../../lib/errors'
import { prisma } from '../../lib/prisma'

export async function isSlugAvailable(slug: string, exceptTenantId?: string) {
  if (!isValidSlug(slug)) return false
  const t = await prisma.tenant.findUnique({ where: { slug } })
  if (t && t.id !== exceptTenantId) return false
  // Link antigo de outro estabelecimento continua reservado por 180 dias
  const old = await prisma.slugHistory.findUnique({ where: { slug } })
  if (old && old.tenantId !== exceptTenantId && Date.now() - old.createdAt.getTime() < 180 * DAY_MS)
    return false
  return true
}

/** Cria os campos personalizados do formulário a partir de um preset. */
export async function createPresetFields(
  tx: Prisma.TransactionClient,
  tenantId: string,
  fields: PresetField[],
  startOrder = 0,
) {
  for (const [i, f] of fields.entries()) {
    await tx.formField.create({
      data: {
        tenantId,
        label: f.label,
        type: f.type,
        required: f.required,
        helpText: f.helpText,
        sortOrder: startOrder + i,
        options: {
          create: (f.options ?? []).map((label, j) => ({ tenantId, label, sortOrder: j })),
        },
      },
    })
  }
}

export async function loadNationalHolidays(
  tx: Prisma.TransactionClient,
  tenantId: string,
  from = new Date(),
) {
  const year = from.getUTCFullYear()
  const holidays = [...brazilianHolidays(year), ...brazilianHolidays(year + 1)]
  await tx.holiday.createMany({
    data: holidays.map((h) => ({
      tenantId,
      date: h.date,
      name: h.name,
      closed: true,
      source: 'national',
    })),
    skipDuplicates: true,
  })
}

/**
 * Onboarding: cria o estabelecimento com a dona, a primeira profissional, os serviços e
 * campos sugeridos para o tipo de negócio, o expediente e o teste grátis de 30 dias.
 */
export async function createTenantFromOnboarding(userId: string, input: OnboardingInput) {
  if (!(await isSlugAvailable(input.slug)))
    throw conflict('Esse link já está em uso. Escolha outro.', 'SLUG_EM_USO')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const preset = PRESETS[input.businessType as BusinessType] ?? PRESETS.outro

  return prisma.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: input.slug,
          name: input.businessName,
          businessType: input.businessType,
          primaryColor: input.primaryColor ?? '#1F5F7A',
          logoUrl: input.logoUrl ?? null,
          timezone: input.timezone ?? DEFAULT_TIMEZONE,
          onboardingCompleted: true,
          cancellationPolicy:
            'Cancelamentos e remarcações podem ser feitos pelo link até 12 horas antes do horário. Em caso de atraso maior que 15 minutos, o atendimento pode ser reagendado.',
          notifyPhone: user.phone,
        },
      })
      const professional = await tx.professional.create({
        data: { tenantId: tenant.id, name: user.name },
      })
      await tx.tenantMember.create({
        data: { tenantId: tenant.id, userId, role: 'owner', professionalId: professional.id },
      })

      let order = 0
      for (const [ci, cat] of preset.categories.entries()) {
        const category = await tx.serviceCategory.create({
          data: { tenantId: tenant.id, name: cat.name, sortOrder: ci },
        })
        for (const s of cat.services) {
          await tx.service.create({
            data: {
              tenantId: tenant.id,
              categoryId: category.id,
              name: s.name,
              description: s.description,
              durationMinutes: s.durationMinutes,
              priceCents: s.priceCents,
              priceFrom: s.priceFrom ?? false,
              bufferMinutes: s.bufferMinutes ?? 0,
              sortOrder: order++,
              professionals: { create: { tenantId: tenant.id, professionalId: professional.id } },
            },
          })
        }
      }
      await createPresetFields(tx, tenant.id, preset.fields)

      if (input.shifts.length) {
        await tx.workingHours.createMany({
          data: input.shifts.map((s) => ({
            tenantId: tenant.id,
            professionalId: professional.id,
            ...s,
          })),
        })
      }
      await loadNationalHolidays(tx, tenant.id)

      if (env.APP_MODE === 'saas') {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: 'pro',
            status: 'trial',
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
            provider: env.BILLING_PROVIDER,
          },
        })
      }
      return tenant
    },
    { timeout: 20_000 },
  )
}
