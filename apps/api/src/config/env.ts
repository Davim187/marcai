import 'dotenv/config'
import { z } from 'zod'

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  APP_MODE: z.enum(['saas', 'single_tenant']).default('saas'),
  SINGLE_TENANT_SLUG: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3333'),
  APP_NAME: z.string().default('Marcaí'),
  CORS_ORIGINS: z.string().optional().default(''),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** SMTP (Gmail, Hostinger, Zoho, SES…). Usado quando não há RESEND_API_KEY. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Marcaí <nao-responda@marcai.app>'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:contato@marcai.app'),
  WHATSAPP_PROVIDER: z.enum(['console', 'evolution', 'meta']).default('console'),
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  META_WA_TOKEN: z.string().optional(),
  META_WA_PHONE_NUMBER_ID: z.string().optional(),
  META_WA_APP_SECRET: z.string().optional(),
  META_WA_VERIFY_TOKEN: z.string().optional(),
  META_WA_TEMPLATE_NAME: z.string().default('marcai_aviso'),
  META_WA_TEMPLATE_LANG: z.string().default('pt_BR'),
  BILLING_PROVIDER: z.enum(['fake', 'mercadopago']).default('fake'),
  MP_API_URL: z.string().default('https://api.mercadopago.com'),
  /** Access token da conta do Mercado Pago (TEST-... no modo de testes, APP_USR-... em produção) */
  MP_ACCESS_TOKEN: z.string().optional(),
  /** "Assinatura secreta" do webhook (Suas integrações → Webhooks) */
  MP_WEBHOOK_SECRET: z.string().optional(),
  /** Dias antes do vencimento em que a fatura PIX/boleto é gerada e enviada por e-mail */
  BILLING_INVOICE_DAYS_BEFORE: z.coerce.number().int().min(1).max(20).default(5),
  RUN_WORKER_IN_API: bool,
  WORKER_POLL_MS: z.coerce.number().default(3000),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  WEB_DIST_DIR: z.string().optional(),
  /** false (padrão), true, número de proxies (ex.: 1) ou lista de IPs/CIDR confiáveis */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v): boolean | string => (!v || v === 'false' ? false : v === 'true' ? true : v)),
  SWAGGER_PUBLIC: bool,
})

const PLACEHOLDER_SECRETS = ['troque-por-um-segredo-aleatorio-de-64-caracteres']

/** Em produção, recusa configurações inseguras em vez de subir com elas. */
function productionProblems(e: z.infer<typeof schema>): string[] {
  if (e.NODE_ENV !== 'production') return []
  const problems: string[] = []
  if (e.SESSION_SECRET.length < 32 || PLACEHOLDER_SECRETS.includes(e.SESSION_SECRET)) {
    problems.push(
      'SESSION_SECRET precisa ser aleatório e ter pelo menos 32 caracteres (openssl rand -hex 32)',
    )
  }
  if (e.APP_MODE === 'saas' && e.BILLING_PROVIDER === 'fake') {
    problems.push('BILLING_PROVIDER=fake não pode ser usado em produção no modo SaaS')
  }
  if (
    e.BILLING_PROVIDER === 'mercadopago' &&
    (!e.MP_ACCESS_TOKEN || (e.MP_WEBHOOK_SECRET?.length ?? 0) < 16)
  ) {
    problems.push(
      'Com o Mercado Pago, defina MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET (assinatura secreta do webhook)',
    )
  }
  if (e.WHATSAPP_PROVIDER === 'evolution' && (e.EVOLUTION_WEBHOOK_SECRET?.length ?? 0) < 16) {
    problems.push('Com a Evolution API, defina um EVOLUTION_WEBHOOK_SECRET forte (16+ caracteres)')
  }
  if (e.WHATSAPP_PROVIDER === 'meta' && !e.META_WA_APP_SECRET) {
    problems.push('Com a Meta Cloud API, defina META_WA_APP_SECRET')
  }
  return problems
}

const parsed = schema.safeParse(
  Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v])),
)
if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors)
  throw new Error('Configuração inválida. Confira o arquivo .env (veja .env.example).')
}

const problems = productionProblems(parsed.data)
if (problems.length) {
  console.error('❌ Configuração insegura para produção:\n - ' + problems.join('\n - '))
  throw new Error(
    'Configuração insegura para produção. Confira o arquivo .env (veja .env.example).',
  )
}

export const env = parsed.data
export type Env = typeof env
export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
