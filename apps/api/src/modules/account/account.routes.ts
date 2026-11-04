import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { normalizeBrazilianMobile, updateProfileSchema } from '@marcai/shared'
import { audit } from '../../lib/audit'
import { badRequest } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { clearSessionCookies, requireAuth } from '../../plugins/auth'
import { billingProvider } from '../billing/billing.service'

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.put(
    '/profile',
    { schema: { tags: ['conta'], body: updateProfileSchema } },
    async (request) => {
      await prisma.user.update({
        where: { id: request.auth!.user.id },
        data: {
          name: request.body.name,
          phone: request.body.phone ? normalizeBrazilianMobile(request.body.phone) : null,
        },
      })
      return { ok: true }
    },
  )

  /** LGPD: exportação de todos os dados da profissional (e do estabelecimento, se for dona). */
  app.get('/export', { schema: { tags: ['conta'] } }, async (request, reply) => {
    const userId = request.auth!.user.id
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        memberships: { select: { role: true, tenantId: true } },
      },
    })
    const ownedIds = user.memberships.filter((m) => m.role === 'owner').map((m) => m.tenantId)
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: ownedIds } },
      include: {
        services: true,
        customers: true,
        bookings: { include: { answers: true } },
        workingHours: true,
        formFields: { include: { options: true } },
        invoices: true,
      },
    })
    await audit({ action: 'account.data_exported', actorUserId: userId })
    return reply
      .header('content-disposition', 'attachment; filename="meus-dados.json"')
      .send({ exportedAt: new Date(), user, tenants })
  })

  /** LGPD: exclusão da conta. Se for a única dona, o estabelecimento e todos os dados são apagados. */
  app.post(
    '/delete',
    {
      schema: {
        tags: ['conta'],
        body: z.object({ password: z.string().max(128).optional(), confirm: z.literal('EXCLUIR') }),
      },
    },
    async (request, reply) => {
      const userId = request.auth!.user.id
      if (request.auth!.impersonatorId)
        throw badRequest('Não é possível excluir a conta em modo suporte')
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { memberships: true },
      })
      if (
        user.passwordHash &&
        !(await bcrypt.compare(request.body.password ?? '', user.passwordHash))
      )
        throw badRequest('Senha incorreta', 'SENHA_INCORRETA')
      for (const m of user.memberships.filter((x) => x.role === 'owner')) {
        const owners = await prisma.tenantMember.count({
          where: { tenantId: m.tenantId, role: 'owner' },
        })
        if (owners > 1) continue
        const sub = await prisma.subscription.findUnique({ where: { tenantId: m.tenantId } })
        if (
          sub?.providerSubscriptionId &&
          sub.billingType === 'CREDIT_CARD' &&
          sub.status !== 'canceled'
        )
          // Se o Mercado Pago falhar, a exclusão para: nunca deixa um cartão cobrando sem conta
          await billingProvider()
            .cancelCardSubscription(sub.providerSubscriptionId)
            .catch(() => {
              throw badRequest(
                'Não conseguimos cancelar a cobrança no cartão agora. Tente de novo em alguns minutos.',
                'MERCADO_PAGO_INDISPONIVEL',
              )
            })
        await prisma.tenant.delete({ where: { id: m.tenantId } })
        await audit({ action: 'tenant.deleted', tenantId: m.tenantId, actorUserId: userId })
      }
      await prisma.user.delete({ where: { id: userId } })
      await audit({ action: 'account.deleted', actorUserId: userId })
      clearSessionCookies(reply)
      return { ok: true }
    },
  )
}
