import type { BeginnerTip, Hint } from '../types'

/** Explicações curtas ao lado de campos e cards (ícone ⓘ). */
export const HINTS = {
  minAdvance: {
    title: 'Antecedência mínima',
    body: 'Impede agendamento em cima da hora. Com 2 horas, às 10:00 o primeiro horário oferecido é 12:00.',
    more: 'regras-agendamento',
  },
  maxAdvance: {
    title: 'Até quantos dias à frente',
    body: 'Quantos dias da sua agenda ficam abertos na página. Não limita o horário fixo nem o agendamento pelo painel.',
  },
  slotInterval: {
    title: 'Intervalo entre horários',
    body: 'De quanto em quanto tempo os horários aparecem para o cliente (ex.: 08:00, 08:30, 09:00).',
  },
  requireConfirmation: {
    title: 'Confirmação manual',
    body: 'Cada agendamento chega como pendente e só vale depois que você confirma.',
    more: 'confirmar-pedido',
  },
  prepayment: {
    title: 'Sinal antecipado',
    body: 'O cliente paga uma parte para reservar. Sem pagamento no prazo, o horário volta a ficar livre.',
    more: 'sinal-como-funciona',
  },
  recurring: {
    title: 'Horário fixo semanal',
    body: 'O cliente reserva o mesmo dia e horário toda semana; as próximas sessões ficam garantidas e renovam sozinhas.',
    more: 'horario-fixo',
  },
  cancelHours: {
    title: 'Prazo para cancelar e remarcar',
    body: 'Até quantas horas antes o cliente consegue cancelar ou remarcar sozinho pelo link. Depois disso, só falando com você.',
    more: 'area-do-cliente',
  },
  reminder: {
    title: 'Lembrete',
    body: 'Quanto tempo antes o cliente recebe o lembrete, com o botão para confirmar presença.',
    more: 'avisos-whatsapp',
  },
  workingHours: {
    title: 'Expediente semanal',
    body: 'Os horários em que você atende. O serviço precisa caber inteiro no turno para aparecer.',
    more: 'configurar-expediente',
  },
  timeOff: {
    title: 'Folgas e bloqueios',
    body: 'Períodos que saem da agenda uma vez só. Agendamentos que já existiam continuam marcados.',
    more: 'bloquear-horario',
  },
  breaks: {
    title: 'Pausas fixas',
    body: 'Repetem toda semana no mesmo dia e horário, como o almoço.',
  },
  holidays: {
    title: 'Feriados',
    body: 'Datas em que a agenda fecha o dia inteiro.',
  },
  brand: {
    title: 'Marca',
    body: 'A cor e as imagens valem só na sua página de agendamento e na área do cliente. O painel continua com a cara do Marcaí.',
    more: 'aparencia',
  },
  notifyYou: {
    title: 'Avisos para você',
    body: 'Cada canal é independente: ligue quantos quiser.',
    more: 'avisos-canais',
  },
  notifyCustomer: {
    title: 'Mensagens para o cliente',
    body: 'Saem do seu WhatsApp conectado. Sem conexão, o cliente ainda recebe por e-mail, se informou um.',
    more: 'avisos-whatsapp',
  },
  templates: {
    title: 'Textos das mensagens',
    body: 'Palavras entre chaves, como {cliente} e {data}, são trocadas pelos dados do agendamento na hora do envio.',
  },
  formPresets: {
    title: 'Perguntas sugeridas',
    body: 'As perguntas mais comuns da sua área. Quem já estiver no formulário não é adicionada de novo.',
  },
  serviceBuffer: {
    title: 'Intervalo após',
    body: 'Tempo de limpeza ou preparo depois do atendimento. Bloqueia a agenda, mas o cliente não vê.',
  },
} satisfies Record<string, Hint>

export type HintId = keyof typeof HINTS

/** Dica do modo iniciante no topo de cada página. */
export const BEGINNER_TIPS: BeginnerTip[] = [
  {
    route: '/painel',
    title: 'Comece pelo seu link',
    body: 'Copie o link no cartão "Seu link de agendamento" e coloque na bio do Instagram. Cada agendamento aparece aqui e na Agenda.',
    guideId: 'guide:inicio',
    tutorial: 'compartilhar-link',
  },
  {
    route: '/painel/agenda',
    title: 'Sua agenda',
    body: 'Toque em um horário para ver os detalhes. "+ Novo" marca alguém que pediu por mensagem ou bloqueia um período.',
    guideId: 'guide:agenda',
    tutorial: 'agendamento-manual',
  },
  {
    route: '/painel/agendamentos',
    title: 'Tudo o que foi marcado',
    body: 'Use a busca e os filtros para achar um agendamento. Pendentes esperam a sua confirmação.',
    guideId: 'guide:agendamentos',
    tutorial: 'confirmar-pedido',
  },
  {
    route: '/painel/clientes',
    title: 'Seus clientes',
    body: 'Quem agenda entra aqui sozinho. Você não precisa cadastrar ninguém para começar.',
    guideId: 'guide:clientes',
    tutorial: 'cadastrar-cliente',
  },
  {
    route: '/painel/servicos',
    title: 'O que você oferece',
    body: 'Cada serviço tem duração e preço. A duração define quanto tempo a agenda fica ocupada.',
    guideId: 'guide:servicos',
    tutorial: 'criar-servico',
  },
  {
    route: '/painel/horarios',
    title: 'Quando você atende',
    body: 'O cliente só vê horários dentro do expediente, fora das pausas, folgas e feriados.',
    guideId: 'guide:horarios',
    tutorial: 'configurar-expediente',
  },
  {
    route: '/painel/politicas',
    title: 'As regras da sua agenda',
    body: 'Se estiver em dúvida, os valores que já vieram funcionam bem. Toque no ⓘ ao lado de cada opção para entender.',
    guideId: 'guide:politicas',
    tutorial: 'regras-agendamento',
  },
  {
    route: '/painel/aparencia',
    title: 'A cara da sua página',
    body: 'Logo, capa e cor deixam a página com a sua identidade. A pré-visualização mostra como fica.',
    guideId: 'guide:aparencia',
    tutorial: 'aparencia',
  },
  {
    route: '/painel/notificacoes',
    title: 'Como você fica sabendo',
    body: 'Ligue os avisos que fazem sentido para você. No celular, a notificação chega mesmo com o painel fechado.',
    guideId: 'guide:notificacoes',
    tutorial: 'avisos-whatsapp',
  },
  {
    route: '/painel/equipe',
    title: 'Sua equipe',
    body: 'Cada profissional tem a própria agenda. Dar acesso ao painel é opcional.',
    guideId: 'guide:equipe',
    tutorial: 'equipe',
  },
  {
    route: '/painel/formulario',
    title: 'Perguntas antes do atendimento',
    body: 'Comece pelas perguntas sugeridas da sua área. Dá para editar ou apagar depois.',
    guideId: 'guide:formulario',
    tutorial: 'formulario',
  },
]

export const beginnerTipFor = (pathname: string) => {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  return BEGINNER_TIPS.find((t) => t.route === path)
}
