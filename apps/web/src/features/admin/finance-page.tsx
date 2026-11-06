import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatBRL, INVOICE_STATUS_LABELS } from '@marcai/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { fmtLocal, InvoiceBadge, type InvoiceStatus, StatCard } from './admin-shared'

interface Finance {
  mrrCents: number
  activeByPlan: { essencial: number; pro: number }
  pastDue: number
  trialsEndingIn7Days: number
  paidLast30: { cents: number; count: number }
  open: { cents: number; count: number }
  invoices: Array<{
    id: string
    tenant: { id: string; name: string; slug: string }
    amountCents: number
    status: InvoiceStatus
    dueDate: string
    paidAt: string | null
    paymentMethod: string | null
  }>
}

export default function AdminFinancePage() {
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance', status],
    queryFn: () => api<Finance>(`/admin/finance${status ? `?status=${status}` : ''}`),
  })
  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Receita recorrente, faturas e inadimplência." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="MRR"
          value={data && formatBRL(data.mrrCents)}
          hint={data && `${data.activeByPlan.essencial} Essencial · ${data.activeByPlan.pro} Pro`}
        />
        <StatCard
          label="Recebido (30 dias)"
          value={data && formatBRL(data.paidLast30.cents)}
          hint={data && `${data.paidLast30.count} fatura(s) paga(s)`}
        />
        <StatCard
          label="Em aberto"
          value={data && formatBRL(data.open.cents)}
          hint={data && `${data.open.count} fatura(s) pendente(s) ou vencida(s)`}
        />
        <StatCard label="Assinaturas atrasadas" value={data?.pastDue} />
        <StatCard label="Testes acabando (7 dias)" value={data?.trialsEndingIn7Days} />
      </div>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Faturas</CardTitle>
          <NativeSelect
            className="h-10 sm:w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status da fatura"
          >
            <option value="">Todas</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : !data?.invoices.length ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma fatura.</p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-2">Estabelecimento</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5">
                      <Link
                        to={`/admin/estabelecimentos?id=${i.tenant.id}`}
                        className="font-semibold hover:underline"
                      >
                        {i.tenant.name}
                      </Link>
                    </td>
                    <td className="font-medium">{formatBRL(i.amountCents)}</td>
                    <td className="text-xs">{fmtLocal(i.dueDate, 'dd/MM/yy')}</td>
                    <td>
                      <InvoiceBadge status={i.status} />
                    </td>
                    <td className="text-muted-foreground text-xs">
                      {i.paidAt ? `${fmtLocal(i.paidAt, 'dd/MM/yy')} · ` : ''}
                      {i.paymentMethod ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
