import { prisma } from '../../lib/prisma'

/**
 * Rotina periódica (worker): marca faturas vencidas e assinaturas cujo período acabou.
 * O webhook do Asaas é a fonte principal; isto é a rede de segurança.
 */
export async function runBillingTick(now = new Date()) {
  await prisma.invoice.updateMany({
    where: { status: 'pending', dueDate: { lt: new Date(now.getTime() - 86_400_000) } },
    data: { status: 'overdue' },
  })
  await prisma.subscription.updateMany({
    where: { status: 'active', currentPeriodEnd: { lt: now } },
    data: { status: 'past_due' },
  })
}
