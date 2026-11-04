import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'

export interface PageMeta {
  title: string
  description: string
  image: string
  url: string
  favicon?: string | null
  themeColor?: string
  noindex?: boolean
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const abs = (u: string) =>
  u.startsWith('http') ? u : `${env.APP_URL}${u.startsWith('/') ? '' : '/'}${u}`

const LANDING: Omit<PageMeta, 'url'> = {
  title: 'Marcaí — Sua agenda cheia, sem precisar responder mensagem',
  description:
    'Agendamento online para salões, barbearias, estúdios e profissionais de beleza. Seu cliente escolhe o horário pelo link na bio e você recebe o aviso na hora, até no WhatsApp. 30 dias grátis.',
  image: '/og-default.png',
}

const STATIC_PAGES: Record<string, Pick<PageMeta, 'title' | 'description'>> = {
  '/entrar': { title: 'Entrar', description: 'Acesse seu painel de agendamentos.' },
  '/cadastro': {
    title: 'Criar conta grátis',
    description: 'Crie sua agenda online em menos de 3 minutos. 30 dias grátis, sem cartão.',
  },
  '/termos': { title: 'Termos de uso', description: 'Termos de uso da plataforma.' },
  '/privacidade': {
    title: 'Política de privacidade',
    description: 'Como tratamos seus dados, em conformidade com a LGPD.',
  },
}

/** Monta as meta tags (título, descrição e Open Graph) de cada rota pública. */
export async function metaForPath(path: string): Promise<PageMeta> {
  const clean = path.split('?')[0]!.replace(/\/+$/, '') || '/'
  const url = abs(clean)
  const single = env.APP_MODE === 'single_tenant'

  const tenantMeta = async (slug: string): Promise<PageMeta | null> => {
    const t = await prisma.tenant.findUnique({ where: { slug } })
    if (!t || t.deletedAt || !t.onboardingCompleted) return null
    return {
      title: `${t.name} — Agende seu horário online`,
      description:
        t.bio?.slice(0, 200) ||
        `Escolha o serviço e o melhor horário em ${t.name}. Agendamento online rápido, sem precisar mandar mensagem.`,
      image: abs(t.coverUrl ?? t.logoUrl ?? '/og-default.png'),
      url,
      favicon: t.faviconUrl ?? t.logoUrl,
      themeColor: t.primaryColor,
    }
  }

  if (single) {
    const t = env.SINGLE_TENANT_SLUG ? await tenantMeta(env.SINGLE_TENANT_SLUG) : null
    if (t)
      return {
        ...t,
        ...(clean === '/'
          ? {}
          : { noindex: clean.startsWith('/painel') || clean.startsWith('/a/') }),
      }
  }
  if (clean === '/') return { ...LANDING, image: abs(LANDING.image), url }
  if (STATIC_PAGES[clean])
    return {
      ...STATIC_PAGES[clean]!,
      title: `${STATIC_PAGES[clean]!.title} — ${env.APP_NAME}`,
      image: abs('/og-default.png'),
      url,
    }
  if (
    clean.startsWith('/painel') ||
    clean.startsWith('/admin') ||
    clean.startsWith('/a/') ||
    clean.startsWith('/onboarding')
  ) {
    return {
      title: env.APP_NAME,
      description: LANDING.description,
      image: abs(LANDING.image),
      url,
      noindex: true,
    }
  }
  const slug = clean.slice(1)
  if (/^[a-z0-9-]{3,40}$/.test(slug)) {
    const t = await tenantMeta(slug)
    if (t) return t
  }
  return { ...LANDING, image: abs(LANDING.image), url }
}

export function metaTags(m: PageMeta) {
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
    ...(m.noindex ? ['<meta name="robots" content="noindex" />'] : []),
    ...(m.favicon ? [`<link rel="icon" href="${esc(abs(m.favicon))}" />`] : []),
    ...(m.themeColor ? [`<meta name="theme-color" content="${esc(m.themeColor)}" />`] : []),
  ].join('\n    ')
}

/** Substitui o bloco <!--app-head--> … <!--/app-head--> do index.html. */
export function injectMeta(html: string, m: PageMeta) {
  return html.replace(
    /<!--app-head-->[\s\S]*?<!--\/app-head-->/,
    `<!--app-head-->\n    ${metaTags(m)}\n    <!--/app-head-->`,
  )
}

export async function sitemapXml() {
  const tenants =
    env.APP_MODE === 'single_tenant'
      ? []
      : await prisma.tenant.findMany({
          where: { deletedAt: null, blocked: false, onboardingCompleted: true },
          select: { slug: true, updatedAt: true },
          take: 50_000,
        })
  const urls = [
    { loc: `${env.APP_URL}/`, priority: '1.0' },
    ...(env.APP_MODE === 'saas'
      ? [
          { loc: `${env.APP_URL}/cadastro`, priority: '0.8' },
          { loc: `${env.APP_URL}/termos`, priority: '0.3' },
          { loc: `${env.APP_URL}/privacidade`, priority: '0.3' },
        ]
      : []),
    ...tenants.map((t) => ({
      loc: `${env.APP_URL}/${t.slug}`,
      priority: '0.6',
      lastmod: t.updatedAt.toISOString().slice(0, 10),
    })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `  <url><loc>${u.loc}</loc>${'lastmod' in u ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`,
    )
    .join('\n')}\n</urlset>\n`
}

export function robotsTxt() {
  return `User-agent: *\nAllow: /\nDisallow: /painel\nDisallow: /admin\nDisallow: /a/\nDisallow: /api/\n\nSitemap: ${env.APP_URL}/sitemap.xml\n`
}
