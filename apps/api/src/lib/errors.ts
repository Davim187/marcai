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
export const SLOT_UNAVAILABLE_MESSAGE =
  'Esse horário não está disponível. Escolha outro horário da lista.'
export const SLOT_OVERLAP_PANEL_MESSAGE =
  'Já existe um agendamento nesse horário para esse profissional.'
export const PAST_TIME_MESSAGE =
  'Não dá para agendar no passado. Escolha um horário a partir de agora.'

export const slotTaken = () => conflict(SLOT_TAKEN_MESSAGE, 'HORARIO_OCUPADO')
export const slotUnavailable = () => conflict(SLOT_UNAVAILABLE_MESSAGE, 'HORARIO_INDISPONIVEL')
export const slotOverlapPanel = () => conflict(SLOT_OVERLAP_PANEL_MESSAGE, 'HORARIO_OCUPADO')
export const pastTime = () => badRequest(PAST_TIME_MESSAGE, 'HORARIO_PASSADO')
