export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'painel',
  'entrar',
  'cadastro',
  'login',
  'logout',
  'sair',
  'app',
  'www',
  'agendamento',
  'a',
  'termos',
  'privacidade',
  'precos',
  'planos',
  'ajuda',
  'suporte',
  'blog',
  'static',
  'assets',
  'docs',
  'onboarding',
  'recuperar-senha',
  'redefinir-senha',
  'marcai',
  'sitemap.xml',
  'robots.txt',
  'manifest.webmanifest',
  'sw.js',
  'favicon.ico',
  'og',
  'uploads',
  'webhooks',
  'health',
  'conta',
  'sobre',
  'contato',
])

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug) && !slug.includes('--')
}
