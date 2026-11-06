import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatBRL, type SubscriptionStatus } from '@marcai/shared'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtLocal, StatCard, SubStatusBadge } from './admin-shared'

interface Overview {
  tenants: number
  users: number
  online: number
  mrrCents: number
  byStatus: Record<string, number>
  byPlan: Record<string, number>
  churnRate: number
  signupsByDay: Array<{ date: string; count: number }>
  bookingsLast30: number
  recentTenants: Array<{
    id: string
    name: string
    slug: string
    createdAt: string
    subscription: { plan: string; status: SubscriptionStatus } | null
  }>
  onlineUsers: Array<{ id: string; name: string; email: string; avatarUrl: string | null }>
}

export default function AdminOverviewPage() {
  const { data: session } = useSession()
  const firstName = session?.authenticated ? session.user.name.split(' ')[0] : ''
  const { data: ov } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/admin/overview'),
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-6">
      <PageHeader title={`Olá, ${firstName}`} description="Como está o sistema hoje." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Usuários" value={ov?.users} />
        <StatCard label="Online agora" value={ov?.online} hint="últimos 15 minutos" />
        <StatCard label="Estabelecimentos" value={ov?.tenants} />
        <StatCard label="MRR" value={ov && formatBRL(ov.mrrCents)} />
        <StatCard
          label="Assinantes (Essencial · Pro)"
          value={ov && `${ov.byPlan.essencial} · ${ov.byPlan.pro}`}
        />
        <StatCard
          label="Em teste · atrasados"
          value={ov && `${ov.byStatus.trial} · ${ov.byStatus.past_due}`}
        />
        <StatCard label="Churn (30 dias)" value={ov && `${Math.round(ov.churnRate * 100)}%`} />
        <StatCard label="Agendamentos (30 dias)" value={ov?.bookingsLast30} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastros de estabelecimentos por dia (30 dias)</CardTitle>
        </CardHeader>
        <CardContent className="h-44" role="img" aria-label="Cadastros por dia">
          {ov ? (
            <ResponsiveContainer>
              <BarChart
                data={ov.signupsByDay.map((d) => ({
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
          ) : (
            <Skeleton className="h-full" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimos cadastros</CardTitle>
            <Link to="/admin/estabelecimentos" className="text-cobalt text-sm hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            {!ov ? (
              <Skeleton className="h-32" />
            ) : !ov.recentTenants.length ? (
              <p className="text-muted-foreground py-4 text-sm">Nenhum estabelecimento ainda.</p>
            ) : (
              <ul className="divide-y">
                {ov.recentTenants.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/admin/estabelecimentos?id=${t.id}`}
                      className="flex items-center gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t.name}</p>
                        <p className="text-muted-foreground text-xs">
                          /{t.slug} · {fmtLocal(t.createdAt, 'dd/MM/yy')}
                        </p>
                      </div>
                      {t.subscription && <SubStatusBadge status={t.subscription.status} />}
                      <ChevronRight className="text-muted-foreground h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Online agora</CardTitle>
            <Link
              to="/admin/usuarios?filtro=online"
              className="text-cobalt text-sm hover:underline"
            >
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            {!ov ? (
              <Skeleton className="h-32" />
            ) : !ov.onlineUsers.length ? (
              <p className="text-muted-foreground py-4 text-sm">Ninguém online agora.</p>
            ) : (
              <ul className="divide-y">
                {ov.onlineUsers.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Avatar name={u.name} src={u.avatarUrl} className="h-8 w-8" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{u.name}</p>
                      <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                    </div>
                    <span className="bg-green ml-auto h-2 w-2 rounded-full" aria-hidden />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
