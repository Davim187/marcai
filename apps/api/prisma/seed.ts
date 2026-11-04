/**
 * Seed de demonstração: "Mary Lopes Unhas & Perfumaria" (slug marylopes).
 * Login demo: demo@marcai.app / demo1234 · Super admin: admin@marcai.app / admin1234
 */
import { PrismaClient, type BookingStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import {
  addDaysToDate,
  brazilianHolidays,
  getDaySlots,
  MANICURE_FIELDS,
  toLocalDate,
} from '@marcai/shared'

const prisma = new PrismaClient()
const TZ = 'America/Fortaleza'

// PRNG determinístico para o seed ser reproduzível
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!
const token = () => randomBytes(18).toString('base64url')

const FIRST = [
  'Ana',
  'Beatriz',
  'Camila',
  'Daniela',
  'Eduarda',
  'Fernanda',
  'Gabriela',
  'Helena',
  'Isabela',
  'Júlia',
  'Larissa',
  'Luana',
  'Mariana',
  'Natália',
  'Paula',
  'Rafaela',
  'Sabrina',
  'Tatiane',
  'Vanessa',
  'Yasmin',
  'Aline',
  'Bruna',
  'Carla',
  'Débora',
  'Elaine',
  'Francisca',
  'Giovana',
  'Ingrid',
  'Jéssica',
  'Kelly',
]
const LAST = [
  'Souza',
  'Oliveira',
  'Lima',
  'Pereira',
  'Costa',
  'Rodrigues',
  'Almeida',
  'Nascimento',
  'Carvalho',
  'Araújo',
  'Ribeiro',
  'Gomes',
  'Martins',
  'Barbosa',
  'Freitas',
  'Moreira',
  'Cavalcante',
  'Holanda',
]

async function main() {
  console.log('🌱 Limpando dados de demonstração anteriores…')
  await prisma.tenant.deleteMany({ where: { slug: 'marylopes' } })
  await prisma.user.deleteMany({
    where: { email: { in: ['demo@marcai.app', 'admin@marcai.app', 'julia@marcai.app'] } },
  })

  const [demoHash, adminHash] = await Promise.all([
    bcrypt.hash('demo1234', 10),
    bcrypt.hash('admin1234', 10),
  ])
  const admin = await prisma.user.create({
    data: {
      email: 'admin@marcai.app',
      name: 'Admin Marcaí',
      passwordHash: adminHash,
      isSuperAdmin: true,
    },
  })
  const demo = await prisma.user.create({
    data: {
      email: 'demo@marcai.app',
      name: 'Mary Lopes',
      phone: '5585988887777',
      passwordHash: demoHash,
    },
  })
  const julia = await prisma.user.create({
    data: { email: 'julia@marcai.app', name: 'Júlia Santos', passwordHash: demoHash },
  })

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'marylopes',
      name: 'Mary Lopes Unhas & Perfumaria',
      businessType: 'manicure',
      bio: 'Unhas impecáveis e perfumes que marcam presença. Alongamento em gel, esmaltação e spa dos pés com todo o cuidado que você merece 💅',
      address: 'Rua Padre Valdevino, 1234 - Aldeota',
      city: 'Fortaleza - CE',
      instagram: 'marylopes.unhas',
      whatsapp: '5585988887777',
      primaryColor: '#B4235A',
      timezone: TZ,
      minAdvanceMinutes: 120,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 30,
      cancelMinHours: 12,
      cancellationPolicy:
        'Cancelamentos e remarcações podem ser feitos pelo link até 12 horas antes. Atrasos de mais de 15 minutos podem precisar ser reagendados. 💖',
      reminderHours: 24,
      dailySummaryEnabled: true,
      notifyPhone: '5585988887777',
      onboardingCompleted: true,
    },
  })
  const mary = await prisma.professional.create({
    data: { tenantId: tenant.id, name: 'Mary Lopes', bio: 'Nail designer há 8 anos', sortOrder: 0 },
  })
  const ju = await prisma.professional.create({
    data: { tenantId: tenant.id, name: 'Júlia Santos', bio: 'Manicure e pedicure', sortOrder: 1 },
  })
  await prisma.tenantMember.createMany({
    data: [
      { tenantId: tenant.id, userId: demo.id, role: 'owner', professionalId: mary.id },
      { tenantId: tenant.id, userId: julia.id, role: 'professional', professionalId: ju.id },
    ],
  })

  const cats = await Promise.all(
    ['Mãos', 'Pés', 'Alongamento', 'Combos'].map((name, i) =>
      prisma.serviceCategory.create({ data: { tenantId: tenant.id, name, sortOrder: i } }),
    ),
  )
  const cat = Object.fromEntries(cats.map((c) => [c.name, c.id]))
  const serviceDefs = [
    {
      name: 'Manicure simples',
      cat: 'Mãos',
      d: 45,
      p: 3500,
      desc: 'Cutilagem, lixamento, hidratação e esmaltação tradicional.',
      both: true,
    },
    {
      name: 'Esmaltação em gel',
      cat: 'Mãos',
      d: 60,
      p: 7000,
      desc: 'Brilho e duração de até 3 semanas, sem lascar.',
      both: false,
    },
    {
      name: 'Pedicure',
      cat: 'Pés',
      d: 50,
      p: 4000,
      desc: 'Cutilagem, lixamento dos pés e esmaltação.',
      both: true,
    },
    {
      name: 'Spa dos pés',
      cat: 'Pés',
      d: 60,
      p: 8000,
      desc: 'Esfoliação, máscara hidratante, massagem e esmaltação.',
      both: true,
    },
    {
      name: 'Alongamento em gel',
      cat: 'Alongamento',
      d: 150,
      p: 15000,
      from: true,
      buf: 10,
      desc: 'Alongamento no molde F1 com acabamento em gel. Formato à sua escolha.',
      both: false,
    },
    {
      name: 'Manutenção de alongamento',
      cat: 'Alongamento',
      d: 120,
      p: 10000,
      buf: 10,
      desc: 'Manutenção em até 21 dias. Acima disso, consulte.',
      both: false,
    },
    {
      name: 'Pé e mão',
      cat: 'Combos',
      d: 90,
      p: 7000,
      desc: 'Manicure + pedicure tradicionais com preço especial.',
      both: true,
    },
  ]
  const services = []
  for (const [i, s] of serviceDefs.entries()) {
    services.push(
      await prisma.service.create({
        data: {
          tenantId: tenant.id,
          categoryId: cat[s.cat],
          name: s.name,
          description: s.desc,
          durationMinutes: s.d,
          priceCents: s.p,
          priceFrom: s.from ?? false,
          bufferMinutes: s.buf ?? 0,
          sortOrder: i,
          professionals: {
            create: [
              { tenantId: tenant.id, professionalId: mary.id },
              ...(s.both ? [{ tenantId: tenant.id, professionalId: ju.id }] : []),
            ],
          },
        },
      }),
    )
  }

  // Campos personalizados (preset de manicure)
  const fields = []
  for (const [i, f] of MANICURE_FIELDS.entries()) {
    fields.push(
      await prisma.formField.create({
        data: {
          tenantId: tenant.id,
          label: f.label,
          type: f.type,
          required: f.required,
          helpText: f.helpText,
          sortOrder: i,
          options: {
            create: (f.options ?? []).map((label, j) => ({
              tenantId: tenant.id,
              label,
              sortOrder: j,
            })),
          },
        },
      }),
    )
  }

  // Expediente: terça a sábado, 08:00–12:00 e 13:30–19:00
  const shifts = [2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, start: '08:00', end: '12:00' },
    { weekday, start: '13:30', end: '19:00' },
  ])
  for (const p of [mary, ju]) {
    await prisma.workingHours.createMany({
      data: shifts.map((s) => ({ ...s, tenantId: tenant.id, professionalId: p.id })),
    })
  }
  const year = new Date().getUTCFullYear()
  await prisma.holiday.createMany({
    data: [...brazilianHolidays(year), ...brazilianHolidays(year + 1)].map((h) => ({
      tenantId: tenant.id,
      date: h.date,
      name: h.name,
      source: 'national',
    })),
    skipDuplicates: true,
  })

  // 30 clientes
  const customers = []
  for (let i = 0; i < 30; i++) {
    const name = `${FIRST[i]} ${pick(LAST)}`
    const phone = `55859${String(91000000 + i * 7919).slice(0, 8)}`
    customers.push(
      await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name,
          phone,
          email:
            i % 4 === 0
              ? `${FIRST[i]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@email.com`
              : null,
          tags: i % 7 === 0 ? ['VIP'] : i % 5 === 0 ? ['Alongamento'] : [],
          notes: i % 6 === 0 ? 'Prefere esmaltes nude. Alérgica a acetona forte.' : null,
          consentAt: new Date(),
          createdAt: new Date(Date.now() - (60 - i) * 86_400_000),
        },
      }),
    )
  }
  // Clientes frequentes aparecem mais
  const weighted = [
    ...customers,
    ...customers.slice(0, 8),
    ...customers.slice(0, 8),
    ...customers.slice(0, 4),
  ]

  console.log('📅 Gerando agendamentos…')
  const today = toLocalDate(new Date(), TZ)
  const busy: Record<string, Array<{ startsAt: Date; endsAt: Date }>> = {
    [mary.id]: [],
    [ju.id]: [],
  }
  let count = 0
  for (let offset = -42; offset <= 21; offset++) {
    const date = addDaysToDate(today, offset)
    for (const prof of [mary, ju]) {
      const isPast = offset < 0
      const target = prof.id === mary.id ? (isPast ? 4 : offset < 7 ? 3 : 2) : isPast ? 3 : 2
      for (let k = 0; k < target; k++) {
        const allowed = services.filter(
          (s) => prof.id === mary.id || serviceDefs.find((d) => d.name === s.name)!.both,
        )
        const service = pick(allowed)
        const slots = getDaySlots(
          {
            timezone: TZ,
            now: new Date(Date.now() - 400 * 86_400_000),
            shifts,
            timeOffs: [],
            closedDates: [],
            busy: busy[prof.id]!,
            durationMinutes: service.durationMinutes,
            bufferMinutes: service.bufferMinutes,
            slotIntervalMinutes: 30,
            minAdvanceMinutes: 0,
            maxAdvanceDays: 1000,
          },
          date,
        ).filter((s) => offset !== 0 || s.startsAt.getTime() > Date.now() - 6 * 3_600_000)
        if (!slots.length) break
        const slot = pick(slots)
        const blockedUntil = new Date(slot.endsAt.getTime() + service.bufferMinutes * 60_000)
        busy[prof.id]!.push({ startsAt: slot.startsAt, endsAt: blockedUntil })
        const r = rand()
        let status: BookingStatus
        if (slot.startsAt.getTime() < Date.now())
          status = r < 0.78 ? 'completed' : r < 0.88 ? 'no_show' : 'canceled'
        else status = r < 0.75 ? 'confirmed' : r < 0.9 ? 'pending' : 'canceled'
        const customer = pick(weighted)
        const createdAt = new Date(
          slot.startsAt.getTime() - (2 + Math.floor(rand() * 10)) * 86_400_000,
        )
        const booking = await prisma.booking.create({
          data: {
            tenantId: tenant.id,
            professionalId: prof.id,
            serviceId: service.id,
            customerId: customer.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            blockedUntil,
            status,
            source: rand() < 0.8 ? 'online' : 'manual',
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceFrom
              ? service.priceCents + Math.floor(rand() * 4) * 1000
              : service.priceCents,
            priceFrom: service.priceFrom,
            notes:
              rand() < 0.25
                ? pick([
                    'Quero decoração francesinha',
                    'Vou levar minha filha junto',
                    'Unhas bem curtinhas, por favor',
                    'Cor: vermelho Ferrari',
                  ])
                : null,
            cancelToken: token(),
            confirmedAt: status !== 'pending' ? createdAt : null,
            customerConfirmedAt: status === 'confirmed' && rand() < 0.5 ? new Date() : null,
            completedAt: status === 'completed' ? slot.endsAt : null,
            canceledAt: status === 'canceled' ? createdAt : null,
            canceledBy: status === 'canceled' ? pick(['customer', 'professional']) : null,
            cancelReason:
              status === 'canceled'
                ? pick(['Imprevisto no trabalho', 'Fiquei doente', 'Viagem'])
                : null,
            createdAt,
            answers:
              service.name.includes('Alongamento') || service.name.includes('gel')
                ? {
                    create: [
                      {
                        tenantId: tenant.id,
                        fieldId: fields[0]!.id,
                        label: fields[0]!.label,
                        type: fields[0]!.type,
                        value: pick(['Quadrada', 'Amendoada', 'Bailarina', 'Stiletto']),
                      },
                      {
                        tenantId: tenant.id,
                        fieldId: fields[1]!.id,
                        label: fields[1]!.label,
                        type: fields[1]!.type,
                        value: service.name.startsWith('Manutenção'),
                      },
                      {
                        tenantId: tenant.id,
                        fieldId: fields[2]!.id,
                        label: fields[2]!.label,
                        type: fields[2]!.type,
                        value: rand() < 0.5,
                      },
                    ],
                  }
                : undefined,
          },
        })
        count++
        if (offset >= -2 && offset <= 0 && booking.source === 'online' && rand() < 0.6) {
          await prisma.notification.create({
            data: {
              tenantId: tenant.id,
              type: 'booking_created',
              title: 'Novo agendamento!',
              body: `${customer.name} agendou ${service.name}`,
              link: `/painel/agenda/${booking.id}`,
              bookingId: booking.id,
              createdAt,
              readAt: offset < 0 ? new Date() : null,
            },
          })
        }
      }
    }
  }
  // Um bloqueio de exemplo
  const nextSat = Array.from({ length: 14 }, (_, i) => addDaysToDate(today, i + 1)).find(
    (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 6,
  )!
  await prisma.timeOff.create({
    data: {
      tenantId: tenant.id,
      professionalId: mary.id,
      reason: 'Curso de nail art',
      startsAt: new Date(`${nextSat}T16:30:00Z`),
      endsAt: new Date(`${nextSat}T22:00:00Z`),
    },
  })

  // Assinatura Pro ativa + faturas
  const sub = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      plan: 'pro',
      status: 'active',
      trialEndsAt: new Date(Date.now() - 40 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      provider: 'fake',
      providerCustomerId: 'cus_demo',
      providerSubscriptionId: 'sub_demo',
      billingType: 'PIX',
    },
  })
  for (const m of [2, 1]) {
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: sub.id,
        providerPaymentId: `pay_demo_${m}`,
        amountCents: 9900,
        status: 'paid',
        billingType: 'PIX',
        dueDate: new Date(Date.now() - (m * 30 - 20) * 86_400_000),
        paidAt: new Date(Date.now() - (m * 30 - 20) * 86_400_000),
        description: 'Marcaí Pro — mensalidade',
      },
    })
  }

  // Alguns tenants de exemplo para o super admin
  for (const [i, n] of [
    'Studio Bella Cílios',
    'Barbearia do Zé',
    'Espaço Ana Sobrancelhas',
  ].entries()) {
    const slug = ['studio-bella', 'barbearia-do-ze', 'ana-sobrancelhas'][i]!
    await prisma.tenant.deleteMany({ where: { slug } })
    const t = await prisma.tenant.create({
      data: {
        slug,
        name: n,
        businessType: ['cilios', 'barbearia', 'sobrancelha'][i]!,
        onboardingCompleted: true,
        createdAt: new Date(Date.now() - (i * 9 + 3) * 86_400_000),
      },
    })
    await prisma.subscription.create({
      data: {
        tenantId: t.id,
        plan: i === 1 ? 'essencial' : 'pro',
        status: (['trial', 'active', 'past_due'] as const)[i]!,
        trialEndsAt: new Date(Date.now() + (20 - i * 15) * 86_400_000),
        currentPeriodEnd: i === 0 ? null : new Date(Date.now() + (i === 1 ? 15 : -3) * 86_400_000),
        provider: 'fake',
      },
    })
    await prisma.professional.create({ data: { tenantId: t.id, name: n } })
  }

  console.log(`✅ Seed concluído: ${customers.length} clientes, ${count} agendamentos.`)
  console.log('   Painel demo: demo@marcai.app / demo1234')
  console.log('   Profissional: julia@marcai.app / demo1234')
  console.log('   Super admin:  admin@marcai.app / admin1234')
  console.log('   Página pública: /marylopes')
  void admin
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
