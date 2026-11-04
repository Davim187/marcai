import { execSync } from 'node:child_process'
import { config } from 'dotenv'

export default function setup() {
  const env = config({ path: '.env.test', override: true }).parsed ?? {}
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, ...env } })
}
