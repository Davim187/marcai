import {
  Activity,
  ArrowLeftRight,
  Building2,
  ChevronRight,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  ScrollText,
  ShieldCheck,
  Sun,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BrandLogo } from '@/components/brand-logo'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/page-header'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useApplyTheme, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const ADMIN_NAV: Array<{ label: string; items: AdminNavItem[] }> = [
  {
    label: 'Gestão',
    items: [
      { to: '/admin', label: 'Visão geral', icon: Home },
      { to: '/admin/usuarios', label: 'Usuários e acessos', icon: Users },
      { to: '/admin/estabelecimentos', label: 'Estabelecimentos', icon: Building2 },
      { to: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin/auditoria', label: 'Auditoria', icon: ScrollText },
      { to: '/admin/sistema', label: 'Saúde do sistema', icon: Activity },
    ],
  },
  {
    label: 'Conta',
    items: [{ to: '/admin/perfil', label: 'Meu perfil', icon: UserCircle }],
  },
]

const BOTTOM_NAV: AdminNavItem[] = [
  { to: '/admin', label: 'Início', icon: Home },
  { to: '/admin/usuarios', label: 'Usuários', icon: Users },
  { to: '/admin/estabelecimentos', label: 'Negócios', icon: Building2 },
  { to: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
]

function useAdminSession() {
  const { data } = useSession()
  if (!data?.authenticated) throw new Error('AdminLayout fora da área logada')
  return data
}

function SideNav() {
  const { tenant } = useAdminSession()
  return (
    <nav className="flex flex-col gap-6" aria-label="Menu do administrador">
      {ADMIN_NAV.map((group) => (
        <div key={group.label}>
          <p className="letters text-sidebar-muted mb-1.5 px-3 text-xs">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
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
      ))}
      {tenant && (
        <NavLink
          to="/painel"
          className="text-sidebar-muted hover:text-sidebar-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-white/[0.06]"
        >
          <ArrowLeftRight className="h-[18px] w-[18px]" /> Ir para {tenant.name}
        </NavLink>
      )}
    </nav>
  )
}

export default function AdminLayout() {
  useApplyTheme()
  const { theme, toggle } = useTheme()
  const { user, tenant } = useAdminSession()
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

  return (
    <div className="bg-background min-h-dvh">
      {/* Mesmo quadro de feltro do painel, com a plaquinha do administrador */}
      <aside className="felt fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandLogo className="[&_svg]:ring-sidebar-border [&_svg]:rounded-lg [&_svg]:ring-1" />
        </div>
        <div className="bg-sidebar-active text-sidebar-active-foreground shadow-lift mx-3 mb-5 rounded-md p-3">
          <p className="letters flex items-center gap-1.5 truncate text-base">
            <ShieldCheck className="h-4 w-4 shrink-0" /> Administração
          </p>
          <p className="mt-0.5 truncate text-xs opacity-80">Gestão do sistema</p>
        </div>
        <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-6">
          <SideNav />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/90 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-md sm:h-16 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span className="truncate text-base font-bold">Administração</span>
          </div>
          <div className="hidden flex-1 lg:block" />
          <Button
            variant="round"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
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
              <DropdownMenuItem onSelect={() => navigate('/admin/perfil')}>
                Meu perfil
              </DropdownMenuItem>
              {tenant && (
                <DropdownMenuItem onSelect={() => navigate('/painel')}>
                  Ir para {tenant.name}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout} destructive>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="felt pb-safe fixed inset-x-0 bottom-0 z-30 lg:hidden" aria-label="Navegação">
        <ul className="grid grid-cols-5 gap-1 px-2 pt-1.5">
          {[...BOTTOM_NAV, { to: '/admin/mais', label: 'Mais', icon: MoreHorizontal }].map(
            (item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
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
            ),
          )}
        </ul>
      </nav>
    </div>
  )
}

/** "Mais" no celular: todas as seções do admin. */
export function AdminMorePage() {
  const { tenant } = useAdminSession()
  return (
    <div>
      <PageHeader title="Mais" />
      <div className="space-y-6">
        {ADMIN_NAV.map((group) => (
          <div key={group.label}>
            <p className="letters text-muted-foreground mb-2 text-xs">{group.label}</p>
            <ul className="bg-card divide-y rounded-xl border">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <item.icon className="text-primary h-5 w-5" /> {item.label}
                    <ChevronRight className="text-muted-foreground ml-auto h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {tenant && (
          <Link
            to="/painel"
            className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          >
            <ArrowLeftRight className="text-primary h-5 w-5" /> Ir para {tenant.name}
          </Link>
        )}
      </div>
    </div>
  )
}
