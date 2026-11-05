import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env'
import { badRequest } from './errors'
import { randomToken } from './crypto'
import { stripImageMetadata } from './image-meta'

/**
 * Armazenamento de arquivos. Implementação local (pasta UPLOAD_DIR servida em /uploads).
 * Para produção com várias instâncias, troque por S3/R2 implementando a mesma interface.
 */
export interface StorageProvider {
  save(folder: string, buffer: Buffer, ext: string): Promise<string>
  /** Arquivo privado (ex.: foto da cliente): servido só por rota autenticada. */
  savePrivate(folder: string, buffer: Buffer, ext: string): Promise<string>
}

const SIGNATURES: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
  { ext: 'gif', test: (b) => b.subarray(0, 3).toString() === 'GIF' },
  {
    ext: 'heic',
    test: (b) =>
      b.subarray(4, 12).toString().startsWith('ftyphei') ||
      b.subarray(4, 12).toString().startsWith('ftypmif1'),
  },
]

/** Detecta o tipo real da imagem pelos bytes (não confia na extensão enviada). */
export function detectImage(buffer: Buffer): string {
  const sig = SIGNATURES.find((s) => s.test(buffer))
  if (!sig) throw badRequest('Envie uma imagem JPG, PNG, WEBP ou HEIC.', 'ARQUIVO_INVALIDO')
  return sig.ext
}

export const uploadRoot = path.resolve(env.UPLOAD_DIR)
/** Fora da pasta pública: nunca é servida pelo /uploads. */
export const privateUploadRoot = `${uploadRoot}-privado`
export const PRIVATE_UPLOAD_PREFIX = '/api/uploads/private/'
const safe = (folder: string) => folder.replace(/[^a-zA-Z0-9_-]/g, '')

class LocalStorage implements StorageProvider {
  async save(folder: string, buffer: Buffer, ext: string) {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '')
    const dir = path.join(uploadRoot, safeFolder)
    await mkdir(dir, { recursive: true })
    const name = `${randomToken(12)}.${ext}`
    await writeFile(path.join(dir, name), buffer)
    return `/uploads/${safeFolder}/${name}`
  }
  async savePrivate(folder: string, buffer: Buffer, ext: string) {
    const dir = path.join(privateUploadRoot, safe(folder))
    await mkdir(dir, { recursive: true })
    const name = `${randomToken(16)}.${ext}`
    await writeFile(path.join(dir, name), stripImageMetadata(buffer, ext))
    return `${PRIVATE_UPLOAD_PREFIX}${safe(folder)}/${name}`
  }
}

/** Caminho local de um arquivo privado a partir da URL (ou null se a URL não for válida). */
export function privateFilePath(url: string) {
  const m = url.match(/^\/api\/uploads\/private\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+\.[a-z]{3,4})$/)
  return m ? { folder: m[1]!, file: path.join(privateUploadRoot, m[1]!, m[2]!) } : null
}

export const storage: StorageProvider = new LocalStorage()
