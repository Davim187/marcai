import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

const testEnv = config({ path: '.env.test', override: true }).parsed ?? {}

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Testes de integração compartilham o mesmo banco: rodam em série.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
