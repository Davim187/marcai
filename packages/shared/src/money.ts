const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata centavos como `R$ 1.234,56`. Normaliza o espaço não separável do Intl. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, ' ')
}

/** Converte "1.234,56", "120", "120,5" ou "R$ 99,90" em centavos. Retorna null se inválido. */
export function parseBRLToCents(input: string): number | null {
  const clean = input
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}

export function formatPrice(cents: number, priceFrom: boolean): string {
  return priceFrom ? `a partir de ${formatBRL(cents)}` : formatBRL(cents)
}
