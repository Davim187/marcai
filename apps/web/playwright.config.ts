import { defineConfig, devices } from '@playwright/test'

/**
 * E2E: sobe a API (porta 3334) e o front (porta 5174) contra um banco separado,
 * com migrations + seed aplicados no globalSetup.
 */
const E2E_DB =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/marcai_e2e?schema=public'
const API_PORT = 3334
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
  },
  projects: [{ name: 'celular', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      command: 'pnpm --filter @marcai/api exec tsx src/server.ts',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DB,
        APP_URL: `http://localhost:${WEB_PORT}`,
        API_URL: `http://localhost:${API_PORT}`,
        SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
        RUN_WORKER_IN_API: 'true',
        WORKER_POLL_MS: '1000',
        WHATSAPP_PROVIDER: 'console',
        BILLING_PROVIDER: 'fake',
        APP_MODE: 'saas',
      },
    },
    {
      command: `pnpm exec vite`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_PORT: String(WEB_PORT), VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
})
