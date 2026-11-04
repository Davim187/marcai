import type { Invoice, Prisma, Subscription, Tenant } from '@prisma/client'
import { DAY_MS, PLANS, type PlanId } from '@marcai/shared'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { badRequest, notFound } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { emailLayout, sendEmail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'
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

const OPEN_INVOICE = ['pending', 'overdue'] as const
/** Dias de tolerância depois do vencimento em que o link de pagamento continua válido. */
const CHECKOUT_GRACE_DAYS = 7

/** Datas de cobrança ficam ao meio-dia UTC (evita "pular" de dia por causa do fuso). */
function atNoon(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T12:00:00Z`)
}

/** Mesmo dia do mês seguinte (31/01 → 28/02 ou 29/02). */
export function addOneMonth(date: Date) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
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
    return prisma.invoice.update({
      where: { id: existing.id },
      data: {
        amountCents,
        billingType,
        description: planDescription(plan, tenantName),
        checkoutId: null,
        invoiceUrl: null,
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

/**
 * Contrata ou troca de plano/forma de pagamento.
 * - Cartão: cria a assinatura automática no Mercado Pago e devolve o link para autorizar.
 * - PIX/boleto: garante a fatura do próximo vencimento (o link é gerado ao clicar em "Pagar").
 * Nada é cobrado antes do fim do teste grátis.
 */
export async function subscribe(opts: {
  tenant: Tenant & { subscription: Subscription | null }
  owner: { email: string }
  plan: PlanId
  billingType: BillingType
}) {
  const p = billingProvider()
  const { tenant, plan, billingType } = opts
  let sub = await ensureSubscription(tenant)
  const description = planDescription(plan, tenant.name)
  const amountCents = PLANS[plan].priceCents
  let checkoutUrl: string | null = null
  const hasActiveCard =
    sub.billingType === 'CREDIT_CARD' && !!sub.providerSubscriptionId && sub.status !== 'canceled'

  if (billingType === 'CREDIT_CARD') {
    if (hasActiveCard) {
      await p.updateCardSubscriptionAmount(sub.providerSubscriptionId!, amountCents)
      checkoutUrl = sub.providerCheckoutUrl
    } else {
      const card = await p.createCardSubscription({
        tenantId: tenant.id,
        description,
        amountCents,
        payerEmail: opts.owner.email,
        startDate: nextDueDate(sub),
      })
      checkoutUrl = card.checkoutUrl
      // O cartão vai pagar: faturas em aberto (PIX/boleto) deixam de valer
      await prisma.invoice.updateMany({
        where: {
          subscriptionId: sub.id,
          status: { in: [...OPEN_INVOICE] },
          providerPaymentId: null,
        },
        data: { status: 'canceled' },
      })
      sub = await prisma.subscription.update({
        where: { id: sub.id },
        data: { providerSubscriptionId: card.id, providerCheckoutUrl: card.checkoutUrl },
      })
    }
  } else {
    if (hasActiveCard) {
      await p.cancelCardSubscription(sub.providerSubscriptionId!)
      sub = await prisma.subscription.update({
        where: { id: sub.id },
        data: { providerSubscriptionId: null, providerCheckoutUrl: null },
      })
    }
    await ensureOpenInvoice(sub, plan, tenant.name, billingType)
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan,
      billingType,
      provider: p.name,
      canceledAt: null,
      // Reativar uma assinatura cancelada exige pagamento
      ...(sub.status === 'canceled' ? { status: 'past_due' } : {}),
    },
  })
  return { subscription: updated, checkoutUrl }
}

/** Link de pagamento de uma fatura (criado na hora do clique, sempre válido). */
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
  if (invoice.checkoutId && invoice.invoiceUrl) return { checkoutUrl: invoice.invoiceUrl }
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
    data: { checkoutId: checkout.checkoutId, invoiceUrl: checkout.checkoutUrl },
  })
  return { checkoutUrl: checkout.checkoutUrl }
}

export async function cancelSubscription(tenantId: string, actorUserId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } })
  if (!sub) throw notFound('Assinatura não encontrada')
  if (sub.providerSubscriptionId && sub.billingType === 'CREDIT_CARD') {
    await billingProvider().cancelCardSubscription(sub.providerSubscriptionId)
  }
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'canceled', canceledAt: new Date(), providerCheckoutUrl: null },
  })
  await prisma.invoice.updateMany({
    where: { subscriptionId: sub.id, status: { in: [...OPEN_INVOICE] } },
    data: { status: 'canceled' },
  })
  await audit({ action: 'subscription.canceled', tenantId, actorUserId })
}

/** Estende o período pago em 1 mês a partir do maior entre: fim atual, vencimento ou agora. */
function extendedPeriodEnd(sub: Subscription, reference: Date) {
  const now = new Date()
  const candidates = [sub.currentPeriodEnd, reference, now].filter(Boolean) as Date[]
  const base = new Date(Math.max(...candidates.map((d) => d.getTime())))
  return addOneMonth(atNoon(base))
}

/**
 * Processa um evento de cobrança (idempotente: o mesmo evento nunca é aplicado duas vezes).
 * trial/past_due → active quando paga.
 */
export async function handleBillingEvent(evt: BillingEvent, providerName: string) {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: providerName,
        eventId: evt.eventId,
        type: evt.type,
        payload: evt as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return { duplicated: true }
    throw err
  }

  // ---------- Fatura paga pelo checkout (PIX, boleto, cartão avulso) ----------
  if (evt.invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: evt.invoiceId },
      include: { subscription: true },
    })
    if (!invoice) return { ignored: true }
    if (evt.type === 'payment_confirmed') return confirmInvoicePayment(invoice, evt)
    if (evt.type === 'payment_refunded') {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'refunded' } })
      await audit({
        action: 'invoice.refunded',
        tenantId: invoice.tenantId,
        entity: 'Invoice',
        entityId: invoice.id,
      })
      return { ok: true }
    }
    if (evt.type === 'payment_failed') {
      // Recusado: a fatura continua em aberto e a pessoa pode tentar de novo pelo mesmo link
      return { ok: true }
    }
    return { ignored: true }
  }

  // ---------- Assinatura automática no cartão ----------
  if (!evt.providerSubscriptionId) return { ignored: true }
  const sub = await prisma.subscription.findFirst({
    where: { providerSubscriptionId: evt.providerSubscriptionId },
    include: { tenant: true },
  })
  if (!sub) return { ignored: true }

  if (evt.type === 'subscription_authorized') {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { billingType: 'CREDIT_CARD', providerCheckoutUrl: null },
    })
    await notifyOwners(
      sub.tenantId,
      'Cartão autorizado',
      'Sua assinatura no cartão foi autorizada. A cobrança acontece todo mês, automaticamente.',
    )
    return { ok: true }
  }
  if (evt.type === 'subscription_canceled') {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'canceled', canceledAt: new Date(), providerCheckoutUrl: null },
    })
    return { ok: true }
  }
  if (evt.type === 'payment_confirmed') {
    if ((evt.amountCents ?? 0) < PLANS[sub.plan].priceCents) {
      logger.warn(
        { evt, plan: sub.plan },
        'Cobrança no cartão com valor menor que o plano: ignorada',
      )
      return { ignored: true }
    }
    const dueDate = nextDueDate(sub)
    await prisma.$transaction([
      prisma.invoice.upsert({
        where: { providerPaymentId: evt.providerPaymentId! },
        create: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          providerPaymentId: evt.providerPaymentId!,
          amountCents: evt.amountCents ?? PLANS[sub.plan].priceCents,
          status: 'paid',
          billingType: 'CREDIT_CARD',
          paymentMethod: evt.paymentMethod ?? 'credit_card',
          dueDate: await freeDueDate(sub.id, dueDate),
          paidAt: evt.paidAt ? new Date(evt.paidAt) : new Date(),
          description: planDescription(sub.plan, sub.tenant.name),
        },
        update: { status: 'paid' },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'active', currentPeriodEnd: extendedPeriodEnd(sub, dueDate) },
      }),
    ])
    await notifyOwners(
      sub.tenantId,
      'Pagamento confirmado',
      `Recebemos o pagamento da sua assinatura ${PLANS[sub.plan].name}. Obrigado por continuar com a gente!`,
    )
    return { ok: true }
  }
  if (evt.type === 'payment_failed') {
    await notifyOwners(
      sub.tenantId,
      'Não conseguimos cobrar no cartão',
      'O Mercado Pago recusou a cobrança da sua assinatura. Atualize o cartão ou pague por PIX para não interromper sua agenda.',
    )
    return { ok: true }
  }
  return { ignored: true }
}

/** Vencimento livre para a fatura (a mesma assinatura não pode ter dois no mesmo dia). */
async function freeDueDate(subscriptionId: string, desired: Date) {
  let date = desired
  for (let i = 0; i < 31; i++) {
    const taken = await prisma.invoice.findFirst({ where: { subscriptionId, dueDate: date } })
    if (!taken) return date
    date = new Date(date.getTime() + DAY_MS)
  }
  return date
}

async function confirmInvoicePayment(
  invoice: Invoice & { subscription: Subscription },
  evt: BillingEvent,
) {
  if (invoice.status === 'paid') return { ok: true }
  // O valor pago precisa cobrir a fatura (protege contra checkout adulterado)
  if ((evt.amountCents ?? 0) < invoice.amountCents) {
    logger.warn(
      { invoiceId: invoice.id, paid: evt.amountCents, expected: invoice.amountCents },
      'Pagamento menor que a fatura: ignorado',
    )
    return { ignored: true }
  }
  const sub = invoice.subscription
  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'paid',
        paidAt: evt.paidAt ? new Date(evt.paidAt) : new Date(),
        providerPaymentId: evt.providerPaymentId ?? undefined,
        paymentMethod: evt.paymentMethod ?? undefined,
      },
    }),
    prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'active', currentPeriodEnd: extendedPeriodEnd(sub, invoice.dueDate) },
    }),
  ])
  await notifyOwners(
    invoice.tenantId,
    'Pagamento confirmado',
    'Recebemos o pagamento da sua assinatura. Obrigado por continuar com a gente!',
  )
  return { ok: true }
}

export async function notifyOwners(
  tenantId: string,
  title: string,
  body: string,
  url = `${env.APP_URL}/painel/assinatura`,
) {
  const owners = await prisma.tenantMember.findMany({
    where: { tenantId, role: 'owner' },
    include: { user: { select: { email: true } } },
  })
  for (const owner of owners) {
    const { html, text } = emailLayout({ title, body, cta: { label: 'Ver assinatura', url } })
    await sendEmail({ to: owner.user.email, subject: title, html, text }).catch((err) =>
      logger.error({ err, tenantId }, 'Falha ao enviar e-mail de cobrança'),
    )
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
