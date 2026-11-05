import { Users } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { useRefreshSession, useSession } from '@/lib/session'

/** Convites pendentes para a equipe de outro estabelecimento: aceitar ou recusar. */
export function InviteBanner() {
  const { data } = useSession()
  const refresh = useRefreshSession()
  const navigate = useNavigate()
  const accept = useApiMutation(
    (tenantId: string) => api(`/auth/invites/${tenantId}/accept`, { method: 'POST' }),
    {
      success: 'Convite aceito! Você já está na nova equipe.',
      onSuccess: () => {
        refresh()
        navigate('/painel')
      },
    },
  )
  const decline = useApiMutation(
    (tenantId: string) => api(`/auth/invites/${tenantId}/decline`, { method: 'POST' }),
    { success: 'Convite recusado', onSuccess: () => refresh() },
  )
  if (!data?.authenticated || !data.invites?.length) return null
  return (
    <div className="space-y-2 px-4 pt-3">
      {data.invites.map((inv) => (
        <div
          key={inv.tenantId}
          className="bg-primary-soft text-primary mx-auto flex max-w-4xl flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
          role="status"
        >
          <Users className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Você recebeu um convite para a equipe de <strong>{inv.tenant.name}</strong>.
          </span>
          <Button
            size="sm"
            onClick={() => accept.mutate(inv.tenantId)}
            loading={accept.isPending && accept.variables === inv.tenantId}
          >
            Aceitar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => decline.mutate(inv.tenantId)}
            loading={decline.isPending && decline.variables === inv.tenantId}
          >
            Recusar
          </Button>
        </div>
      ))}
    </div>
  )
}
