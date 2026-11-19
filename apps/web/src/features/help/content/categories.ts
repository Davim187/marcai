import type { HelpCategory } from '../types'

export const CATEGORIES: HelpCategory[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos',
    description: 'Deixar a agenda pronta para receber o primeiro cliente.',
  },
  {
    id: 'agenda',
    title: 'Agenda e agendamentos',
    description: 'Ver o dia, criar, confirmar, remarcar e cancelar horários.',
  },
  {
    id: 'clientes',
    title: 'Clientes',
    description: 'Cadastro, importação de planilha, histórico e LGPD.',
  },
  {
    id: 'servicos-horarios',
    title: 'Serviços e horários',
    description: 'O que você oferece, quanto tempo leva e quando você atende.',
  },
  {
    id: 'pagamentos',
    title: 'Sinal e pagamentos',
    description: 'Cobrar sinal pelo PIX ou Mercado Pago e aprovar comprovantes.',
  },
  {
    id: 'mensagens',
    title: 'Avisos e WhatsApp',
    description: 'Como você e seus clientes ficam sabendo de cada agendamento.',
  },
  {
    id: 'pagina-publica',
    title: 'Página de agendamento',
    description: 'Seu link, a aparência da página e as regras para agendar.',
  },
  {
    id: 'equipe-conta',
    title: 'Equipe e conta',
    description: 'Profissionais, acessos, assinatura e seus dados.',
  },
  {
    id: 'problemas',
    title: 'Problemas comuns',
    description: 'Quando algo não sai como esperado.',
  },
]

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)
