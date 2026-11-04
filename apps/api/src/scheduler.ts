import type { FastifyBaseLogger } from 'fastify'
import { MINUTE_MS } from '@marcai/shared'
import { env } from './config/env'
import { logger as baseLogger } from './lib/logger'
import { runBillingTick } from './modules/billing/billing.tick'
import { processDueJobs, scheduleDailySummaries } from './modules/notifications/worker'

type Log = FastifyBaseLogger | typeof baseLogger

/**
 * Agendador de tarefas em segundo plano. Cada domínio registra aqui o que roda e com que
 * frequência — é o único lugar para descobrir "o que roda sozinho" no sistema.
 */
const TASKS: Array<{ name: string; everyMs: number; run: (log: Log) => Promise<unknown> }> = [
  { name: 'fila de notificações', everyMs: 0, run: (log) => processDueJobs(log) },
  { name: 'resumo diário das 07:00', everyMs: MINUTE_MS, run: () => scheduleDailySummaries() },
  { name: 'rotina de cobrança', everyMs: MINUTE_MS, run: () => runBillingTick() },
]

/** Inicia o loop. Retorna uma função para parar. */
export function startWorker(log: Log = baseLogger): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | null = null
  const lastRun = new Map<string, number>()
  const loop = async () => {
    if (stopped) return
    for (const task of TASKS) {
      if (Date.now() - (lastRun.get(task.name) ?? 0) < task.everyMs) continue
      lastRun.set(task.name, Date.now())
      await task
        .run(log)
        .catch((err) => log.error({ err, task: task.name }, 'Erro em tarefa agendada'))
    }
    if (!stopped) timer = setTimeout(loop, env.WORKER_POLL_MS)
  }
  log.info('⚙️  Worker de tarefas iniciado (notificações, resumo diário, cobrança)')
  void loop()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
