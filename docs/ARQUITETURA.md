# Arquitetura do Marcaí

Este documento explica como o sistema está organizado, como funcionam o agendamento, as notificações e a multi-tenancy, e registra as decisões tomadas onde o pedido original era ambíguo.

## Visão geral

```
┌──────────────────────────┐      /api (mesmo domínio)      ┌──────────────────────────────┐
│ apps/web (React 19/Vite) │ ─────────────────────────────▶ │ apps/api (Fastify + Prisma)  │
│ landing · página pública │ ◀── SSE /notifications/stream ─ │ rotas REST · webhooks        │
│ painel (PWA) · admin     │                                 │ worker da fila (embutido ou  │
└──────────────────────────┘                                 │ processo separado)           │
            ▲                                                └──────────────┬───────────────┘
            │ importa                                                       │
┌───────────┴──────────────┐                                ┌───────────────▼──────────────┐
│ packages/shared          │◀────────── importa ────────────│ PostgreSQL 16                │
│ schemas Zod · motor de   │                                │ exclusion constraint         │
│ disponibilidade · planos │                                │ (tsrange + btree_gist)       │
└──────────────────────────┘                                └──────────────────────────────┘
        Provedores externos: Asaas (cobrança) · Evolution/Meta (WhatsApp) · Resend (e-mail) · Web Push
```

- **`packages/shared`** é consumido como código-fonte TypeScript: o Vite compila no front e o tsup empacota na API. Os **mesmos schemas Zod** validam o formulário no navegador e o corpo da requisição no servidor, e o **mesmo motor de disponibilidade** (`availability.ts`) é a fonte da verdade no back-end.
- **`apps/api`** é organizada por domínio em `src/modules/<domínio>`, com as regras de negócio em _services_ (`booking.service.ts`, `billing.service.ts`…) separadas das rotas.
- **`apps/web`** é organizada por feature em `src/features/<feature>`, com os componentes de UI reutilizáveis em `src/components/ui`.

## Módulos da API

| Módulo                  | Responsabilidade                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `auth`                  | Cadastro, login (senha/Google), sessão em cookie httpOnly, CSRF, recuperação de senha, `/auth/me` |
| `tenants`               | Onboarding (presets), checagem de slug, aparência, regras de agendamento                          |
| `services`              | Serviços e categorias (soft delete, ordenação)                                                    |
| `team`                  | Profissionais e membros (dona/profissional), convites                                             |
| `schedule`              | Expediente, bloqueios pontuais e recorrentes, feriados                                            |
| `forms`                 | Campos personalizados do formulário de agendamento                                                |
| `booking`               | Disponibilidade, página pública, criação/remarcação/cancelamento, painel, área da cliente         |
| `customers`             | Clientes (deduplicadas pelo telefone), estatísticas, CSV, LGPD                                    |
| `notifications`         | Canais, provedores de WhatsApp, fila, worker, templates, SSE, webhooks                            |
| `billing`               | `BillingProvider` (Asaas/Fake), assinatura, faturas, webhooks, rotina de vencimento               |
| `reports` · `dashboard` | Agregações para relatórios e para a tela inicial                                                  |
| `admin`                 | Painel do super admin (MRR, churn, estender teste, bloquear, "entrar como")                       |
| `account`               | Perfil, exportação e exclusão da conta (LGPD)                                                     |
| `seo`                   | Meta tags Open Graph no servidor, sitemap, robots, servir o SPA                                   |
| `uploads`               | Upload de imagens (validação pelos bytes, `StorageProvider` local)                                |

## Multi-tenancy

Cada estabelecimento é um `Tenant`, e todas as tabelas de dados do negócio têm `tenantId`.

1. **Contexto:** o guard `requireTenant` (`plugins/auth.ts`) lê a sessão, confere se a usuária é membro do tenant ativo e cria `request.tenantCtx`, com o `tenant`, a assinatura, o papel (`owner`/`professional`), o nível de acesso e um cliente de banco **escopado**.
2. **Cliente escopado (`lib/tenant-db.ts`):** `forTenant(tenantId)` é uma _Prisma Client Extension_ que, para todos os modelos da lista `TENANT_SCOPED_MODELS`:
   - adiciona `tenantId` em todo `where` (find, count, aggregate, groupBy, update, delete, upsert);
   - injeta `tenantId` em todo `create`/`createMany`;
   - lança `TenantIsolationError` se alguém tentar ler ou gravar com o `tenantId` de outro tenant.

   Mesmo esquecendo o filtro numa query, é impossível ver dados de outro estabelecimento. Isso é provado em `apps/api/test/tenant-isolation.test.ts`.

3. **Cliente "cru" (`lib/prisma.ts`):** é usado só onde o tenant é resolvido de outra forma: rotas públicas (pelo **slug** ou pelo **token** do agendamento, sempre filtrando pelo `tenantId` resolvido), auth, super admin e worker.
4. **Autorização:** toda rota do painel declara um guard (`requireTenant`, `requireOwner`, `requireSuperAdmin`, `requireFeature`). A profissional que não é dona só enxerga os agendamentos e avisos da própria agenda (`scopeWhere`).

