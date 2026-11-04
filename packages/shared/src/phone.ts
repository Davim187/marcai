/**
 * Telefones são guardados normalizados como E.164 sem "+": 55 + DDD + número (ex.: 5585999999999).
 */
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Normaliza um celular brasileiro. Retorna null se não for um celular válido. */
export function normalizeBrazilianMobile(input: string): string | null {
  let d = onlyDigits(input)
  if (d.startsWith('55') && (d.length === 13 || d.length === 12)) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length !== 11) return null
  const ddd = Number(d.slice(0, 2))
  if (!VALID_DDDS.has(ddd)) return null
  if (d[2] !== '9') return null
  return `55${d}`
}

export function isValidBrazilianMobile(input: string): boolean {
  return normalizeBrazilianMobile(input) !== null
}

/** Formata para exibição: (85) 99999-9999 */
export function formatPhone(input: string): string {
  let d = onlyDigits(input)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return input
}

/** Máscara progressiva para inputs. */
export function maskPhone(input: string): string {
  const d = onlyDigits(input).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function whatsappLink(phone: string, text?: string): string {
  const d = onlyDigits(phone)
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
