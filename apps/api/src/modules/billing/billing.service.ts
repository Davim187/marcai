import type { Prisma, Subscription, Tenant } from '@prisma/client'
import { addDaysToDate, PLANS, type PlanId, toLocalDate } from '@marcai/shared'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { randomToken } from '../../lib/crypto'
import { badRequest, notFound } from '../../lib/errors'
import { emailLayout, sendEmail } from '../../lib/mailer'
import { prisma } from '../../lib/prisma'
import { AsaasBillingProvider } from './asaas'
import { FakeBillingProvider } from './fake'
import type { BillingEvent, BillingProvider, BillingType, ProviderPayment } from './provider'

let provider: BillingProvider | null = null
export function billingProvider(): BillingProvider {
  provider ??=
    env.BILLING_PROVIDER === 'asaas' ? new AsaasBillingProvider() : new FakeBillingProvider()
  return provider
}

const toCents = (v: number) => Math.round(v * 100)
const planValue = (plan: PlanId) => PLANS[plan].priceCents / 100

/** Contrata ou troca de plano (upgrade/downgrade). Sem cartão no teste grátis. */
export async function subscribe(opts: {
  tenant: Tenant & { subscription: Subscription | null }
  owner: { name: string; email: string; phone?: string | null }
  plan: PlanId
  billingType: BillingType
  cpfCnpj?: string
}) {
  const p = billingProvider()
  const { tenant } = opts
  const sub =
    tenant.subscription ??
    (await prisma.subscription.create({
      data: { tenantId: tenant.id, plan: opts.plan, status: 'trial', provider: p.name },
    }))
  let customerId = sub.providerCustomerId
  if (!customerId) {
    if (p.name === 'asaas' && !opts.cpfCnpj)
      throw badRequest('Informe seu CPF ou CNPJ para emitir as cobranças', 'CPF_OBRIGATORIO')
    customerId = (
      await p.createCustomer({
        name: opts.owner.name,
        email: opts.owner.email,
        cpfCnpj: opts.cpfCnpj,
        phone: opts.owner.phone,
        externalReference: tenant.id,
      })
    ).id
  }
  const description = `${env.APP_NAME} ${PLANS[opts.plan].name} — ${tenant.name}`
  let subscriptionId = sub.status === 'canceled' ? null : sub.providerSubscriptionId
  if (subscriptionId) {
    await p.updateSubscription(subscriptionId, {
      value: planValue(opts.plan),
      billingType: opts.billingType,
      description,
    })
  } else {
    // Primeira cobrança no fim do teste (ou hoje, se o teste já acabou)
    const today = toLocalDate(new Date(), tenant.timezone)
    const trialEnd = sub.trialEndsAt ? toLocalDate(sub.trialEndsAt, tenant.timezone) : today
    const nextDueDate = trialEnd > today ? trialEnd : today
    subscriptionId = (
      await p.createSubscription({
        customerId,
        value: planValue(opts.plan),
        billingType: opts.billingType,
        nextDueDate,
        description,
        externalReference: tenant.id,
      })
    ).id
    if (p.name === 'fake') {
      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: sub.id,
          providerPaymentId: `pay_fake_${randomToken(8)}`,
          amountCents: PLANS[opts.plan].priceCents,
          status: 'pending',
          billingType: opts.billingType,
          dueDate: new Date(`${nextDueDate}T12:00:00Z`),
          description,
          invoiceUrl: null,
        },
      })
    }
  }
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      plan: opts.plan,
      provider: p.name,
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      billingType: opts.billingType,
      canceledAt: null,
      ...(sub.status === 'canceled' ? { status: 'past_due' } : {}),
    },
  })
  if (p.name === 'asaas') await syncInvoices(updated).catch(() => undefined)
  return updated
}

export async function cancelSubscription(tenantId: string, actorUserId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } })
  if (!sub) throw notFound('Assinatura não encontrada')
  if (sub.providerSubscriptionId)
    await billingProvider().cancelSubscription(sub.providerSubscriptionId)
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'canceled', canceledAt: new Date() },
  })
  await prisma.invoice.updateMany({
    where: { subscriptionId: sub.id, status: 'pending' },
    data: { status: 'canceled' },
  })
  await audit({ action: 'subscription.canceled', tenantId, actorUserId })
}

