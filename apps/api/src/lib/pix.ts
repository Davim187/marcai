/**
 * PIX "copia e cola" estático (BR Code / EMV) com valor, a partir da chave do estabelecimento.
 * Especificação: Manual do BR Code (Banco Central). Não depende de banco/PSP.
 */

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), exigido no campo 63. */
function crc16(payload: string) {
  let crc = 0xffff
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Nome/cidade no BR Code: sem acento, só ASCII, tamanho limitado. */
function plain(text: string, max: number) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 .-]/g, '')
      .trim()
      .slice(0, max) || 'NA'
  )
}

/**
 * Normaliza a chave como o PIX espera: e-mail em minúsculas, telefone com +55, CPF/CNPJ só
 * dígitos, chave aleatória como veio. 11 dígitos sem "+" são tratados como CPF.
 */
export function normalizePixKey(raw: string) {
  const key = raw.trim()
  if (key.includes('@')) return key.toLowerCase()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))
    return key.toLowerCase()
  if (key.startsWith('+')) return `+${key.replace(/\D/g, '')}`
  const digits = key.replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14 ? digits : key
}

export function buildPixPayload(opts: {
  key: string
  amountCents: number
  merchantName: string
  merchantCity: string
  /** Identificador da cobrança (até 25 letras/números) */
  txid?: string
}) {
  const account = field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(opts.key))
  const txid = (opts.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const payload =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('54', (opts.amountCents / 100).toFixed(2)) +
    field('58', 'BR') +
    field('59', plain(opts.merchantName, 25)) +
    field('60', plain(opts.merchantCity, 15)) +
    field('62', field('05', txid)) +
    '6304'
  return payload + crc16(payload)
}
