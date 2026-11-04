# =============================================================
#  Marcaí — imagem da API (e opcionalmente do front)
#  Build a partir da RAIZ do monorepo:
#    docker build -f apps/api/Dockerfile -t marcai-api .
#  Rodar a API:     docker run --env-file apps/api/.env -p 3333:3333 marcai-api
#  Rodar o worker:  docker run --env-file apps/api/.env marcai-api node dist/worker.js
# =============================================================
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @marcai/api exec prisma generate

FROM deps AS build
COPY . .
# O front é embutido na imagem: com WEB_DIST_DIR a API serve o SPA com meta tags (Open Graph).
RUN pnpm --filter @marcai/api build && pnpm --filter @marcai/web exec vite build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3333 \
    WEB_DIST_DIR=/app/web \
    UPLOAD_DIR=/app/uploads
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /app/uploads && addgroup -S marcai && adduser -S marcai -G marcai && chown -R marcai:marcai /app/uploads
USER marcai
WORKDIR /app/apps/api
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
# Aplica as migrations e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
