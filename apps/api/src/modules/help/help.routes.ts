import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { helpItemIdSchema, helpPreferencesSchema, helpProgressSchema } from '@marcai/shared'
import { badRequest } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../plugins/auth'

/** Teto de itens por usuário: o catálogo real tem algumas dezenas. */
const MAX_ITEMS_PER_USER = 300

const progressSelect = {
  itemId: true,
  step: true,
  status: true,
  timesCompleted: true,
  startedAt: true,
  completedAt: true,
  updatedAt: true,
} as const

/** Estado da ajuda do usuário: preferências + progresso de cada tour, tutorial e demonstração. */
async function helpState(userId: string) {
  const [pref, progress] = await Promise.all([
    prisma.helpPreference.findUnique({ where: { userId } }),
    prisma.helpProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: progressSelect,
    }),
  ])
  return {
    beginnerMode: pref?.beginnerMode ?? false,
    introSeenAt: pref?.introSeenAt ?? null,
    progress,
  }
}

/**
 * Central de ajuda: preferências e progresso são do usuário (valem em qualquer
 * estabelecimento em que ele entrar), então só exigem login.
 */
export const helpRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.get(
    '/state',
    { schema: { tags: ['ajuda'], summary: 'Preferências e progresso' } },
    (request) => helpState(request.auth!.user.id),
  )

  app.put(
    '/preferences',
    {
      schema: {
        tags: ['ajuda'],
        summary: 'Modo iniciante e boas-vindas',
        body: helpPreferencesSchema,
      },
    },
    async (request) => {
      const userId = request.auth!.user.id
      const { beginnerMode, introSeen } = request.body
      const data = {
        ...(beginnerMode !== undefined ? { beginnerMode } : {}),
        ...(introSeen !== undefined ? { introSeenAt: introSeen ? new Date() : null } : {}),
      }
      await prisma.helpPreference.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      })
      return helpState(userId)
    },
  )

  app.put(
    '/progress/:itemId',
    {
      schema: {
        tags: ['ajuda'],
        summary: 'Salva a etapa ou conclui um item',
        params: z.object({ itemId: helpItemIdSchema }),
        body: helpProgressSchema,
      },
    },
    async (request) => {
      const userId = request.auth!.user.id
      const { itemId } = request.params
      const { step, status } = request.body
      const existing = await prisma.helpProgress.findUnique({
        where: { userId_itemId: { userId, itemId } },
      })
      if (
        !existing &&
        (await prisma.helpProgress.count({ where: { userId } })) >= MAX_ITEMS_PER_USER
      )
        throw badRequest('Limite de itens de ajuda atingido.', 'LIMITE_AJUDA')
      // Conclusão conta uma vez por passagem (repetir o tutorial conta de novo)
      const completing = status === 'completed' && existing?.status !== 'completed'
      const now = new Date()
      return prisma.helpProgress.upsert({
        where: { userId_itemId: { userId, itemId } },
        create: {
          userId,
          itemId,
          step,
          status,
          timesCompleted: status === 'completed' ? 1 : 0,
          completedAt: status === 'completed' ? now : null,
        },
        update: {
          step,
          status,
          ...(completing ? { timesCompleted: { increment: 1 }, completedAt: now } : {}),
          // Recomeçou um item já concluído ou pulado: volta a contar como iniciado agora
          ...(status === 'started' && existing?.status !== 'started' ? { startedAt: now } : {}),
        },
        select: progressSelect,
      })
    },
  )

  app.delete(
    '/progress',
    {
      schema: { tags: ['ajuda'], summary: 'Zera o progresso e mostra a boas-vindas de novo' },
    },
    async (request) => {
      const userId = request.auth!.user.id
      await prisma.helpProgress.deleteMany({ where: { userId } })
      await prisma.helpPreference.updateMany({ where: { userId }, data: { introSeenAt: null } })
      return helpState(userId)
    },
  )
}
