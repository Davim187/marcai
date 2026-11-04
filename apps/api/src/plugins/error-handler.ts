import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import { AppError, SLOT_TAKEN_MESSAGE } from '../lib/errors'
import { TenantIsolationError } from '../lib/tenant-db'

/** Detecta violação da exclusion constraint de sobreposição de agendamentos (SQLSTATE 23P01). */
export function isOverlapError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; meta?: { code?: string; message?: string } }
  return (
    e.code === '23P01' ||
    e.meta?.code === '23P01' ||
    (typeof e.message === 'string' &&
      (e.message.includes('booking_no_overlap') || e.message.includes('23P01'))) ||
    (typeof e.meta?.message === 'string' && e.meta.message.includes('booking_no_overlap'))
  )
}

type Fallback = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
let notFoundFallback: Fallback | null = null
/** Permite que o servidor do SPA responda às rotas que não são da API. */
export function setNotFoundFallback(fn: Fallback) {
  notFoundFallback = fn
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler(async (request, reply) => {
    if (notFoundFallback && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return notFoundFallback(request, reply)
    }
    return reply.status(404).send({
      error: 'NAO_ENCONTRADO',
      message: `Rota não encontrada: ${request.method} ${request.url}`,
    })
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields: Record<string, string> = {}
      for (const v of error.validation) {
        const path = (v.instancePath || '').replace(/^\//, '').replace(/\//g, '.') || '_'
        fields[path] ??= v.message ?? 'Valor inválido'
      }
      return reply.status(400).send({
        error: 'VALIDACAO',
        message: 'Confira os campos destacados.',
        fields,
      })
    }
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {}
      for (const i of error.issues) fields[i.path.join('.') || '_'] ??= i.message
      return reply
        .status(400)
        .send({ error: 'VALIDACAO', message: 'Confira os campos destacados.', fields })
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message, details: error.details })
    }
    if (isOverlapError(error)) {
      return reply.status(409).send({ error: 'HORARIO_OCUPADO', message: SLOT_TAKEN_MESSAGE })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply
          .status(409)
          .send({ error: 'DUPLICADO', message: 'Já existe um registro com esses dados.' })
      }
      if (error.code === 'P2025') {
        return reply
          .status(404)
          .send({ error: 'NAO_ENCONTRADO', message: 'Registro não encontrado.' })
      }
    }
    if (error instanceof TenantIsolationError) {
      request.log.error({ err: error }, 'Violação de isolamento entre tenants bloqueada')
      return reply.status(403).send({ error: 'SEM_PERMISSAO', message: 'Operação não permitida.' })
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'MUITAS_TENTATIVAS',
        message: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
      })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: error.code ?? 'ERRO', message: error.message })
    }
    request.log.error({ err: error }, 'Erro inesperado')
    return reply.status(500).send({
      error: 'ERRO_INTERNO',
      message: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
    })
  })
}
