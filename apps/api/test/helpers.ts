import type { InjectOptions } from 'fastify'
import { buildApp, type App } from '../src/app'
import { prisma } from '../src/lib/prisma'

export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    )
  }
}

let appPromise: Promise<App> | null = null
export function getApp() {
  appPromise ??= buildApp()
  return appPromise
}

/** Cliente HTTP de teste que guarda cookies e envia o CSRF automaticamente. */
export class TestAgent {
  cookies: Record<string, string> = {}
  constructor(private app: App) {}

  async request(opts: InjectOptions) {
    const cookieHeader = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) }
    if (cookieHeader) headers.cookie = cookieHeader
    if (this.cookies.marcai_csrf && opts.method && opts.method !== 'GET') {
      headers['x-csrf-token'] = this.cookies.marcai_csrf
    }
    const res = await this.app.inject({ ...opts, headers })
    for (const c of res.cookies) {
      if (c.value === '' || (c.maxAge !== undefined && c.maxAge <= 0)) delete this.cookies[c.name]
      else this.cookies[c.name] = c.value
    }
    return res
  }
  get(url: string) {
    return this.request({ method: 'GET', url })
  }
  post(url: string, payload?: unknown) {
    return this.request({ method: 'POST', url, payload: payload as InjectOptions['payload'] })
  }
  put(url: string, payload?: unknown) {
    return this.request({ method: 'PUT', url, payload: payload as InjectOptions['payload'] })
  }
  patch(url: string, payload?: unknown) {
    return this.request({ method: 'PATCH', url, payload: payload as InjectOptions['payload'] })
  }
  delete(url: string) {
    return this.request({ method: 'DELETE', url })
  }
}

const DEFAULT_SHIFTS = [2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, start: '08:00', end: '12:00' },
  { weekday, start: '13:30', end: '19:00' },
])

/** Cria conta + estabelecimento via API e devolve um agente autenticado. */
export async function createOwner(
  opts: {
    email?: string
    slug?: string
    name?: string
    businessType?: string
    shifts?: typeof DEFAULT_SHIFTS
  } = {},
) {
  const app = await getApp()
  const agent = new TestAgent(app)
  const email = opts.email ?? `dona-${Math.random().toString(36).slice(2, 8)}@teste.com`
  const reg = await agent.post('/api/auth/register', {
    name: opts.name ?? 'Maria Teste',
    email,
    password: 'senha12345',
    acceptTerms: true,
  })
  if (reg.statusCode !== 201) throw new Error(`register falhou: ${reg.body}`)
  const slug = opts.slug ?? `teste-${Math.random().toString(36).slice(2, 8)}`
  const onb = await agent.post('/api/tenant/onboarding', {
    businessName: opts.name ?? 'Studio Teste',
    slug,
    businessType: opts.businessType ?? 'manicure',
    shifts: opts.shifts ?? DEFAULT_SHIFTS,
  })
  if (onb.statusCode !== 201) throw new Error(`onboarding falhou: ${onb.body}`)
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
  const professional = await prisma.professional.findFirstOrThrow({
    where: { tenantId: tenant.id },
  })
  return { agent, tenant, professional, email, slug }
}
