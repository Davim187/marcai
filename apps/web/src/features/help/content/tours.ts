import type { Tour } from '../types'

/**
 * Tour pelo sistema e guias interativos por página. `target` é o valor do atributo
 * `data-tour` no elemento real; se o elemento não estiver na tela (ex.: menu lateral no
 * celular), o balão aparece no centro com o mesmo texto.
 */
export const TOURS: Tour[] = [
  {
    id: 'tour:sistema',
    kind: 'tour',
    title: 'Tour pelo Marcaí',
    description: 'Uma volta pelas principais páginas do painel, em 2 minutos.',
    audience: 'all',
    steps: [
      {
        title: 'Boas-vindas ao Marcaí',
        body: 'Em poucas etapas você vê onde fica cada coisa. Use as setas do teclado ou os botões abaixo; dá para sair a qualquer momento.',
        placement: 'center',
      },
      {
        route: '/painel',
        target: 'dashboard-link',
        title: 'Seu link de agendamento',
        body: 'É por este link que os clientes agendam sozinhos. Copie e coloque na bio do Instagram, ou imprima o QR Code para o balcão.',
      },
      {
        route: '/painel',
        target: 'dashboard-greeting',
        title: 'Início',
        body: 'Resumo do dia: quanto está previsto, próximos horários, pedidos esperando confirmação e clientes novos.',
      },
      {
        route: '/painel/agenda',
        target: 'agenda-views',
        title: 'Agenda',
        body: 'Seus horários por dia, semana ou mês. Toque em um agendamento para confirmar, remarcar ou cancelar.',
      },
      {
        route: '/painel/agendamentos',
        target: 'page-header',
        title: 'Agendamentos',
        body: 'A lista de tudo o que foi marcado, com busca e filtros por período, status e serviço.',
      },
      {
        route: '/painel/clientes',
        target: 'page-header',
        title: 'Clientes',
        body: 'Cada pessoa que agenda entra aqui sozinha, com histórico e observações. O WhatsApp evita cadastro repetido.',
      },
      {
        route: '/painel/servicos',
        target: 'page-header',
        title: 'Serviços',
        body: 'O que o cliente pode agendar, com duração e preço.',
        audience: 'owner',
      },
      {
        route: '/painel/horarios',
        target: 'page-header',
        title: 'Horários',
        body: 'Seu expediente, pausas, folgas e feriados. Só os horários livres aparecem para os clientes.',
      },
      {
        route: '/painel/politicas',
        target: 'page-header',
        title: 'Regras e políticas',
        body: 'Antecedência, prazo de cancelamento, lembrete, confirmação manual, horário fixo e sinal antecipado.',
        audience: 'owner',
      },
      {
        route: '/painel/aparencia',
        target: 'page-header',
        title: 'Aparência',
        body: 'Logo, capa, cor e informações da sua página de agendamento.',
        audience: 'owner',
      },
      {
        route: '/painel/notificacoes',
        target: 'page-header',
        title: 'Notificações',
        body: 'Como você é avisado de cada agendamento e as mensagens que o cliente recebe no WhatsApp.',
      },
      {
        target: 'help-button',
        title: 'Ajuda sempre à mão',
        body: 'Aqui ficam o guia da página, os tutoriais, a central de ajuda e o modo iniciante. O assistente fica no botão redondo no canto da tela.',
      },
    ],
  },
  {
    id: 'guide:inicio',
    kind: 'guide',
    title: 'Guia do Início',
    description: 'Link de agendamento, números do dia e agendamento manual.',
    route: '/painel',
    audience: 'all',
    steps: [
      {
        target: 'dashboard-greeting',
        title: 'Seu resumo',
        body: 'Os cartões mostram o previsto para hoje, a semana e o mês, e os clientes novos.',
      },
      {
        target: 'dashboard-link',
        title: 'Copie o link',
        body: '"Copiar link" coloca o endereço na área de transferência. O botão ao lado compartilha direto pelo celular, e o de QR Code gera o código para imprimir.',
      },
      {
        target: 'new-booking',
        title: 'Agendamento manual',
        body: 'Para quem marcou por mensagem ou telefone: escolha serviço, horário e cliente.',
      },
    ],
  },
  {
    id: 'guide:agenda',
    kind: 'guide',
    title: 'Guia da Agenda',
    description: 'Navegar pelos dias, trocar a visão e criar um agendamento.',
    route: '/painel/agenda',
    audience: 'all',
    steps: [
      {
        target: 'agenda-nav',
        title: 'Andar pelas datas',
        body: '"Hoje" volta para a data atual; as setas vão para o período anterior ou o próximo.',
      },
      {
        target: 'agenda-views',
        title: 'Dia, Semana ou Mês',
        body: 'Troque a visão aqui. Em Dia e Semana dá para arrastar um agendamento para remarcar.',
      },
      {
        target: 'agenda-legend',
        title: 'Cores dos status',
        body: 'Cada cor mostra a situação: pendente, confirmado, concluído ou faltou.',
      },
      {
        target: 'agenda-new',
        title: 'Novo agendamento ou bloqueio',
        body: '"+ Novo" cria um agendamento manual ou, na aba "Bloquear horário", tira um período da agenda.',
      },
    ],
  },
  {
    id: 'guide:agendamentos',
    kind: 'guide',
    title: 'Guia de Agendamentos',
    description: 'Buscar e filtrar tudo o que foi marcado.',
    route: '/painel/agendamentos',
    audience: 'all',
    steps: [
      {
        target: 'bookings-filters',
        title: 'Busca e filtros',
        body: 'Procure pelo nome ou WhatsApp do cliente e filtre por período, status e serviço.',
      },
      {
        target: 'page-header',
        title: 'Abra para agir',
        body: 'Toque em um agendamento para confirmar, concluir, marcar falta, remarcar ou cancelar.',
      },
    ],
  },
  {
    id: 'guide:clientes',
    kind: 'guide',
    title: 'Guia de Clientes',
    description: 'Cadastrar, importar e encontrar clientes.',
    route: '/painel/clientes',
    audience: 'owner',
    steps: [
      {
        target: 'customers-new',
        title: 'Novo cliente',
        body: 'Cadastre na mão quem ainda marca por mensagem. Nome e WhatsApp são obrigatórios.',
      },
      {
        target: 'customers-import',
        title: 'Importar e exportar',
        body: 'Traga sua lista de uma planilha em CSV ou baixe a lista inteira.',
      },
      {
        target: 'customers-search',
        title: 'Encontrar alguém',
        body: 'Busque pelo nome ou telefone, ou filtre por tag. Tocando no cliente você vê o histórico.',
      },
    ],
  },
  {
    id: 'guide:servicos',
    kind: 'guide',
    title: 'Guia de Serviços',
    description: 'Criar serviços e organizar por categoria.',
    route: '/painel/servicos',
    audience: 'owner',
    steps: [
      {
        target: 'services-new',
        title: 'Novo serviço',
        body: 'Nome, duração, preço e o intervalo de limpeza depois do atendimento.',
      },
      {
        target: 'services-category',
        title: 'Categorias',
        body: 'Agrupe serviços (ex.: Mãos, Pés, Sessões). Na página, o cliente vê os serviços separados por categoria.',
      },
      {
        target: 'page-header',
        title: 'Ordem dos serviços',
        body: 'Arraste os serviços na lista para mudar a ordem em que aparecem para o cliente.',
      },
    ],
  },
  {
    id: 'guide:horarios',
    kind: 'guide',
    title: 'Guia de Horários',
    description: 'Expediente, folgas, pausas e feriados.',
    route: '/painel/horarios',
    audience: 'all',
    steps: [
      {
        target: 'schedule-hours',
        title: 'Expediente semanal',
        body: 'Os turnos de cada dia. Dá para ter mais de um turno no mesmo dia.',
      },
      {
        target: 'schedule-timeoff',
        title: 'Folgas e bloqueios',
        body: 'Médico, viagem, folga: períodos que saem da agenda uma vez só.',
      },
      {
        target: 'schedule-breaks',
        title: 'Pausas fixas',
        body: 'Se repetem toda semana, como o almoço.',
      },
      {
        target: 'schedule-holidays',
        title: 'Feriados',
        body: 'Datas em que a agenda fecha. Os nacionais podem entrar sozinhos (Regras e políticas).',
      },
    ],
  },
  {
    id: 'guide:politicas',
    kind: 'guide',
    title: 'Guia de Regras e políticas',
    description: 'Como e quando os clientes podem agendar, cancelar e remarcar.',
    route: '/painel/politicas',
    audience: 'owner',
    steps: [
      {
        target: 'policies-online',
        title: 'Agendamento online',
        body: 'Antecedência mínima, até quantos dias à frente, intervalo entre horários, confirmação manual e sinal antecipado.',
      },
      {
        target: 'policies-recurring',
        title: 'Horário fixo semanal',
        body: 'Deixe o cliente reservar o mesmo dia e horário toda semana, com as próximas sessões já garantidas.',
      },
      {
        target: 'policies-cancel',
        title: 'Cancelamento',
        body: 'Até quantas horas antes o cliente cancela ou remarca sozinho, e o texto da sua política.',
      },
      {
        target: 'policies-save',
        title: 'Salvar',
        body: 'Nada muda até tocar em "Salvar regras".',
      },
    ],
  },
  {
    id: 'guide:aparencia',
    kind: 'guide',
    title: 'Guia de Aparência',
    description: 'Logo, capa, cor e informações da página.',
    route: '/painel/aparencia',
    audience: 'owner',
    steps: [
      {
        target: 'appearance-brand',
        title: 'Marca',
        body: 'Logo, foto de capa (com enquadramento e zoom) e a cor principal.',
      },
      {
        target: 'appearance-info',
        title: 'Informações',
        body: 'Nome, bio, endereço, Instagram e WhatsApp que aparecem no topo da página.',
      },
      {
        target: 'appearance-preview',
        title: 'Pré-visualização',
        body: 'Mostra a página como o cliente vê, antes de salvar.',
      },
      {
        target: 'appearance-save',
        title: 'Salvar',
        body: 'Grava as mudanças. A página pública muda na hora.',
      },
    ],
  },
  {
    id: 'guide:notificacoes',
    kind: 'guide',
    title: 'Guia de Notificações',
    description: 'Avisos para você e mensagens para o cliente.',
    route: '/painel/notificacoes',
    audience: 'all',
    steps: [
      {
        target: 'notif-you',
        title: 'Avisos para você',
        body: 'Escolha onde ser avisado quando alguém agenda, cancela ou remarca.',
      },
      {
        target: 'notif-customer',
        title: 'Mensagens para o cliente',
        body: 'Confirmação e lembrete pelo seu WhatsApp conectado (planos Profissional e Premium).',
      },
      {
        target: 'notif-templates',
        title: 'Textos das mensagens',
        body: 'Edite cada mensagem. As palavras entre chaves viram os dados do agendamento.',
        audience: 'owner',
      },
    ],
  },
  {
    id: 'guide:equipe',
    kind: 'guide',
    title: 'Guia de Equipe',
    description: 'Profissionais e acesso ao painel.',
    route: '/painel/equipe',
    audience: 'owner',
    steps: [
      {
        target: 'team-new',
        title: 'Novo profissional',
        body: 'Cria uma agenda própria. Com mais de um, o cliente escolhe com quem agendar.',
      },
      {
        target: 'team-invite',
        title: 'Dar acesso ao painel',
        body: 'Convide pelo e-mail. Como equipe, a pessoa vê só a própria agenda.',
      },
    ],
  },
  {
    id: 'guide:formulario',
    kind: 'guide',
    title: 'Guia do Formulário',
    description: 'Perguntas extras na hora de agendar.',
    route: '/painel/formulario',
    audience: 'owner',
    steps: [
      {
        target: 'forms-presets',
        title: 'Perguntas sugeridas',
        body: 'Escolha sua área e adicione as perguntas mais comuns de uma vez.',
      },
      {
        target: 'forms-new',
        title: 'Sua própria pergunta',
        body: 'Texto, seleção, sim/não ou foto de referência. As respostas chegam junto com o aviso.',
      },
    ],
  },
]

export const tourById = (id: string) => TOURS.find((t) => t.id === id)

/** Guia interativo da página atual (rota exata, sem barra no fim). */
export function guideForRoute(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  return TOURS.find((t) => t.kind === 'guide' && t.route === path)
}
