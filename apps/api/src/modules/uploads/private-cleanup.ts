import { readdir, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { HOUR_MS } from '@marcai/shared'
import { prisma } from '../../lib/prisma'
import { PRIVATE_UPLOAD_PREFIX, privateFilePath, privateUploadRoot } from '../../lib/storage'

/** Apaga as fotos privadas (referência) informadas, ignorando as que já não existem. */
export async function deletePrivateFiles(urls: unknown[]) {
  for (const url of urls) {
    const found = typeof url === 'string' ? privateFilePath(url) : null
    if (found) await unlink(found.file).catch(() => undefined)
  }
}

/** Apaga a pasta de fotos privadas de um estabelecimento (exclusão da conta). */
export async function deleteTenantPrivateFiles(tenantId: string) {
  await rm(path.join(privateUploadRoot, `${tenantId}-ref`), { recursive: true, force: true })
}

/**
 * Fotos enviadas na página pública mas nunca usadas numa reserva (desistiu, robô): apagadas
 * depois de 24h. Evita usar o servidor como hospedagem e guardar foto de quem não agendou.
 */
export async function cleanupOrphanPrivateUploads(now = Date.now()) {
  const folders = await readdir(privateUploadRoot).catch(() => [] as string[])
  let removed = 0
  for (const folder of folders) {
    const dir = path.join(privateUploadRoot, folder)
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const file = path.join(dir, name)
      const info = await stat(file).catch(() => null)
      if (!info || now - info.mtimeMs < 24 * HOUR_MS) continue
      const url = `${PRIVATE_UPLOAD_PREFIX}${folder}/${name}`
      const used = await prisma.bookingFieldAnswer.count({
        where: { type: 'photo', value: { equals: url } },
      })
      if (!used) {
        await unlink(file).catch(() => undefined)
        removed++
      }
    }
  }
  return removed
}
