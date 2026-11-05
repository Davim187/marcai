import { buildApp } from './app'
import { env } from './config/env'
import { startWorker } from './scheduler'
import { registerSpa } from './modules/seo/spa'

async function main() {
  const app = await buildApp()
  await registerSpa(app)
  let stopWorker: (() => void) | null = null
  app.addHook('onClose', async () => stopWorker?.())
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  if (env.RUN_WORKER_IN_API) stopWorker = startWorker(app.log)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.log.info(`Recebido ${signal}, encerrando…`)
      app.close().then(() => process.exit(0))
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
