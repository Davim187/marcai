import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default function globalSetup() {
  const DATABASE_URL =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/marcai_e2e?schema=public'
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api')
  const env = {
    ...process.env,
    DATABASE_URL,
    SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  }
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'inherit' })
  execSync('npx tsx prisma/seed.ts', { cwd, env, stdio: 'inherit' })
}