## Fluxo de agendamento

```
Cliente                         API                                          Postgres
  │ GET /public/t/:slug  ──────▶ perfil, serviços, profissionais, perguntas
  │ GET …/availability   ──────▶ loadAvailabilityInput → getAvailableDates ◀─ expediente, bloqueios,
  │ GET …/slots?date     ──────▶ getDaySlots                                 feriados, agendamentos
  │ POST …/bookings      ──────▶ 1. Zod (celular BR, consentimento, honeypot)
  │                              2. rate limit por IP (plugin) e por telefone (consulta)
  │                              3. checkSlot: o horário ainda é ofertável?
  │                              4. valida respostas obrigatórias/opções
  │                              5. upsert da cliente (tenantId + telefone)
  │                              6. INSERT booking ──────────────────────▶ EXCLUDE USING gist
  │                                 └─ 23P01? → 409 "Esse horário acabou     (professionalId =,
  │                                    de ser reservado, escolha outro"       tsrange && )
  │                              7. onBookingCreated → avisos + fila
  │ ◀── 201 resumo, Google Agenda, .ics, link de gestão
```

### Motor de disponibilidade (`packages/shared/src/availability.ts`)

É uma função pura que recebe o fuso do estabelecimento, o instante "agora", os turnos (vários por dia, inclusive turnos que viram a meia-noite), os bloqueios pontuais (UTC), as pausas recorrentes, as datas fechadas, os intervalos ocupados (`[startsAt, blockedUntil)`), a duração, o intervalo de limpeza, o passo entre opções e as antecedências. Para cada candidato:

- `[início, início + duração)` precisa caber no turno e **não pode sobrepor bloqueios**;
- `[início, início + duração + limpeza)` **não pode sobrepor agendamentos**;
- o início precisa ser `>= agora + antecedência mínima` e a data local no máximo `maxAdvanceDays` à frente.

A conversão local → UTC usa `date-fns-tz` (`fromZonedTime`), por isso funciona para qualquer fuso brasileiro. Todas as datas são salvas em UTC.

### Proteção contra concorrência

A tabela `Booking` guarda `blockedUntil = endsAt + intervalo de limpeza` e tem a constraint:

```sql
EXCLUDE USING gist ("professionalId" WITH =, tsrange("startsAt", "blockedUntil", '[)') WITH &&)
WHERE (status IN ('pending', 'confirmed', 'completed'))
```

O Postgres garante atomicamente que dois agendamentos ativos da mesma profissional nunca se sobrepõem, mesmo com requisições simultâneas, sem precisar de lock na aplicação. Agendamentos cancelados ou com falta não ocupam horário. Os testes em `apps/api/test/booking.test.ts` disparam 6 reservas simultâneas no mesmo horário (só 1 passa) e duas reservas em horários diferentes que se sobrepõem.

## Fluxo de notificação

```
evento de domínio (criado/cancelado/remarcado/confirmado)
  └─ events.ts (nunca derruba o agendamento: erros são logados)
       ├─ InApp: grava Notification + publica no SSE (sseHub) ──▶ sino do painel (toast + som)
       ├─ enqueue(push)      → NotificationJob
       ├─ enqueue(whatsapp)  → só se o plano permitir (canNotify / hasFeature)
       ├─ enqueue(email)     → quando não há WhatsApp (Essencial) ou para a cliente com e-mail
       └─ lembrete: job com runAt = início − X horas, dedupeKey por agendamento+horário

worker (a cada WORKER_POLL_MS)
  ├─ claimJobs: UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) → status=processing
  ├─ resolveMessage: lembrete/resumo são montados na hora (descartados se obsoletos)
  ├─ channel.send()
  ├─ sucesso → done · erro temporário → backoff 30s·2^n · erro permanente/esgotado → failed
  │                                                       └─ WhatsApp da profissional → fallback por e-mail
  └─ a cada minuto: agenda os resumos das 07:00 e roda a rotina de cobrança
```

- **Canais** implementam `NotificationChannel` (`inapp`, `push`, `whatsapp`, `email`).
- **WhatsApp** usa a interface `WhatsAppProvider`: `EvolutionApiProvider` (instância por estabelecimento, conectada por QR Code), `MetaCloudApiProvider` (número oficial da plataforma, com template) ou `ConsoleWhatsAppProvider` (desenvolvimento). A escolha vem de `WHATSAPP_PROVIDER`.
- **Textos** vêm de `MessageTemplate` (personalizados) ou de `DEFAULT_TEMPLATES` (`packages/shared/src/templates.ts`), com as variáveis `{cliente}`, `{servico}`, `{data}`, `{hora}`, `{valor}`, `{link}`, `{respostas}` etc.
- **SSE:** o hub é em memória por instância. Com várias instâncias da API, o painel ainda recebe os avisos pelo polling de 15s, que funciona como fallback.

