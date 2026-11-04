import pino from 'pino'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["x-csrf-token"]',
    'req.headers["asaas-access-token"]',
    '*.password',
    '*.passwordHash',
  ],
  serializers: {
    // Tokens na query string (ex.: webhook da Evolution) nunca vão para o log
    req(req: { method?: string; url?: string; ip?: string }) {
      return {
        method: req.method,
        url: req.url?.replace(/([?&](?:token|code|state)=)[^&]+/gi, '$1***'),
        ip: req.ip,
      }
    },
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
}
export const logger = pino(loggerOptions)
