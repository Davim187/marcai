import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useTenant } from '@/lib/session'
import { copyToClipboard } from '@/lib/utils'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { NavLink } from 'react-router'
import { ADMIN_ITEM, filterNav, NAV_GROUPS } from './nav-config'

/** Menu completo para o celular (aba "Mais"). */
export default function MorePage() {
  const { tenant, appMode, user } = useTenant()
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-sm font-semibold">Seu link de agendamento</p>
        <p className="text-primary mt-1 truncate text-sm">{tenant.publicUrl}</p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () =>
              (await copyToClipboard(tenant.publicUrl)) && toast.success('Link copiado!')
            }
          >
            <Copy /> Copiar
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={tenant.publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir
            </a>
          </Button>
        </div>
      </Card>
      {NAV_GROUPS.map((g) => {
        const items = filterNav(g.items, tenant.role, appMode)
        return (
          <div key={g.label}>
            <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold uppercase tracking-wider">
              {g.label}
            </h2>
            <Card className="divide-y overflow-hidden">
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end
                  className="hover:bg-muted flex items-center gap-3 px-4 py-3.5 text-sm font-medium"
                >
                  <i.icon className="text-primary h-5 w-5" /> {i.label}
                </NavLink>
              ))}
            </Card>
          </div>
        )
      })}
      {user.isSuperAdmin && (
        <Card className="overflow-hidden">
          <NavLink
            to={ADMIN_ITEM.to}
            className="hover:bg-muted flex items-center gap-3 px-4 py-3.5 text-sm font-medium"
          >
            <ADMIN_ITEM.icon className="text-primary h-5 w-5" /> {ADMIN_ITEM.label}
          </NavLink>
        </Card>
      )}
    </div>
  )
}
