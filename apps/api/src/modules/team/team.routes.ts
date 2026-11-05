import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { inviteMemberSchema, OPEN_BOOKING_STATUSES, professionalSchema } from '@marcai/shared'
import { env } from '../../config/env'
import { hashToken, randomToken } from '../../lib/crypto'
import { AppError, badRequest, conflict, notFound } from '../../lib/errors'
import { emailLayout, sendEmail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'
import type { TenantDb } from '../../lib/tenant-db'
import { ctx, requireOwner, requireTenant } from '../../plugins/auth'
import { hashPassword } from '../auth/auth.service'
import { idParam } from '../../lib/route-schemas'

export const teamRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/professionals',
    { onRequest: requireTenant, schema: { tags: ['equipe'] } },
    async (request) => {
      const list = await ctx(request).db.professional.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          services: { select: { serviceId: true } },
          member: { select: { role: true, user: { select: { email: true, name: true } } } },
        },
      })
      return list.map(({ services, member, ...p }) => ({
        ...p,
        serviceIds: services.map((s) => s.serviceId),
        member: member ? { role: member.role, email: member.user.email } : null,
      }))
    },
  )

  app.post(
    '/professionals',
    { onRequest: requireOwner, schema: { tags: ['equipe'], body: professionalSchema } },
    async (request, reply) => {
      const { db } = ctx(request)
      const { serviceIds, ...data } = request.body
      const prof = await createProfessionalWithDefaults(db, data, serviceIds)
      return reply.status(201).send(prof)
    },
  )

  app.put(
    '/professionals/:id',
    {
      onRequest: requireOwner,
      schema: { tags: ['equipe'], params: idParam, body: professionalSchema },
    },
    async (request) => {
      const { db, tenantId } = ctx(request)
      const { serviceIds, ...data } = request.body
      const prof = await db.professional.findFirst({
        where: { id: request.params.id, deletedAt: null },
      })
      if (!prof) throw notFound('Profissional não encontrado')
      if (!data.active) {
        const actives = await db.professional.count({
          where: { deletedAt: null, active: true, id: { not: prof.id } },
        })
        if (!actives) throw badRequest('É preciso ter pelo menos um profissional ativo')
        // Mesma regra de remover: agendamentos futuros ficariam com alguém que sumiu da agenda
        if (prof.active) {
          const future = await db.booking.count({
            where: {
              professionalId: prof.id,
              status: { in: [...OPEN_BOOKING_STATUSES] },
              startsAt: { gte: new Date() },
            },
          })
          if (future)
            throw conflict(
              `${prof.name} tem ${future} ${future === 1 ? 'agendamento futuro' : 'agendamentos futuros'}. Remarque ou cancele antes de desativar.`,
            )
        }
      }
      await db.professional.update({ where: { id: prof.id }, data })
      const services = await db.service.findMany({
        where: { id: { in: serviceIds }, deletedAt: null },
        select: { id: true },
      })
      await db.professionalService.deleteMany({ where: { professionalId: prof.id } })
      await db.professionalService.createMany({
        data: services.map((s) => ({ tenantId, professionalId: prof.id, serviceId: s.id })),
      })
      return { ok: true }
    },
  )

  app.delete(
    '/professionals/:id',
    {
      onRequest: requireOwner,
      schema: {
        tags: ['equipe'],
        params: idParam,
        querystring: z.object({ confirmar: z.enum(['1']).optional() }),
      },
    },
    async (request) => {
      const { db } = ctx(request)
      const professional = await db.professional.findFirst({
        where: { id: request.params.id, deletedAt: null },
      })
      if (!professional) throw notFound('Profissional não encontrado')
      const remaining = await db.professional.count({
        where: { deletedAt: null, id: { not: professional.id } },
      })
      if (!remaining) throw badRequest('É preciso ter pelo menos um profissional')
      const future = await db.booking.count({
        where: {
          professionalId: professional.id,
          startsAt: { gte: new Date() },
          status: { in: [...OPEN_BOOKING_STATUSES] },
        },
      })
      if (future) {
        throw conflict(
          `Esse profissional tem ${future} agendamento(s) futuro(s). Remarque ou cancele antes de remover.`,
        )
      }
      // Serviços ativos que ficariam sem ninguém para atender (some da página pública)
      const orphans = await db.service.findMany({
        where: {
          deletedAt: null,
          active: true,
          professionals: {
            some: { professionalId: professional.id },
            every: { professionalId: professional.id },
          },
        },
        select: { name: true },
      })
      if (orphans.length && !request.query.confirmar) {
        throw new AppError(
          409,
          `Ao remover, ${orphans.length} serviço(s) ficam sem profissional e somem da sua página: ${orphans.map((o) => o.name).join(', ')}.`,
          'SERVICOS_SEM_PROFISSIONAL',
          { services: orphans.map((o) => o.name) },
        )
      }
      await db.professional.updateMany({
        where: { id: professional.id },
        data: { deletedAt: new Date(), active: false },
      })
      // Quem tinha acesso por essa agenda perde o vínculo e passa a não ver agenda nenhuma
      await db.tenantMember.updateMany({
        where: { professionalId: professional.id },
        data: { professionalId: null },
      })
      return { ok: true }
    },
  )

  // ---------- Membros (acesso ao painel) ----------
  app.get(
    '/members',
    { onRequest: requireOwner, schema: { tags: ['equipe'] } },
    async (request) => {
      const members = await ctx(request).db.tenantMember.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          professional: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return members
    },
  )

  /** Convida uma profissional: cria o acesso e envia um e-mail para ela definir a senha. */
  app.post(
    '/members',
    { onRequest: requireOwner, schema: { tags: ['equipe'], body: inviteMemberSchema } },
    async (request, reply) => {
      const { db, tenantId, tenant } = ctx(request)
      const { email, name, role, createProfessional } = request.body
      let user = await prisma.user.findUnique({ where: { email } })
      const isNew = !user
      if (!user) {
        user = await prisma.user.create({
          data: { email, name, passwordHash: await hashPassword(randomToken()) },
        })
      }
      const exists = await db.tenantMember.findFirst({ where: { userId: user.id } })
      if (exists) throw conflict('Essa pessoa já faz parte da equipe')
      let professionalId: string | null = null
      if (createProfessional) {
        // Mesma agenda inicial do cadastro pela equipe: expediente e todos os serviços ativos
        const allServices = await db.service.findMany({
          where: { deletedAt: null, active: true },
          select: { id: true },
        })
        const prof = await createProfessionalWithDefaults(
          db,
          { name },
          allServices.map((s) => s.id),
        )
        professionalId = prof.id
      }
      await db.tenantMember.create({
        data: {
          tenantId: db.$tenantId(),
          userId: user.id,
          role,
          professionalId,
          // Conta que já existia precisa aceitar o convite (ninguém entra numa equipe sem saber)
          acceptedAt: isNew ? new Date() : null,
        },
      })

      let cta = { label: 'Entrar no painel', url: `${env.APP_URL}/entrar` }
      if (isNew) {
        const token = randomToken()
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 86_400_000),
          },
        })
        cta = { label: 'Criar minha senha', url: `${env.APP_URL}/redefinir-senha?token=${token}` }
      }
      const { html, text } = emailLayout({
        title: `Convite para a equipe de ${tenant.name}`,
        body: isNew
          ? `${request.auth!.user.name} convidou você para a equipe de ${tenant.name}. Pelo painel você vê sua agenda e seus agendamentos.`
          : `${request.auth!.user.name} convidou você para a equipe de ${tenant.name}. Entre no painel com a sua conta para aceitar ou recusar o convite.`,
        cta,
        brandName: tenant.name,
        color: tenant.primaryColor,
      })
      sendEmail({
        to: email,
        subject: `Convite para a equipe de ${tenant.name}`,
        html,
        text,
        fromName: `${tenant.name} via ${env.APP_NAME}`,
      }).catch((err) => request.log.warn({ err }, 'Falha ao enviar e-mail de convite'))
      return reply.status(201).send({ ok: true, tenantId })
    },
  )

  app.delete(
    '/members/:id',
    { onRequest: requireOwner, schema: { tags: ['equipe'], params: idParam } },
    async (request) => {
      const { db } = ctx(request)
      const member = await db.tenantMember.findFirst({ where: { id: request.params.id } })
      if (!member) throw notFound()
      if (member.userId === request.auth!.user.id)
        throw badRequest('Você não pode remover a si mesma')
      if (member.role === 'owner') {
        const owners = await db.tenantMember.count({ where: { role: 'owner' } })
        if (owners <= 1)
          throw badRequest(
            'O estabelecimento precisa de pelo menos um responsável com acesso total',
          )
      }
      await db.tenantMember.deleteMany({ where: { id: member.id } })
      await prisma.session.deleteMany({
        where: { userId: member.userId, tenantId: member.tenantId },
      })
      return { ok: true }
    },
  )
}

/** Cria a profissional com os serviços e o expediente da primeira profissional como base. */
async function createProfessionalWithDefaults(
  db: TenantDb,
  data: Omit<Prisma.ProfessionalUncheckedCreateInput, 'tenantId'>,
  serviceIds: string[],
) {
  const tenantId = db.$tenantId()
  const count = await db.professional.count({ where: { deletedAt: null } })
  const services = await db.service.findMany({
    where: { id: { in: serviceIds }, deletedAt: null },
    select: { id: true },
  })
  const prof = await db.professional.create({
    data: {
      ...data,
      tenantId,
      sortOrder: count,
      services: { create: services.map((s) => ({ tenantId, serviceId: s.id })) },
    },
  })
  const first = await db.professional.findFirst({
    where: { deletedAt: null, id: { not: prof.id } },
    orderBy: { createdAt: 'asc' },
  })
  if (first) {
    const hours = await db.workingHours.findMany({ where: { professionalId: first.id } })
    await db.workingHours.createMany({
      data: hours.map((h) => ({
        tenantId,
        professionalId: prof.id,
        weekday: h.weekday,
        start: h.start,
        end: h.end,
      })),
    })
  }
  return prof
}
