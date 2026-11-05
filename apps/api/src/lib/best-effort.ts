import { logger } from './logger'

/**
 * Executa algo que pode falhar sem derrubar o fluxo principal, mas registra a falha
 * (em vez de `.catch(() => undefined)`, que esconde o problema).
 */
export async function bestEffort<T>(
  task: Promise<T>,
  what: string,
  context: Record<string, unknown> = {},
): Promise<T | undefined> {
  try {
    return await task
  } catch (err) {
    logger.warn({ err, ...context }, `Falha (ignorada) ao ${what}`)
    return undefined
  }
}
