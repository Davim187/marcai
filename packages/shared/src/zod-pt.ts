import { z, ZodIssueCode } from 'zod'

/**
 * Mensagens padrão do Zod em português. Schemas que definem a própria mensagem continuam
 * usando a deles; isto cobre o resto (ex.: "Expected number, received nan").
 */
const ptErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null')
        return { message: 'Campo obrigatório' }
      if (issue.expected === 'number' || issue.expected === 'integer')
        return { message: 'Informe um número válido' }
      if (issue.expected === 'date') return { message: 'Data inválida' }
      return { message: 'Valor inválido' }
    case ZodIssueCode.too_small:
      if (issue.type === 'string')
        return { message: `Use pelo menos ${issue.minimum} caractere(s)` }
      if (issue.type === 'array') return { message: `Escolha pelo menos ${issue.minimum} item(ns)` }
      if (issue.type === 'number') return { message: `O valor mínimo é ${issue.minimum}` }
      return { message: 'Valor pequeno demais' }
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Use no máximo ${issue.maximum} caractere(s)` }
      if (issue.type === 'array') return { message: `Escolha no máximo ${issue.maximum} item(ns)` }
      if (issue.type === 'number') return { message: `O valor máximo é ${issue.maximum}` }
      return { message: 'Valor grande demais' }
    case ZodIssueCode.invalid_enum_value:
      return { message: 'Escolha uma opção válida' }
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Informe um e-mail válido' }
      if (issue.validation === 'url') return { message: 'Informe um link válido' }
      return { message: 'Formato inválido' }
    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida' }
    case ZodIssueCode.not_multiple_of:
      return { message: 'Valor inválido' }
    default:
      return { message: ctx.defaultError === 'Required' ? 'Campo obrigatório' : 'Valor inválido' }
  }
}

z.setErrorMap(ptErrorMap)
export { ptErrorMap }
