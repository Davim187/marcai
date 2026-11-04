import type { Invoice, Prisma, Subscription, Tenant } from '@prisma/client'
import { DAY_MS, PLANS, type PlanId } from '@marcai/shared'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { badRequest, notFound } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { channels } from '../notifications/channels/registry'
import { enqueue } from '../notifications/queue'
import { FakeBillingProvider } from './fake'
import { MercadoPagoBillingProvider } from './mercadopago'
import type { BillingEvent, BillingProvider, BillingType } from './provider'

let provider: BillingProvider | null = null
export function billingProvider(): BillingProvider {
  provider ??=
    env.BILLING_PROVIDER === 'mercadopago'
      ? new MercadoPagoBillingProvider()
      : new FakeBillingProvider()
  return provider
}
/** Testes: volta a escolher o provedor pela configuração atual. */
export function resetBillingProvider() {
  provider = null
}

type Tx = Prisma.TransactionClient

const OPEN_INVOICE = ['pending', 'overdue'] as const
/** Dias depois do vencimento em que o link de pagamento continua válido. */
const CHECKOUT_GRACE_DAYS = 7

/** Datas de cobrança ficam ao meio-dia UTC (evita "pular" de dia por causa do fuso). */
function atNoon(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T12:00:00Z`)
}

function shiftMonths(date: Date, months: number, anchorDay: number) {
  const d = new Date(date)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(anchorDay, lastDay))
  return d
}

/**
 * Mês seguinte, preservando o dia de cobrança: com dia 31, vai 31/01 → 28/02 → 31/03
 * (e não fica preso no 28).
 */
export function addOneMonth(date: Date, anchorDay = date.getUTCDate()) {
  return shiftMonths(date, 1, anchorDay)
}

/** Próximo vencimento: fim do teste, fim do período pago ou hoje (o que vier depois). */
export function nextDueDate(
  sub: Pick<Subscription, 'status' | 'trialEndsAt' | 'currentPeriodEnd'>,
  now = new Date(),
) {
  const base = sub.status === 'trial' ? sub.trialEndsAt : (sub.currentPeriodEnd ?? sub.trialEndsAt)
  return atNoon(base && base > now ? base : now)
}

const planDescription = (plan: PlanId, tenantName: string) =>
  `${env.APP_NAME} ${PLANS[plan].name} — ${tenantName}`

const formatDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

async function ensureSubscription(tenant: Tenant & { subscription: Subscription | null }) {
  return (
    tenant.subscription ??
    (await prisma.subscription.create({
      data: { tenantId: tenant.id, plan: 'pro', status: 'trial', provider: billingProvider().name },
    }))
  )
}

/** Fatura em aberto da assinatura (no máximo uma por vez). */
function openInvoice(subscriptionId: string) {
  return prisma.invoice.findFirst({
    where: { subscriptionId, status: { in: [...OPEN_INVOICE] } },
    orderBy: { dueDate: 'asc' },
  })
}

/** Invalida o link do Mercado Pago (para ninguém pagar uma fatura que mudou ou foi cancelada). */
async function expireCheckout(invoice: Pick<Invoice, 'id' | 'checkoutId'>) {
  if (!invoice.checkoutId) return
  await billingProvider()
    .expireCheckout(invoice.checkoutId)
    .catch((err) =>
      logger.warn({ err, invoiceId: invoice.id }, 'Falha ao expirar link de pagamento'),
    )
}

/** Cancela as faturas em aberto (exceto as com pagamento em análise) e invalida os links. */
async function cancelOpenInvoices(subscriptionId: string) {
  const open = await prisma.invoice.findMany({
    where: { subscriptionId, status: { in: [...OPEN_INVOICE] }, processingSince: null },
  })
  for (const inv of open) await expireCheckout(inv)
  await prisma.invoice.updateMany({
    where: { id: { in: open.map((i) => i.id) } },
    data: { status: 'canceled', checkoutId: null, invoiceUrl: null, checkoutExpiresAt: null },
  })
}

/** Cria a fatura do próximo vencimento, se ainda não existir (idempotente). */
async function ensureOpenInvoice(
  sub: Subscription,
  plan: PlanId,
  tenantName: string,
  billingType: BillingType,
) {
  const existing = await openInvoice(sub.id)
  const amountCents = PLANS[plan].priceCents
  if (existing) {
    if (existing.amountCents === amountCents && existing.billingType === billingType)
      return existing
    // Mudou o plano ou a forma de pagamento: o link antigo deixa de valer
    await expireCheckout(existing)
    return prisma.invoice.update({
      where: { id: existing.id },
      data: {
        amountCents,
        billingType,
        description: planDescription(plan, tenantName),
        checkoutId: null,
        invoiceUrl: null,
        checkoutExpiresAt: null,
      },
    })
  }
  try {
    return await prisma.invoice.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        amountCents,
        billingType,
        dueDate: nextDueDate(sub),
        description: planDescription(plan, tenantName),
      },
    })
  } catch (err) {
    // Corrida com a rotina periódica: a fatura desse vencimento já foi criada
    if ((err as { code?: string }).code === 'P2002') return (await openInvoice(sub.id))!
    throw err
  }
}

/** Id do cartão, se for deste provedor (dados de um provedor antigo são ignorados). */
function cardOf(sub: Subscription) {
  return sub.providerSubscriptionId && sub.provider === billingProvider().name
    ? sub.providerSubscriptionId
    : null
}

/**
 * Desliga o cartão: primeiro limpa no banco (o webhook "cancelada" que chega em seguida não
 * encontra mais a assinatura e não a derruba) e depois cancela no Mercado Pago.
 * Se o Mercado Pago falhar, restaura e avisa: nunca fica um cartão cobrando escondido.
 */
async function detachCard(sub: Subscription) {
  if (!sub.providerSubscriptionId) return sub
  const cardId = cardOf(sub)
  const cleared = await prisma.subscription.update({
    where: { id: sub.id },
    data: { providerSubscriptionId: null, providerCheckoutUrl: null },
  })
  if (!cardId) return cleared
  try {
    await billingProvider().cancelCardSubscription(cardId)
  } catch (err) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { providerSubscriptionId: cardId, providerCheckoutUrl: sub.providerCheckoutUrl },
    })
    logger.error({ err, subscriptionId: sub.id }, 'Falha ao cancelar o cartão no Mercado Pago')
    throw badRequest(
      'Não conseguimos falar com o Mercado Pago agora. Tente de novo em alguns minutos.',
      'MERCADO_PAGO_INDISPONIVEL',
    )
  }
  return cleared
}

/** Status ao reativar uma assinatura cancelada: mantém o que já foi pago. */
function reactivatedStatus(sub: Subscription) {
  const now = new Date()
  if (sub.currentPeriodEnd && sub.currentPeriodEnd > now) return 'active' as const
  if (!sub.currentPeriodEnd && sub.trialEndsAt && sub.trialEndsAt > now) return 'trial' as const
  return 'past_due' as const
}

/**
 * Contrata ou troca de plano/forma de pagamento.
 * - Cartão: cria a assinatura automática no Mercado Pago e devolve o link para autorizar.
 *   `newCard` força um cartão novo (ex.: o anterior foi recusado).
 * - PIX/boleto: garante a fatura do próximo vencimento (o link é gerado ao clicar em "Pagar").
 * Nada é cobrado antes do fim do teste grátis.
 */
export async function subscribe(opts: {
  tenant: Tenant & { subscription: Subscription | null }
  owner: { email: string }
  plan: PlanId
  billingType: BillingType
  newCard?: boolean
}) {
  const p = billingProvider()
  const { tenant, plan, billingType } = opts
  let sub = await ensureSubscription(tenant)
  const amountCents = PLANS[plan].priceCents
  const wasCanceled = sub.status === 'canceled'
  let checkoutUrl: string | null = null
  const currentCard = !wasCanceled && sub.billingType === 'CREDIT_CARD' ? cardOf(sub) : null

  if (billingType === 'CREDIT_CARD') {
    if (currentCard && !opts.newCard) {
      if (sub.plan !== plan) await p.updateCardSubscriptionAmount(currentCard, amountCents)
      checkoutUrl = sub.providerCheckoutUrl
    } else {
      // Nunca deixa dois cartões ativos: cancela o anterior (autorizado ou não) antes
      sub = await detachCard(sub)
      const card = await p.createCardSubscription({
        tenantId: tenant.id,
        description: planDescription(plan, tenant.name),
        amountCents,
        payerEmail: opts.owner.email,
        startDate: nextDueDate(sub),
      })
      checkoutUrl = card.checkoutUrl
      // Grava tudo de uma vez: id do cartão e forma de pagamento nunca ficam desencontrados
      sub = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          providerSubscriptionId: card.id,
          providerCheckoutUrl: card.checkoutUrl,
          billingType: 'CREDIT_CARD',
          plan,
          provider: p.name,
        },
      })
      // O cartão vai pagar: faturas PIX/boleto em aberto deixam de valer (e o link expira)
      await cancelOpenInvoices(sub.id)
    }
  } else {
    sub = await detachCard(sub)
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan, billingType, provider: p.name },
    })
    await ensureOpenInvoice(sub, plan, tenant.name, billingType)
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan,
      billingType,
      provider: p.name,
      canceledAt: null,
      ...(wasCanceled ? { status: reactivatedStatus(sub) } : {}),
    },
  })
  return { subscription: updated, checkoutUrl }
}

/**
 * Cartão recusado (ou quem prefere pagar avulso): gera a fatura PIX/boleto deste mês
 * sem mexer na assinatura do cartão.
 */
export async function payOnce(tenantId: string, billingType: 'PIX' | 'BOLETO') {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: true },
  })
  if (!sub) throw notFound('Assinatura não encontrada')
  if (sub.status === 'canceled') throw badRequest('Reative a assinatura escolhendo um plano.')
  return ensureOpenInvoice(sub, sub.plan, sub.tenant.name, billingType)
}

/** Link de pagamento de uma fatura (gerado na hora do clique e renovado quando expira). */
export async function invoiceCheckout(tenantId: string, invoiceId: string, payerEmail: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { subscription: { include: { tenant: true } } },
  })
  if (!invoice) throw notFound('Fatura não encontrada')
  if (!(OPEN_INVOICE as readonly string[]).includes(invoice.status)) {
    throw badRequest(
      invoice.status === 'paid'
        ? 'Essa fatura já está paga.'
        : 'Essa fatura não pode mais ser paga.',
    )
  }
  const stillValid =
    invoice.checkoutId &&
    invoice.invoiceUrl &&
    invoice.checkoutExpiresAt &&
    invoice.checkoutExpiresAt.getTime() > Date.now() + 60 * 60_000
  if (stillValid) return { checkoutUrl: invoice.invoiceUrl! }
  const expiresAt = new Date(
    Math.max(invoice.dueDate.getTime() + CHECKOUT_GRACE_DAYS * DAY_MS, Date.now() + 3 * DAY_MS),
  )
  const checkout = await billingProvider().createCheckout({
    invoiceId: invoice.id,
    description:
      invoice.description ??
      planDescription(invoice.subscription.plan, invoice.subscription.tenant.name),
    amountCents: invoice.amountCents,
    payerEmail,
    billingType: (invoice.billingType as BillingType | null) ?? 'UNDEFINED',
    expiresAt,
  })
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      checkoutId: checkout.checkoutId,
      invoiceUrl: checkout.checkoutUrl,
      checkoutExpiresAt: expiresAt,
    },
  })
  return { checkoutUrl: checkout.checkoutUrl }
}

export async function cancelSubscription(tenantId: string, actorUserId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } })
  if (!sub) throw notFound('Assinatura não encontrada')
  await detachCard(sub)
  await cancelOpenInvoices(sub.id)
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'canceled', canceledAt: new Date() },
  })
  await audit({ action: 'subscription.canceled', tenantId, actorUserId })
}

/** Novo fim do período: 1 mês depois do maior entre o fim atual e o vencimento pago. */
function extendedPeriodEnd(sub: Subscription, reference: Date) {
  const candidates = [sub.currentPeriodEnd, reference].filter(Boolean) as Date[]
  const base = atNoon(new Date(Math.max(...candidates.map((d) => d.getTime()))))
  const anchor = sub.billingDay ?? reference.getUTCDate()
  let end = addOneMonth(base, anchor)
  // Assinatura parada há muito tempo: o novo período começa hoje
  if (end.getTime() < Date.now()) end = addOneMonth(atNoon(new Date()), anchor)
  return { end, anchor }
}

interface Outcome {
  result: { ok?: true; ignored?: true; duplicated?: true }
  tenantId?: string
  notify?: { title: string; body: string }
  audit?: { action: string; entity?: string; entityId?: string; metadata?: Prisma.InputJsonValue }
}

/**
 * Processa um evento de cobrança.
 * O registro do evento (idempotência) e os efeitos ficam na MESMA transação: se algo falhar,
 * nada é gravado e o reenvio do Mercado Pago processa de novo. Avisos saem depois do commit.
 */
export async function handleBillingEvent(evt: BillingEvent, providerName: string) {
  let outcome: Outcome
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const seen = await tx.webhookEvent.findUnique({
        where: { provider_eventId: { provider: providerName, eventId: evt.eventId } },
      })
      if (seen) return { result: { duplicated: true as const } }
      await tx.webhookEvent.create({
        data: {
          provider: providerName,
          eventId: evt.eventId,
          type: evt.type,
          payload: evt as Prisma.InputJsonValue,
        },
      })
      return applyEvent(tx, evt)
    })
  } catch (err) {
    // Duas entregas simultâneas do mesmo evento: a outra já aplicou
    if ((err as { code?: string }).code === 'P2002') return { duplicated: true }
    throw err
  }
  if (outcome.tenantId && outcome.audit)
    await audit({ tenantId: outcome.tenantId, ...outcome.audit })
  if (outcome.tenantId && outcome.notify)
    await notifyOwners(outcome.tenantId, outcome.notify.title, outcome.notify.body, evt.eventId)
  return outcome.result
}

async function applyEvent(tx: Tx, evt: BillingEvent): Promise<Outcome> {
  if (evt.type === 'payment_refunded') return applyRefund(tx, evt)

  // ---------- Fatura paga pelo checkout (PIX, boleto, cartão avulso) ----------
  if (evt.invoiceId) {
    const invoice = await tx.invoice.findUnique({
      where: { id: evt.invoiceId },
      include: { subscription: true },
    })
    if (!invoice) return { result: { ignored: true } }
    const open = (OPEN_INVOICE as readonly string[]).includes(invoice.status)
    if (evt.type === 'payment_confirmed') return confirmInvoicePayment(tx, invoice, evt)
    if (evt.type === 'payment_pending' && open) {
      // Boleto/PIX iniciado: não marca como vencida enquanto o banco compensa
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { processingSince: new Date(), paymentMethod: evt.paymentMethod ?? undefined },
      })
      return { result: { ok: true } }
    }
    if (evt.type === 'payment_failed' && open) {
      await tx.invoice.update({ where: { id: invoice.id }, data: { processingSince: null } })
      return {
        result: { ok: true },
        tenantId: invoice.tenantId,
        notify: {
          title: 'Pagamento não aprovado',
          body: 'O pagamento da sua fatura não foi aprovado. Abra a tela de Assinatura e tente de novo pelo botão "Pagar".',
        },
      }
    }
    return { result: { ignored: true } }
  }

  // ---------- Assinatura automática no cartão ----------
  if (!evt.providerSubscriptionId) return { result: { ignored: true } }
  const sub = await tx.subscription.findFirst({
    where: { providerSubscriptionId: evt.providerSubscriptionId },
    include: { tenant: true },
  })
  // Cartão antigo (já trocado ou cancelado por nós): o aviso dele não muda nada
  if (!sub) return { result: { ignored: true } }

  if (evt.type === 'subscription_authorized') {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { billingType: 'CREDIT_CARD', providerCheckoutUrl: null },
    })
    return {
      result: { ok: true },
      tenantId: sub.tenantId,
      notify: {
        title: 'Cartão autorizado',
        body: 'Sua assinatura no cartão foi autorizada. A mensalidade é cobrada todo mês, automaticamente.',
      },
    }
  }
  if (evt.type === 'subscription_canceled') {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'canceled', canceledAt: new Date(), providerCheckoutUrl: null },
    })
    return {
      result: { ok: true },
      tenantId: sub.tenantId,
      notify: {
        title: 'Assinatura no cartão cancelada',
        body: 'A cobrança automática no cartão foi cancelada no Mercado Pago. Para continuar, escolha um plano de novo na tela de Assinatura.',
      },
    }
  }
  if (evt.type === 'payment_confirmed') {
    if (!evt.providerPaymentId || !evt.amountCents) return { result: { ignored: true } }
    const already = await tx.invoice.findUnique({
      where: { providerPaymentId: evt.providerPaymentId },
    })
    if (already) return { result: { ignored: true } }
    // O valor vem da API do Mercado Pago (de uma assinatura criada por nós): registra o que
    // foi pago, mesmo que seja o valor do plano anterior durante uma troca.
    const paidAt = evt.paidAt ? new Date(evt.paidAt) : new Date()
    const dueDate = await freeDueDate(tx, sub.id, nextDueDate(sub, paidAt))
    const { end, anchor } = extendedPeriodEnd(sub, dueDate)
    await tx.invoice.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        providerPaymentId: evt.providerPaymentId,
        amountCents: evt.amountCents,
        status: 'paid',
        billingType: 'CREDIT_CARD',
        paymentMethod: evt.paymentMethod ?? 'credit_card',
        dueDate,
        paidAt,
        description: planDescription(sub.plan, sub.tenant.name),
      },
    })
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'active', currentPeriodEnd: end, billingDay: sub.billingDay ?? anchor },
    })
    return {
      result: { ok: true },
      tenantId: sub.tenantId,
      audit:
        evt.amountCents < PLANS[sub.plan].priceCents
          ? {
              action: 'invoice.amount_mismatch',
              metadata: { paid: evt.amountCents, plan: sub.plan },
            }
          : undefined,
      notify: {
        title: 'Pagamento confirmado',
        body: `Recebemos o pagamento da sua assinatura ${PLANS[sub.plan].name}. Ela está ativa até ${formatDate(end)}. Obrigado!`,
      },
    }
  }
  if (evt.type === 'payment_failed') {
    return {
      result: { ok: true },
      tenantId: sub.tenantId,
      notify: {
        title: 'Não conseguimos cobrar no cartão',
        body: 'O Mercado Pago recusou a cobrança da sua assinatura. Abra a tela de Assinatura para cadastrar outro cartão ou pagar este mês por PIX.',
      },
    }
  }
  return { result: { ignored: true } }
}

/** Estorno ou contestação: a fatura vira "estornada" e o mês pago é descontado. */
async function applyRefund(tx: Tx, evt: BillingEvent): Promise<Outcome> {
  if (!evt.providerPaymentId) return { result: { ignored: true } }
  const invoice = await tx.invoice.findUnique({
    where: { providerPaymentId: evt.providerPaymentId },
    include: { subscription: true },
  })
  if (!invoice || invoice.status !== 'paid') return { result: { ignored: true } }
  await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'refunded' } })
  const sub = invoice.subscription
  if (sub.currentPeriodEnd) {
    const now = Date.now()
    const end = shiftMonths(
      sub.currentPeriodEnd,
      -1,
      sub.billingDay ?? sub.currentPeriodEnd.getUTCDate(),
    )
    // O mês estornado era o primeiro pago: volta para o teste (se ainda houver) ou atraso
    const backToTrial = !!sub.trialEndsAt && end.getTime() <= sub.trialEndsAt.getTime()
    const data: Prisma.SubscriptionUpdateInput = backToTrial
      ? {
          currentPeriodEnd: null,
          status: sub.trialEndsAt!.getTime() > now ? 'trial' : 'past_due',
        }
      : {
          currentPeriodEnd: end,
          ...(end.getTime() <= now && sub.status === 'active' ? { status: 'past_due' } : {}),
        }
    await tx.subscription.update({ where: { id: sub.id }, data })
  }
  return {
    result: { ok: true },
    tenantId: invoice.tenantId,
    audit: { action: 'invoice.refunded', entity: 'Invoice', entityId: invoice.id },
    notify: {
      title: 'Pagamento estornado',
      body: 'Um pagamento da sua assinatura foi estornado e o período correspondente foi descontado. Se você não reconhece esse estorno, fale com a gente.',
    },
  }
}

/** Vencimento livre para a fatura (a mesma assinatura não pode ter dois no mesmo dia). */
async function freeDueDate(tx: Tx, subscriptionId: string, desired: Date) {
  let date = desired
  for (let i = 0; i < 31; i++) {
    const taken = await tx.invoice.findFirst({ where: { subscriptionId, dueDate: date } })
    if (!taken) return date
    date = new Date(date.getTime() + DAY_MS)
  }
  return date
}

async function confirmInvoicePayment(
  tx: Tx,
  invoice: Invoice & { subscription: Subscription },
  evt: BillingEvent,
): Promise<Outcome> {
  // O valor pago precisa cobrir a fatura (protege contra checkout adulterado)
  if ((evt.amountCents ?? 0) < invoice.amountCents) {
    logger.warn(
      { invoiceId: invoice.id, paid: evt.amountCents, expected: invoice.amountCents },
      'Pagamento menor que a fatura: ignorado',
    )
    return {
      result: { ignored: true },
      tenantId: invoice.tenantId,
      audit: {
        action: 'invoice.underpaid',
        entity: 'Invoice',
        entityId: invoice.id,
        metadata: { paid: evt.amountCents ?? 0, expected: invoice.amountCents },
      },
    }
  }
  // Atualização condicional: duas confirmações simultâneas nunca estendem o período duas vezes.
  // Fatura cancelada também é aceita: a pessoa pagou pelo link antigo, o dinheiro conta.
  const changed = await tx.invoice.updateMany({
    where: { id: invoice.id, status: { in: ['pending', 'overdue', 'canceled'] } },
    data: {
      status: 'paid',
      paidAt: evt.paidAt ? new Date(evt.paidAt) : new Date(),
      providerPaymentId: evt.providerPaymentId ?? undefined,
      paymentMethod: evt.paymentMethod ?? undefined,
      processingSince: null,
    },
  })
  if (!changed.count) {
    // Já estava paga: um segundo pagamento pelo mesmo link fica registrado para estorno
    const duplicate = !!evt.providerPaymentId && evt.providerPaymentId !== invoice.providerPaymentId
    return {
      result: { ignored: true },
      tenantId: invoice.tenantId,
      audit: duplicate
        ? {
            action: 'invoice.duplicate_payment',
            entity: 'Invoice',
            entityId: invoice.id,
            metadata: { providerPaymentId: evt.providerPaymentId ?? null },
          }
        : undefined,
    }
  }
  const sub = invoice.subscription
  const { end, anchor } = extendedPeriodEnd(sub, invoice.dueDate)
  await tx.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'active',
      canceledAt: null,
      currentPeriodEnd: end,
      billingDay: sub.billingDay ?? anchor,
    },
  })
  return {
    result: { ok: true },
    tenantId: invoice.tenantId,
    notify: {
      title: 'Pagamento confirmado',
      body: `Recebemos o pagamento da sua assinatura. Ela está ativa até ${formatDate(end)}. Obrigado por continuar com a gente!`,
    },
  }
}

/** Avisa as donas no painel e por e-mail (pela fila: com repetição em caso de falha). */
export async function notifyOwners(tenantId: string, title: string, body: string, dedupe?: string) {
  try {
    await channels.inapp.send({
      tenantId,
      title,
      body,
      url: '/painel/assinatura',
      type: 'billing',
    })
    const owners = await prisma.tenantMember.findMany({
      where: { tenantId, role: 'owner' },
      include: { user: { select: { email: true } } },
    })
    for (const owner of owners) {
      await enqueue({
        channel: 'email',
        kind: 'billing',
        dedupeKey: dedupe ? `billing:${dedupe}:${owner.userId}` : undefined,
        message: {
          tenantId,
          to: owner.user.email,
          title,
          body,
          url: `${env.APP_URL}/painel/assinatura`,
        },
      })
    }
  } catch (err) {
    logger.error({ err, tenantId }, 'Falha ao avisar sobre a cobrança')
  }
}

/** Visão geral para a tela de Assinatura. */
export async function billingOverview(tenantId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } })
  const invoices = await prisma.invoice.findMany({
    where: { tenantId },
    orderBy: { dueDate: 'desc' },
    take: 24,
  })
  return {
    subscription: sub,
    invoices,
    provider: billingProvider().name,
    plans: Object.values(PLANS),
    /** Assinatura no cartão aguardando autorização no Mercado Pago */
    cardCheckoutUrl: sub?.billingType === 'CREDIT_CARD' ? sub.providerCheckoutUrl : null,
  }
}
