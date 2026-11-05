import { AsyncLocalStorage } from 'node:async_hooks'

/** Dados da requisição atual, acessíveis em qualquer ponto (ex.: auditoria). */
export interface RequestContext {
  /** Super admin em modo suporte ("entrar como") */
  impersonatorId: string | null
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
