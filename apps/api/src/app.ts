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
import { env, isProd, isTest } from './config/env'
import { loggerOptions } from './lib/logger'
import { authPlugin } from './plugins/auth'
import { registerErrorHandler } from './plugins/error-handler'
import { registerModules } from './modules'

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: isTest ? false : loggerOptions,
    // Só confia no X-Forwarded-For quando há um proxy conhecido na frente (TRUST_PROXY).
    // Com "true" qualquer cliente forjaria o IP e furaria o rate limit.
    trustProxy:
      typeof env.TRUST_PROXY === 'string' && /^\d+$/.test(env.TRUST_PROXY)
        ? (_address: string, hop: number) => hop < Number(env.TRUST_PROXY)
        : env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    ...opts,
  }).withTypeProvider<ZodTypeProvider>()

  // Headers de segurança em todas as respostas
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'strict-origin-when-cross-origin')
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
    if (isProd) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    const type = String(reply.getHeader('content-type') ?? '')
    if (type.startsWith('text/html') && !reply.hasHeader('content-security-policy')) {
      reply.header(
        'content-security-policy',
        [
          "default-src 'self'",
          // index.html tem um script inline mínimo (tema claro/escuro)
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      )
    }
    return payload
  })

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
    // Nos testes automatizados o limite só vale quando o teste pede explicitamente.
    allowList: (req) => isTest && !req.headers['x-test-rate-limit'],
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
  // Documentação só fora de produção (ou se liberada explicitamente)
  if (!isProd || env.SWAGGER_PUBLIC) await app.register(swaggerUi, { routePrefix: '/api/docs' })

  await app.register(authPlugin)
  await registerModules(app)

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
