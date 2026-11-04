export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'ERRO',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (
  m = 'Requisição inválida',
  code = 'REQUISICAO_INVALIDA',
  details?: unknown,
) => new AppError(400, m, code, details)
export const unauthorized = (m = 'Você precisa entrar na sua conta') =>
  new AppError(401, m, 'NAO_AUTENTICADO')
export const forbidden = (m = 'Você não tem permissão para fazer isso') =>
  new AppError(403, m, 'SEM_PERMISSAO')
export const notFound = (m = 'Não encontrado') => new AppError(404, m, 'NAO_ENCONTRADO')
export const conflict = (m: string, code = 'CONFLITO') => new AppError(409, m, code)
export const paymentRequired = (m: string, code = 'PLANO') => new AppError(402, m, code)
export const tooMany = (m = 'Muitas tentativas. Aguarde um pouco e tente de novo.') =>
  new AppError(429, m, 'MUITAS_TENTATIVAS')

export const SLOT_TAKEN_MESSAGE = 'Esse horário acabou de ser reservado, escolha outro'
