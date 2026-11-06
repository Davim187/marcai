import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, RefreshCw, Sparkles } from 'lucide-react'
import { askConfirm } from '@/components/confirm-host'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { fmtLocal, StatCard } from './admin-shared'

interface SystemInfo {
  appMode: 'saas' | 'single_tenant'
  environment: string
  integrations: {
    email: 'resend' | 'smtp' | 'log'
    whatsapp: 'console' | 'evolution' | 'meta'
    billing: 'fake' | 'mercadopago'
    google: boolean
    push: boolean
  }
  superAdminEmails: string[]
  queue: Partial<Record<'pending' | 'processing' | 'done' | 'failed' | 'canceled', number>>
  failedJobs: Array<{
    id: string
    channel: string
    kind: string
    attempts: number
    lastError: string | null
    createdAt: string
  }>
  counts: {
    users: number
    tenants: number
    deletedTenants: number
    bookings: number
    customers: number
    sessions: number
  }
}

export default function AdminSystemPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-system'],
    queryFn: () => api<SystemInfo>('/admin/system'),
    refetchInterval: 30_000,
  })
  const retry = useApiMutation((id: string) => api(`/admin/jobs/${id}/retry`, { method: 'POST' }), {
    success: 'Envio recolocado na fila',
    invalidate: [['admin-system']],
  })
  const cleanup = useApiMutation(
    () => api<{ sessions: number; jobs: number }>('/admin/maintenance/cleanup', { method: 'POST' }),
    {
      success: (r) =>
        `Limpeza feita: ${r.sessions} sessão(ões) vencida(s), ${r.jobs} envio(s) antigo(s)`,
      invalidate: [['admin-system'], ['admin-audit']],
    },
  )

  const i = data?.integrations
  const integrations: Array<{ name: string; ok: boolean; detail: string }> = i
    ? [
        {
          name: 'E-mail',
          ok: i.email !== 'log',
          detail:
            i.email === 'log'
              ? 'Não configurado: e-mails só aparecem no log (recuperação de senha não chega)'
              : i.email === 'resend'
                ? 'Resend'
                : 'SMTP',
        },
        {
          name: 'WhatsApp',
          ok: i.whatsapp !== 'console',
          detail:
            i.whatsapp === 'console'
              ? 'Simulado: mensagens só aparecem no log'
              : i.whatsapp === 'evolution'
                ? 'Evolution API'
                : 'Meta Cloud API',
        },
        {
          name: 'Cobrança',
          ok: i.billing === 'mercadopago',
          detail: i.billing === 'fake' ? 'Simulada (sem cobrança real)' : 'Mercado Pago',
        },
        { name: 'Login com Google', ok: i.google, detail: i.google ? 'Ativo' : 'Desativado' },
        {
          name: 'Notificação no celular (push)',
          ok: i.push,
          detail: i.push ? 'Ativo' : 'Sem chaves VAPID',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saúde do sistema"
        description="Integrações, fila de envios e manutenção."
        actions={
          <Button
            variant="secondary"
            loading={cleanup.isPending}
            onClick={async () => {
              if (
                await askConfirm({
                  title: 'Fazer limpeza do sistema?',
                  description:
                    'Apaga sessões já vencidas e envios concluídos há mais de 30 dias. Nada que esteja em uso é afetado.',
                  confirmLabel: 'Limpar',
                })
              )
                cleanup.mutate()
            }}
          >
            <Sparkles /> Limpeza
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Usuários" value={data?.counts.users} />
        <StatCard
          label="Estabelecimentos"
          value={data?.counts.tenants}
          hint={data && `${data.counts.deletedTenants} excluído(s)`}
        />
        <StatCard label="Sessões abertas" value={data?.counts.sessions} />
        <StatCard label="Agendamentos (total)" value={data?.counts.bookings} />
        <StatCard label="Clientes finais (total)" value={data?.counts.customers} />
        <StatCard
          label="Modo"
          value={data && (data.appMode === 'saas' ? 'SaaS' : 'Exclusivo')}
          hint={data?.environment}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Integrações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <ul className="divide-y">
                {integrations.map((it) => (
                  <li key={it.name} className="flex items-start gap-3 py-2.5 text-sm">
                    {it.ok ? (
                      <CheckCircle2 className="text-green mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <CircleAlert className="text-mustard mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{it.name}</p>
                      <p className="text-muted-foreground text-xs">{it.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fila de envios (avisos, lembretes, e-mails)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['pending', 'Na fila', 'default'],
                  ['processing', 'Enviando', 'default'],
                  ['done', 'Enviados', 'success'],
                  ['failed', 'Falharam', 'destructive'],
                  ['canceled', 'Cancelados', 'muted'],
                ] as const
              ).map(([k, label, variant]) => (
                <Badge key={k} variant={variant}>
                  {label}: {data?.queue[k] ?? 0}
                </Badge>
              ))}
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">Administradores pela configuração</p>
              <p className="text-muted-foreground text-xs">
                {data?.superAdminEmails.length
                  ? data.superAdminEmails.join(', ')
                  : 'Nenhum (SUPER_ADMIN_EMAILS vazio)'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Envios com falha</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : !data?.failedJobs.length ? (
            <p className="text-muted-foreground py-4 text-sm">
              Nenhuma falha. Tudo certo por aqui.
            </p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-2">Quando</th>
                  <th>Canal</th>
                  <th>Tipo</th>
                  <th>Erro</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.failedJobs.map((j) => (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap py-2.5 text-xs">
                      {fmtLocal(j.createdAt, 'dd/MM/yy HH:mm')}
                    </td>
                    <td className="capitalize">{j.channel}</td>
                    <td className="text-xs">{j.kind}</td>
                    <td
                      className="text-muted-foreground max-w-xs truncate text-xs"
                      title={j.lastError ?? ''}
                    >
                      {j.lastError ?? '—'} ({j.attempts} tentativa(s))
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retry.mutate(j.id)}
                        loading={retry.isPending && retry.variables === j.id}
                      >
                        <RefreshCw /> Tentar de novo
                      </Button>
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
