import type { FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { env } from '../../config/env'
import { setNotFoundFallback } from '../../plugins/error-handler'
import { escapeHtml, injectMeta, metaForPath, metaTags, robotsTxt, sitemapXml } from './meta'

/**
 * SEO no servidor:
 * - /sitemap.xml e /robots.txt dinâmicos;
 * - /api/public/og?path=/slug → HTML só com as meta tags (para robôs do WhatsApp/Instagram
 *   quando o front está na Vercel/Netlify, via rewrite por user-agent);
 * - se WEB_DIST_DIR estiver definido, a API também serve o SPA e injeta as meta tags
 *   em "/" e "/:slug" (prévia bonita ao compartilhar o link).
 */
export async function seoRoutes(app: FastifyInstance) {
  app.get('/sitemap.xml', { schema: { hide: true } }, async (_req, reply) =>
    reply.type('application/xml').send(await sitemapXml()),
  )
  app.get('/robots.txt', { schema: { hide: true } }, async (_req, reply) =>
    reply.type('text/plain').send(robotsTxt()),
  )

  app.get('/api/public/og', { schema: { hide: true } }, async (request, reply) => {
    const p = String((request.query as { path?: string }).path ?? '/')
    const meta = await metaForPath(p)
    const url = escapeHtml(meta.url)
    reply.header('cache-control', 'public, max-age=300')
    // Página só para robôs: nenhum script é permitido.
    reply.header(
      'content-security-policy',
      "default-src 'none'; img-src * data:; style-src 'unsafe-inline'",
    )
    return reply
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />\n    ${metaTags(meta)}\n<meta http-equiv="refresh" content="0;url=${url}" /></head><body><a href="${url}">${escapeHtml(meta.title)}</a></body></html>`,
      )
  })
}

export async function registerSpa(app: FastifyInstance) {
  const dist = env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : null
  if (!dist || !existsSync(path.join(dist, 'index.html'))) return
  const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8')

  await app.register(fastifyStatic, {
    root: dist,
    prefix: '/',
    wildcard: false,
    index: false,
    decorateReply: false,
    maxAge: '1y',
    immutable: true,
  })

  setNotFoundFallback(async (request, reply) => {
    const meta = await metaForPath(request.url)
    reply.header('cache-control', 'no-cache')
    return reply.type('text/html; charset=utf-8').send(injectMeta(indexHtml, meta))
  })
  app.log.info(`🌐 Servindo o front de ${dist} com meta tags dinâmicas`)
}
