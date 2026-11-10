import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { env } from '../config/env'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Hash com segredo do servidor — usado para tokens de sessão e de recuperação. */
export function hashToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Segredos guardados no banco (ex.: access token do Mercado Pago do estabelecimento).
 * AES-256-GCM com chave derivada do SESSION_SECRET: trocar o SESSION_SECRET exige
 * reconectar as contas. Formato: v1.<iv>.<tag>.<dados> (base64url).
 */
function secretKey() {
  return createHash('sha256').update(`marcai-secret-box:${env.SESSION_SECRET}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.')
}

export function decryptSecret(box: string): string | null {
  const [v, iv, tag, data] = box.split('.')
  if (v !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}
