import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Home,
  LifeBuoy,
  ListChecks,
  Palette,
  Scissors,
  Store,
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
  /** Página estática fora do SPA (abre em nova aba) */
  external?: boolean
  /** Explicação curta, mostrada no menu quando o modo iniciante está ligado */
  description?: string
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Dia a dia',
    items: [
      { to: '/painel', label: 'Início', icon: Home, description: 'Resumo do dia e seu link' },
      {
        to: '/painel/agenda',
        label: 'Agenda',
        icon: CalendarDays,
        description: 'Horários por dia, semana e mês',
      },
      {
        to: '/painel/agendamentos',
        label: 'Agendamentos',
        icon: ListChecks,
        description: 'Lista com busca e filtros',
      },
      {
        to: '/painel/clientes',
        label: 'Clientes',
        icon: Users,
        description: 'Cadastro e histórico',
      },
      {
        to: '/painel/relatorios',
        label: 'Relatórios',
        icon: BarChart3,
        ownerOnly: true,
        description: 'Faturamento e serviços mais vendidos',
      },
    ],
  },
  {
    label: 'Configurar',
    items: [
      {
        to: '/painel/servicos',
        label: 'Serviços',
        icon: Scissors,
        ownerOnly: true,
        description: 'O que o cliente pode agendar',
      },
      {
        to: '/painel/horarios',
        label: 'Horários',
        icon: Clock,
        description: 'Expediente, folgas e feriados',
      },
      {
        to: '/painel/formulario',
        label: 'Formulário',
        icon: ClipboardList,
        ownerOnly: true,
        description: 'Perguntas antes do atendimento',
      },
      {
        to: '/painel/politicas',
        label: 'Regras e políticas',
        icon: FileText,
        ownerOnly: true,
        description: 'Antecedência, cancelamento, sinal',
      },
      {
        to: '/painel/equipe',
        label: 'Equipe',
        icon: UsersRound,
        ownerOnly: true,
        description: 'Profissionais e acessos',
      },
      {
        to: '/painel/aparencia',
        label: 'Aparência',
        icon: Palette,
        ownerOnly: true,
        description: 'Logo, capa e cor da página',
      },
      {
        to: '/painel/notificacoes',
        label: 'Notificações',
        icon: Bell,
        description: 'Avisos e WhatsApp',
      },
    ],
  },
  {
    label: 'Conta',
    items: [
      {
        to: '/painel/unidades',
        label: 'Unidades',
        icon: Store,
        ownerOnly: true,
        saasOnly: true,
      },
      {
        to: '/painel/assinatura',
        label: 'Assinatura',
        icon: CreditCard,
        ownerOnly: true,
        saasOnly: true,
      },
      { to: '/painel/conta', label: 'Minha conta', icon: UserCircle },
      {
        to: '/painel/ajuda',
        label: 'Central de ajuda',
        icon: LifeBuoy,
        description: 'Guias, tutoriais e dúvidas',
      },
    ],
  },
]

export const ADMIN_ITEM: NavItem = { to: '/admin', label: 'Administração', icon: ShieldCheck }

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
