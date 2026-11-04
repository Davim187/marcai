import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  ExternalLink,
  LogIn,
  Search,
  ShieldCheck,
  Unlock,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatBRL } from '@marcai/shared'
import { Logo } from '@/components/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { fmt } from '@/lib/dates'
import { useApiMutation } from '@/lib/queries'
import { useApplyTheme } from '@/lib/theme'

interface Overview {
  tenants: number
  mrrCents: number
  byStatus: Record<string, number>
  byPlan: Record<string, number>
  churnRate: number
  signupsByDay: Array<{ date: string; count: number }>
  bookingsLast30: number
}
interface TenantRow {
  id: string
  name: string
  slug: string
  createdAt: string
  blocked: boolean
  blockedReason: string | null
  publicUrl: string
  owner: { name: string; email: string } | null
  subscription: {
    plan: string
    status: string
    trialEndsAt: string | null
    currentPeriodEnd: string | null
  } | null
  counts: { bookings: number; customers: number }
}

const STATUS: Record<string, { label: string; v: 'default' | 'success' | 'warning' | 'muted' }> = {
  trial: { label: 'Teste', v: 'default' },
  active: { label: 'Ativa', v: 'success' },
  past_due: { label: 'Vencida', v: 'warning' },
  canceled: { label: 'Cancelada', v: 'muted' },
}

export default function AdminPage() {
  useApplyTheme()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [extend, setExtend] = useState<TenantRow | null>(null)
  const [days, setDays] = useState(15)
  const { data: ov } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/admin/overview'),
  })
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['admin-tenants', q, status],
    queryFn: () =>
      api<TenantRow[]>(
        `/admin/tenants?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`,
      ),
  })
  const inv = [['admin-tenants'], ['admin-overview']]
  const block = useApiMutation(
    (v: { id: string; blocked: boolean }) =>
      api(`/admin/tenants/${v.id}/block`, {
        body: { blocked: v.blocked, reason: v.blocked ? 'Bloqueado pelo suporte' : undefined },
      }),
    { success: 'Atualizado', invalidate: inv },
  )
  const ext = useApiMutation(
    () => api(`/admin/tenants/${extend!.id}/extend-trial`, { body: { days } }),
    { success: 'Teste estendido', invalidate: inv, onSuccess: () => setExtend(null) },
  )
  const impersonate = useApiMutation(
    (id: string) => api(`/admin/tenants/${id}/impersonate`, { method: 'POST' }),
    {
      onSuccess: () => {
        window.location.href = '/painel'
      },
    },
  )

  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-card flex h-16 items-center gap-3 border-b px-4 sm:px-6">
        <Logo />
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3 w-3" /> Super admin
        </Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/painel">
            <ArrowLeft /> Voltar ao painel
          </Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['MRR', ov && formatBRL(ov.mrrCents)],
            ['Estabelecimentos', ov?.tenants],
            ['Ativos (Essencial · Pro)', ov && `${ov.byPlan.essencial} · ${ov.byPlan.pro}`],
            ['Em teste · vencidos', ov && `${ov.byStatus.trial} · ${ov.byStatus.past_due}`],
            ['Churn (30 dias)', ov && `${Math.round(ov.churnRate * 100)}%`],
          ].map(([k, v]) => (
            <Card key={String(k)} className="p-4">
              <p className="text-muted-foreground text-xs">{k}</p>
              {v !== undefined ? (
                <p className="mt-1 text-xl font-bold">{v}</p>
              ) : (
                <Skeleton className="mt-1 h-7 w-20" />
              )}
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Cadastros por dia (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="h-40" role="img" aria-label="Cadastros por dia">
            <ResponsiveContainer>
              <BarChart
                data={ov?.signupsByDay.map((d) => ({
                  ...d,
                  label: `${d.date.slice(8)}/${d.date.slice(5, 7)}`,
                }))}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <Tooltip
                  formatter={(v: number) => [v, 'Cadastros']}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Estabelecimentos</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  className="h-10 pl-9"
                  placeholder="Nome, slug ou e-mail"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Buscar"
                />
              </div>
              <NativeSelect
                className="h-10 w-36"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
              >
                <option value="">Todos</option>
                {Object.entries(STATUS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-2">Estabelecimento</th>
                    <th>Responsável</th>
                    <th>Plano</th>
                    <th>Status</th>
                    <th>Uso</th>
                    <th>Criado</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenants?.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5">
                        <p className="font-semibold">{t.name}</p>
                        <a
                          href={t.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary inline-flex items-center gap-1 text-xs"
                        >
                          /{t.slug}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td>
                        <p>{t.owner?.name}</p>
                        <p className="text-muted-foreground text-xs">{t.owner?.email}</p>
                      </td>
                      <td className="capitalize">{t.subscription?.plan ?? '—'}</td>
                      <td>
                        {t.blocked ? (
                          <Badge variant="destructive">Bloqueado</Badge>
                        ) : t.subscription ? (
                          <Badge variant={STATUS[t.subscription.status]?.v}>
                            {STATUS[t.subscription.status]?.label}
                          </Badge>
                        ) : (
                          '—'
                        )}
                        {t.subscription?.status === 'trial' && t.subscription.trialEndsAt && (
                          <p className="text-muted-foreground text-xs">
                            até {fmt(t.subscription.trialEndsAt, 'UTC', 'dd/MM')}
                          </p>
                        )}
                      </td>
                      <td className="text-muted-foreground text-xs">
                        {t.counts.bookings} ag. · {t.counts.customers} cli.
                      </td>
                      <td className="text-xs">{fmt(t.createdAt, 'UTC', 'dd/MM/yy')}</td>
                      <td className="space-x-1 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Estender teste"
                          title="Estender teste"
                          onClick={() => setExtend(t)}
                        >
                          <CalendarPlus />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.blocked ? 'Desbloquear' : 'Bloquear'}
                          title={t.blocked ? 'Desbloquear' : 'Bloquear'}
                          onClick={() => block.mutate({ id: t.id, blocked: !t.blocked })}
                        >
                          {t.blocked ? <Unlock /> : <Ban />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => impersonate.mutate(t.id)}
                        >
                          <LogIn /> Entrar como
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              “Entrar como” abre uma sessão de suporte de 1 dia, registrada no log de auditoria. Ao
              encerrar, entre de novo como admin.
            </p>
          </CardContent>
        </Card>
      </main>
      <Dialog open={!!extend} onOpenChange={(o) => !o && setExtend(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estender teste de {extend?.name}</DialogTitle>
          </DialogHeader>
          <Field label="Dias a mais" htmlFor="ext-days">
            <Input
              id="ext-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
          <DialogFooter>
            <Button onClick={() => ext.mutate()} loading={ext.isPending}>
              Estender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
