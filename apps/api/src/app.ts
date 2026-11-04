import Fastify, { type FastifyServerOptions } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env, isTest } from './config/env'
import { loggerOptions } from './lib/logger'
import { authPlugin } from './plugins/auth'
import { registerErrorHandler } from './plugins/error-handler'
import { registerModules } from './modules'

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: isTest ? false : loggerOptions,
    trustProxy: true,
    bodyLimit: 1_048_576,
    ...opts,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)

  const allowed = new Set(
    [env.APP_URL, ...env.CORS_ORIGINS.split(',')]
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token'],
  })
  await app.register(cookie, { secret: env.SESSION_SECRET })
  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'MUITAS_TENTATIVAS',
      message: `Muitas tentativas. Tente de novo em ${Math.ceil(ctx.ttl / 1000)} segundos.`,
    }),
  })
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Marcaí API',
        description: 'API do Marcaí — agendamento online para profissionais de beleza.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'marcai_session' },
          csrf: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/api/docs' })

  await app.register(authPlugin)
  await registerModules(app)

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
