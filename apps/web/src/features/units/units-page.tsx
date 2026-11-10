import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, MapPin, Plus, Store } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { PLANS } from '@marcai/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { useTenant } from '@/lib/session'

interface Unit {
  id: string
  name: string
  slug: string
  city: string | null
  isMain: boolean
  current: boolean
  professionals: number
  canEnter: boolean
  publicUrl: string
}

function usageText(used: number, limit: number | null, one: string, many: string) {
  return limit === null
    ? `${used} ${used === 1 ? one : many} · ilimitado`
    : `${used} de ${limit} ${limit === 1 ? one : many}`
}

/** Unidades da conta: todas na mesma assinatura, com os limites do plano da principal. */
export default function UnitsPage() {
  const { tenant } = useTenant()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['units'],
    queryFn: () => api<Unit[]>('/tenant/units'),
  })
  const enter = useApiMutation(
    (id: string) => api('/auth/switch-tenant', { body: { tenantId: id } }),
    {
      onSuccess: () => {
        qc.clear()
        window.location.href = '/painel'
      },
    },
  )
  const { limits, usage, isUnit, rootName } = tenant.account
  const plan = PLANS[tenant.effectivePlan]
  const atLocationLimit = limits.locations !== null && usage.locations >= limits.locations
  const atProLimit = limits.professionals !== null && usage.professionals >= limits.professionals
  const blocked = atLocationLimit || atProLimit

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unidades"
        description="Todos os seus endereços na mesma assinatura. Cada unidade tem sua página, agenda e equipe."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold">Plano {plan.name}</p>
            <p className="text-muted-foreground text-sm tabular-nums">
              {usageText(usage.locations, limits.locations, 'unidade', 'unidades')} ·{' '}
              {usageText(
                usage.professionals,
                limits.professionals,
                'profissional',
                'profissionais',
              )}
            </p>
            {isUnit && (
              <p className="text-muted-foreground text-xs">
                A assinatura fica na unidade principal ({rootName}).
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button disabled={blocked} onClick={() => navigate('/onboarding?unidade=1&passo=1')}>
              <Plus /> Nova unidade
            </Button>
            {blocked && (
              <p className="text-muted-foreground text-xs">
                {atLocationLimit
                  ? 'Limite de unidades do plano.'
                  : 'Limite de profissionais do plano.'}{' '}
                {!isUnit && (
                  <Link to="/painel/assinatura" className="text-primary font-medium underline">
                    Mudar de plano
                  </Link>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((u) => (
            <li key={u.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <Store className="text-muted-foreground size-4 shrink-0" />
                        <span className="truncate">{u.name}</span>
                      </p>
                      {u.city && (
                        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                          <MapPin className="size-3" /> {u.city}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {u.isMain && <Badge variant="muted">Principal</Badge>}
                      {u.current && <Badge>Você está aqui</Badge>}
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {u.professionals}{' '}
                    {u.professionals === 1 ? 'profissional ativo' : 'profissionais ativos'}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {!u.current && u.canEnter && (
                      <Button
                        size="sm"
                        loading={enter.isPending && enter.variables === u.id}
                        onClick={() => enter.mutate(u.id)}
                      >
                        Entrar nesta unidade
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" asChild>
                      <a href={u.publicUrl} target="_blank" rel="noreferrer">
                        <ExternalLink /> Página pública
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
