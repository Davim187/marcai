import pino from 'pino'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'],
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
