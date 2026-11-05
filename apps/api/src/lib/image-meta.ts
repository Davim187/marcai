/**
 * Remove metadados (EXIF com GPS, câmera, data) de JPEG e PNG sem reprocessar a imagem.
 * Outros formatos voltam inalterados.
 */
export function stripImageMetadata(buffer: Buffer, ext: string): Buffer {
  try {
    if (ext === 'jpg') return stripJpeg(buffer)
    if (ext === 'png') return stripPng(buffer)
  } catch {
    // Arquivo fora do padrão: melhor recusar do que guardar com metadados
    throw new Error('Imagem corrompida')
  }
  return buffer
}

/** JPEG: descarta os segmentos APP1 (EXIF/XMP) e APP13 (IPTC) antes dos dados da imagem. */
function stripJpeg(b: Buffer): Buffer {
  const parts: Buffer[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('JPEG inválido')
    const marker = b[i + 1]!
    if (marker === 0xda) {
      parts.push(b.subarray(i)) // início dos dados: copia o resto
      return Buffer.concat(parts)
    }
    const len = b.readUInt16BE(i + 2)
    const segment = b.subarray(i, i + 2 + len)
    if (marker !== 0xe1 && marker !== 0xed) parts.push(segment)
    i += 2 + len
  }
  throw new Error('JPEG incompleto')
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])

/** PNG: descarta os blocos de texto/EXIF. */
function stripPng(b: Buffer): Buffer {
  const parts: Buffer[] = [b.subarray(0, 8)]
  let i = 8
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i)
    const type = b.subarray(i + 4, i + 8).toString('latin1')
    const chunk = b.subarray(i, i + 12 + len)
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(chunk)
    i += 12 + len
    if (type === 'IEND') return Buffer.concat(parts)
  }
  throw new Error('PNG incompleto')
}