/** Busca as faturas no provedor e atualiza a tabela local. */
export async function syncInvoices(sub: Subscription) {
  if (!sub.providerSubscriptionId) return
  const payments = await billingProvider().listPayments(sub.providerSubscriptionId)
  for (const pay of payments) await upsertInvoice(sub, pay)
}

async function upsertInvoice(sub: Subscription, pay: ProviderPayment) {
  const data = {
    amountCents: toCents(pay.value),
    status: pay.status,
    billingType: pay.billingType,
    dueDate: new Date(`${pay.dueDate}T12:00:00Z`),
    paidAt: pay.paymentDate ? new Date(`${pay.paymentDate}T12:00:00Z`) : null,
    invoiceUrl: pay.invoiceUrl,
  }
  return prisma.invoice.upsert({
    where: { providerPaymentId: pay.id },
    create: {
      ...data,
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      providerPaymentId: pay.id,
      description: `${env.APP_NAME} ${PLANS[sub.plan].name}`,
    },
    update: data,
  })
}

/**
 * Processa um evento de cobrança (idempotente: o mesmo evento nunca é aplicado duas vezes).
 * trial/past_due → active quando paga; active → past_due quando vence.
 */
export async function handleBillingEvent(evt: BillingEvent, providerName: string) {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: providerName,
        eventId: evt.eventId,
        type: evt.rawType,
        payload: evt as unknown as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return { duplicated: true }
    throw err
  }
  const ref = evt.payment?.externalReference
  const sub = await prisma.subscription.findFirst({
    where: {
      OR: [
        ...(evt.subscriptionId ? [{ providerSubscriptionId: evt.subscriptionId }] : []),
        ...(ref ? [{ tenantId: ref }] : []),
      ],
    },
    include: {
      tenant: { include: { members: { where: { role: 'owner' }, include: { user: true } } } },
    },
  })
  if (!sub) return { ignored: true }

  if (evt.type === 'subscription_deleted') {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'canceled', canceledAt: new Date() },
    })
    return { ok: true }
  }
  if (!evt.payment) return { ignored: true }
  const invoice = await upsertInvoice(sub, evt.payment)

  if (evt.type === 'payment_confirmed') {
    const due = new Date(`${evt.payment.dueDate}T12:00:00Z`)
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > due ? sub.currentPeriodEnd : due
    const periodEnd = new Date(`${addDaysToDate(base.toISOString().slice(0, 10), 30)}T23:59:59Z`)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'active', currentPeriodEnd: periodEnd },
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'paid', paidAt: invoice.paidAt ?? new Date() },
    })
    await notifyOwners(
      sub.tenant.members.map((m) => m.user.email),
      'Pagamento confirmado',
      `Recebemos o pagamento da sua assinatura ${PLANS[sub.plan].name}. Obrigada por continuar com a gente!`,
    )
  } else if (evt.type === 'payment_overdue') {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'past_due' } })
    await notifyOwners(
      sub.tenant.members.map((m) => m.user.email),
      'Sua fatura venceu',
      'Não identificamos o pagamento da sua assinatura. Regularize em até 7 dias para sua página de agendamento continuar no ar.',
      evt.payment.invoiceUrl ?? `${env.APP_URL}/painel/assinatura`,
    )
  }
  return { ok: true }
}

async function notifyOwners(
  emails: string[],
  title: string,
  body: string,
  url = `${env.APP_URL}/painel/assinatura`,
) {
  for (const to of emails) {
    const { html, text } = emailLayout({ title, body, cta: { label: 'Ver assinatura', url } })
    await sendEmail({ to, subject: title, html, text }).catch(() => undefined)
  }
}

/** Visão geral para a tela de Assinatura. */
export async function billingOverview(tenantId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } })
  if (sub && billingProvider().name === 'asaas') await syncInvoices(sub).catch(() => undefined)
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
  }
}
