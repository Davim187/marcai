import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fastifyStatic from '@fastify/static'
import { mkdirSync } from 'node:fs'
import { badRequest } from '../../lib/errors'
import { detectImage, storage, uploadRoot } from '../../lib/storage'
import { ctx, requireAuth, requireTenant } from '../../plugins/auth'

export async function readImageUpload(request: FastifyRequest) {
  const file = await request.file()
  if (!file) throw badRequest('Nenhum arquivo enviado')
  const buffer = await file.toBuffer().catch(() => {
    throw badRequest('Arquivo muito grande. O limite é de 5 MB.', 'ARQUIVO_GRANDE')
  })
  return { buffer, ext: detectImage(buffer) }
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  /** Upload durante o onboarding (o estabelecimento ainda não existe). */
  app.post(
    '/onboarding',
    {
      onRequest: requireAuth,
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: { tags: ['uploads'] },
    },
    async (request, reply) => {
      const { buffer, ext } = await readImageUpload(request)
      const url = await storage.save(`u-${request.auth!.user.id}`, buffer, ext)
      return reply.status(201).send({ url })
    },
  )

  app.post(
    '/',
    {
      onRequest: requireTenant,
      schema: { tags: ['uploads'], summary: 'Envia uma imagem (logo, capa, foto de serviço)' },
    },
    async (request, reply) => {
      const { buffer, ext } = await readImageUpload(request)
      const url = await storage.save(ctx(request).tenantId, buffer, ext)
      return reply.status(201).send({ url })
    },
  )
}

export async function registerUploadStatic(app: Parameters<FastifyPluginAsync>[0]) {
  mkdirSync(uploadRoot, { recursive: true })
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '30d',
    immutable: true,
  })
}
