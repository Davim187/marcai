import { LogOut, Menu, Moon, MoreHorizontal, Sun, ExternalLink, Copy } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { BrandLogo } from '../brand-logo'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { api } from '@/lib/api'
import { useTenant } from '@/lib/session'
import { useApplyTheme, useTheme } from '@/lib/theme'
import { cn, copyToClipboard } from '@/lib/utils'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { InviteBanner } from '../invite-banner'
import { SubscriptionBanner } from './subscription-banner'
import { ADMIN_ITEM, BOTTOM_NAV, filterNav, NAV_GROUPS } from './nav-config'

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { tenant, appMode, user } = useTenant()
  return (
    <nav className="flex flex-col gap-6" aria-label="Menu principal">
      {NAV_GROUPS.map((group) => {
        const items = filterNav(group.items, tenant.role, appMode)
        if (!items.length) return null
        return (
          <div key={group.label}>
            <p className="letters text-sidebar-muted mb-1.5 px-3 text-xs">{group.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/painel'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'text-sidebar-muted hover:text-sidebar-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/[0.06]',
                        isActive &&
                          'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground font-semibold',
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px]" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {user.isSuperAdmin && (
        <NavLink
          to={ADMIN_ITEM.to}
          className="text-sidebar-muted hover:text-sidebar-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/[0.06]"
        >
          <ADMIN_ITEM.icon className="h-[18px] w-[18px]" /> {ADMIN_ITEM.label}
        </NavLink>
      )}
    </nav>
  )
}

export default function PanelLayout() {
  useApplyTheme()
  const { theme, toggle } = useTheme()
  const session = useTenant()
  const { tenant, user, impersonating } = session
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    qc.clear()
    navigate('/entrar', { replace: true })
  }

  async function copyLink() {
    if (await copyToClipboard(tenant.publicUrl))
      toast.success('Link copiado! Cole na bio do Instagram')
  }

  return (
    <div className="bg-background min-h-dvh">
      {impersonating && (
        <div className="bg-warning text-warning-foreground sticky top-0 z-50 flex items-center justify-center gap-3 px-4 py-2 text-sm font-semibold">
          Modo suporte: você está vendo o painel de {tenant.name}.
          <button className="underline" onClick={logout}>
            Encerrar
          </button>
        </div>
      )}
      {/* Sidebar desktop */}
      {/* Menu lateral: o quadro de feltro, com a plaquinha do salão por cima */}
      <aside className="felt fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandLogo className="[&_svg]:ring-sidebar-border [&_svg]:rounded-lg [&_svg]:ring-1" />
        </div>
        <div className="bg-sidebar-active text-sidebar-active-foreground shadow-lift mx-3 mb-5 rounded-md p-3">
          <p className="letters truncate text-base">{tenant.name}</p>
          <button
            onClick={copyLink}
            className="text-cobalt mt-0.5 flex w-full items-center gap-1.5 truncate text-xs underline-offset-4 hover:underline"
          >
            <Copy className="h-3 w-3 shrink-0" />
            <span className="truncate">{tenant.publicUrl.replace(/^https?:\/\//, '')}</span>
          </button>
        </div>
        <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-6">
          <SideNav />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/90 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-md sm:h-16 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <span className="truncate text-base font-bold">{tenant.name}</span>
          </div>
          <div className="hidden flex-1 lg:block" />
          <Button variant="round" size="icon" asChild className="hidden sm:inline-flex">
            <a
              href={tenant.publicUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir minha página de agendamento"
            >
              <ExternalLink />
            </a>
          </Button>
          <Button
            variant="round"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full" aria-label="Menu da conta">
              <Avatar name={user.name} src={user.avatarUrl} className="h-9 w-9" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <span className="text-foreground block text-sm">{user.name}</span>
                <span className="block font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/painel/conta')}>
                Minha conta
              </DropdownMenuItem>
              {session.memberships.length > 1 &&
                session.memberships
                  .filter((m) => m.tenantId !== tenant.id)
                  .map((m) => (
                    <DropdownMenuItem
                      key={m.tenantId}
                      onSelect={async () => {
                        await api('/auth/switch-tenant', { body: { tenantId: m.tenantId } })
                        qc.clear()
                        window.location.href = '/painel'
                      }}
                    >
                      Trocar para {m.tenant.name}
                    </DropdownMenuItem>
                  ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout} destructive>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <InviteBanner />
        <SubscriptionBanner />

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Bottom navigation (celular) */}
      <nav className="felt pb-safe fixed inset-x-0 bottom-0 z-30 lg:hidden" aria-label="Navegação">
        <ul className="grid grid-cols-5 gap-1 px-2 pt-1.5">
          {BOTTOM_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/painel'}
                className={({ isActive }) =>
                  cn(
                    'text-sidebar-muted flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors',
                    isActive && 'bg-sidebar-active text-sidebar-active-foreground font-semibold',
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink
              to="/painel/mais"
              className={({ isActive }) =>
                cn(
                  'text-sidebar-muted flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors',
                  isActive && 'bg-sidebar-active text-sidebar-active-foreground font-semibold',
                )
              }
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              Mais
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  )
}

export function MobileMenuIcon() {
  return <Menu />
}
