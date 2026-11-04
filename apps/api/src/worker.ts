/** Processo dedicado do worker (fila de notificações, lembretes e rotinas de cobrança). */
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { startWorker } from './modules/notifications/worker'

const stop = startWorker(logger)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info(`Recebido ${signal}, encerrando worker…`)
    stop()
    await prisma.$disconnect()
    process.exit(0)
  })
}
