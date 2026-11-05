import { badRequest } from './errors'

/** CSV simples compatível com Excel/Google Planilhas em português (separador ";" + BOM). */
export function toCsv(
  rows: Array<Record<string, unknown>>,
  headers: Array<{ key: string; label: string }>,
): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v)
    // Evita "CSV injection": célula começando com = + - @ vira texto no Excel/Planilhas
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.map((h) => esc(h.label)).join(';'),
    ...rows.map((r) => headers.map((h) => esc(r[h.key])).join(';')),
  ]
  return '\uFEFF' + lines.join('\r\n')
}

/** Arquivo binário (ex.: imagem renomeada para .csv) tem bytes de controle que texto não tem. */
function looksBinary(text: string) {
  const sample = text.slice(0, 4096)
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    if (code < 9 || (code > 13 && code < 32)) return true
  }
  return false
}

/** Parser tolerante: detecta "," ou ";" e respeita aspas. */
export function parseCsv(text: string): string[][] {
  // Arquivo binário (ex.: imagem renomeada para .csv) tem bytes nulos/de controle
  if (looksBinary(text)) {
    throw badRequest(
      'Esse arquivo não parece uma planilha CSV. Exporte como CSV e tente de novo.',
      'ARQUIVO_INVALIDO',
    )
  }
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (quoted) {
    throw badRequest(
      'A planilha tem aspas (") abertas e não fechadas. Corrija o arquivo e tente de novo.',
      'ARQUIVO_INVALIDO',
    )
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}
