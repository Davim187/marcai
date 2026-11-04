import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Home,
  ListChecks,
  Palette,
  Scissors,
  ShieldCheck,
  UserCircle,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  ownerOnly?: boolean
  saasOnly?: boolean
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Dia a dia',
    items: [
      { to: '/painel', label: 'Início', icon: Home },
      { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/painel/agendamentos', label: 'Agendamentos', icon: ListChecks },
      { to: '/painel/clientes', label: 'Clientes', icon: Users },
      { to: '/painel/relatorios', label: 'Relatórios', icon: BarChart3, ownerOnly: true },
    ],
  },
  {
    label: 'Configurar',
    items: [
      { to: '/painel/servicos', label: 'Serviços', icon: Scissors, ownerOnly: true },
      { to: '/painel/horarios', label: 'Horários', icon: Clock },
      { to: '/painel/formulario', label: 'Formulário', icon: ClipboardList, ownerOnly: true },
      { to: '/painel/politicas', label: 'Regras e políticas', icon: FileText, ownerOnly: true },
      { to: '/painel/equipe', label: 'Equipe', icon: UsersRound, ownerOnly: true },
      { to: '/painel/aparencia', label: 'Aparência', icon: Palette, ownerOnly: true },
      { to: '/painel/notificacoes', label: 'Notificações', icon: Bell },
    ],
  },
  {
    label: 'Conta',
    items: [
      {
        to: '/painel/assinatura',
        label: 'Assinatura',
        icon: CreditCard,
        ownerOnly: true,
        saasOnly: true,
      },
      { to: '/painel/conta', label: 'Minha conta', icon: UserCircle },
    ],
  },
]

export const ADMIN_ITEM: NavItem = { to: '/admin', label: 'Super admin', icon: ShieldCheck }

export const BOTTOM_NAV: NavItem[] = [
  { to: '/painel', label: 'Início', icon: Home },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/painel/agendamentos', label: 'Lista', icon: ListChecks },
  { to: '/painel/clientes', label: 'Clientes', icon: Users },
]

export function filterNav(items: NavItem[], role: string, appMode: string) {
  return items.filter(
    (i) => (!i.ownerOnly || role === 'owner') && (!i.saasOnly || appMode === 'saas'),
  )
}