## Assinaturas e acesso

- Os planos e o feature gating ficam num **único lugar**: `packages/shared/src/plans.ts` (`PLANS`, `hasFeature`, `effectivePlan`, `accessLevel`). A API usa esse arquivo nos guards (`requireFeature`) e nas notificações (`canNotify`), e o front o usa só para exibição. A regra é sempre aplicada no back-end.
- `accessLevel`:
  - `full`: em dia ou no teste;
  - `grace`: vencida há até 7 dias, com banner;
  - `blocked`: mais de 7 dias, ou tenant bloqueado pelo admin. A página pública mostra "agenda temporariamente indisponível" e a API recusa escritas no painel com `402 SOMENTE_LEITURA`, exceto nas rotas de assinatura, conta e autenticação.
- Os webhooks de cobrança são verificados (token do Asaas) e **idempotentes** (`WebhookEvent` com `(provider, eventId)` único).

## Segurança

- Sessão opaca em cookie `httpOnly` + `SameSite`. No banco fica só o **HMAC** do token. O CSRF usa double submit: o cookie `marcai_csrf` precisa ser igual ao header `x-csrf-token` em todo método que altera dados.
- CORS restrito a `APP_URL` (+ `CORS_ORIGINS`). Rate limiting nas rotas públicas e no login (`@fastify/rate-limit`), além do limite por telefone na reserva.
- Zod em todo corpo, query e params (via `fastify-type-provider-zod`) e nos webhooks.
- Os uploads são validados pela assinatura dos bytes (não pela extensão), com limite de tamanho.
- Logs estruturados com pino, com redaction de cookies e senhas. Os erros chegam ao usuário em português (`plugins/error-handler.ts`).
- Ações sensíveis vão para o `AuditLog` (exportações, exclusões, ações do super admin, "entrar como").

## Decisões tomadas (onde o pedido era ambíguo)

| Tema                       | Decisão                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teste grátis               | Durante os 30 dias, o plano efetivo é o **Pro**, para a profissional experimentar o WhatsApp. Depois vale o plano escolhido.                                   |
| Primeira cobrança          | Acontece **no fim do teste**. Assinar durante o teste não cobra na hora.                                                                                       |
| Prazo de carência          | 7 dias contados do fim do período pago (ou do fim do teste).                                                                                                   |
| Proteção de concorrência   | Exclusion constraint no Postgres (em vez de `SELECT … FOR UPDATE`): é atômica, mais simples e cobre também sobreposições parciais.                             |
| Colunas de data            | `timestamp(3)` do Prisma, sempre em UTC, por isso a constraint usa `tsrange`.                                                                                  |
| Intervalo de limpeza       | Conta só contra outros agendamentos (pode passar do fim do turno). Bloqueios só consideram a duração do serviço.                                               |
| Escolha de profissional    | Se só uma profissional faz o serviço, a etapa é pulada. Não há opção "qualquer profissional" na v1.                                                            |
| Confirmação manual         | Opcional por estabelecimento. Quando ligada, os agendamentos online chegam como `pendente`, mas **já ocupam o horário**.                                       |
| Encaixe manual             | No painel, a profissional pode agendar fora do expediente: só o conflito com outra cliente é bloqueado.                                                        |
| Lembrete                   | Enviado X horas antes (padrão 24h). Se o agendamento é criado depois desse ponto, sai na hora, desde que falte mais de 1h.                                     |
| Resumo diário              | Agendado entre 07:00 e 12:00 no fuso do estabelecimento (com recuperação se o worker estava parado), deduplicado por dia.                                      |
| WhatsApp na Meta           | O número é da plataforma, com um template de uma variável. Quebras de linha viram "·".                                                                         |
| Exclusão de cliente (LGPD) | Os dados pessoais são **anonimizados** e o histórico financeiro é mantido sem identificação. Os agendamentos futuros são cancelados.                           |
| Exclusão de conta          | Se a pessoa é a única dona, o estabelecimento inteiro é apagado (cascata) e a assinatura é cancelada no provedor.                                              |
| "Entrar como"              | Cria uma sessão de 1 dia para a dona do tenant, marcada com `impersonatorId` e auditada. Ao sair, o admin entra de novo.                                       |
| OG / SEO                   | A API gera as meta tags. Com o front na Vercel, os robôs são reescritos por user-agent para `/api/public/og`.                                                  |
| Uploads                    | Armazenamento local atrás da interface `StorageProvider`. Para produção com várias instâncias, recomenda-se S3/R2.                                             |
| Feriados                   | Os nacionais (incluindo Carnaval, Sexta-feira Santa e Corpus Christi) são carregados no onboarding para o ano atual e o próximo, e cada um pode ser desligado. |
