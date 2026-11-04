import { DAY_MS, PLANS } from '@marcai/shared'
import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { nextDueDate, notifyOwners } from './billing.service'

/**
 * Rotina periódica da cobrança (roda pelo agendador do worker):
 * 1. marca faturas vencidas;
 * 2. coloca em atraso assinaturas cujo período acabou;
 * 3. gera a fatura PIX/boleto alguns dias antes do vencimento e avisa por e-mail.
 * O webhook do Mercado Pago é a fonte principal dos pagamentos; isto é a rede de segurança.
 */
export async function runBillingTick(now = new Date()) {
  await prisma.invoice.updateMany({
    // Pagamento em análise (boleto compensando) não vira "vencida"
    where: {
      status: 'pending',
      processingSince: null,
      dueDate: { lt: new Date(now.getTime() - DAY_MS) },
    },
    data: { status: 'overdue' },
  })
  await prisma.subscription.updateMany({
    // Meio dia de tolerância: a cobrança do cartão no dia do vencimento pode chegar mais tarde
    where: { status: 'active', currentPeriodEnd: { lt: new Date(now.getTime() - DAY_MS / 2) } },
    data: { status: 'past_due' },
  })
  await generateUpcomingInvoices(now)
}

/** Faturas do próximo ciclo para quem paga por PIX/boleto (cartão é cobrado pelo Mercado Pago). */
export async function generateUpcomingInvoices(now = new Date()) {
  const horizon = new Date(now.getTime() + env.BILLING_INVOICE_DAYS_BEFORE * DAY_MS)
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'past_due', 'trial'] },
      billingType: { in: ['PIX', 'BOLETO', 'UNDEFINED'] },
      invoices: { none: { status: { in: ['pending', 'overdue'] } } },
      tenant: { deletedAt: null, blocked: false },
    },
    include: { tenant: { select: { name: true } } },
  })
  for (const sub of subs) {
    const dueDate = nextDueDate(sub, now)
    if (dueDate > horizon) continue
    try {
      await prisma.invoice.create({
        data: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          amountCents: PLANS[sub.plan].priceCents,
          billingType: sub.billingType,
          dueDate,
          description: `${env.APP_NAME} ${PLANS[sub.plan].name} — ${sub.tenant.name}`,
        },
      })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue // outra instância criou antes
      logger.error({ err, subscriptionId: sub.id }, 'Falha ao gerar fatura')
      continue
    }
    await notifyOwners(
      sub.tenantId,
      'Sua fatura está disponível',
      `A fatura da sua assinatura vence em ${dueDate.toISOString().slice(0, 10).split('-').reverse().join('/')}. Pague por PIX ou boleto pelo painel para manter sua agenda no ar.`,
      `invoice:${sub.id}:${dueDate.toISOString().slice(0, 10)}`,
    )
  }
}
