import type { Article } from '../types'

/**
 * Artigos, perguntas frequentes e soluções. Respostas curtas e verdadeiras sobre o que o
 * Marcaí faz hoje; nada de prometer recurso que não existe.
 */
export const ARTICLES: Article[] = [
  // ---------- Primeiros passos ----------
  {
    slug: 'primeiros-passos',
    kind: 'article',
    title: 'Checklist para receber o primeiro agendamento',
    summary:
      'Confira serviços, horários e regras, deixe a página com a sua cara e divulgue o link.',
    category: 'primeiros-passos',
    audience: 'owner',
    route: '/painel',
    related: ['criar-servico', 'configurar-expediente', 'compartilhar-link'],
    keywords: ['começar', 'checklist', 'primeiro agendamento', 'configurar', 'início'],
    sections: [
      {
        heading: '1. Serviços',
        body: 'No cadastro já entram serviços sugeridos para a sua área. Em Serviços, ajuste nome, duração e preço, e apague o que você não faz.',
      },
      {
        heading: '2. Horários',
        body: 'Em Horários, confira o expediente de cada dia, as pausas fixas (como o almoço) e os bloqueios.',
      },
      {
        heading: '3. Regras',
        body: 'Em Regras e políticas, defina com quanta antecedência dá para agendar, até quantos dias à frente e o prazo para cancelar.',
      },
      {
        heading: '4. Aparência',
        body: 'Envie logo e foto de capa e escolha a cor. É o que o cliente vê ao abrir o link.',
      },
      {
        heading: '5. Divulgue',
        body: 'Copie o link no Início e coloque na bio do Instagram. Faça um agendamento de teste pelo próprio link para ver como o cliente vê.',
      },
    ],
  },
  {
    slug: 'como-o-cliente-agenda',
    kind: 'article',
    title: 'Como o cliente agenda pelo seu link',
    summary:
      'Ele abre o link, escolhe serviço, profissional e horário livre, informa nome e WhatsApp e confirma. Não precisa baixar app nem criar conta.',
    category: 'pagina-publica',
    audience: 'all',
    related: ['compartilhar-link', 'area-do-cliente'],
    keywords: ['cliente agenda', 'página pública', 'como funciona', 'link', 'aplicativo', 'conta'],
    sections: [
      {
        body: 'O cliente abre seu link, escolhe o serviço, o profissional (quando há mais de um) e um dos horários livres. Só aparecem horários dentro do seu expediente e das suas regras.',
      },
      {
        body: 'Depois informa nome e WhatsApp, responde as perguntas do formulário (se você criou) e aceita o uso dos dados (LGPD). Não precisa baixar aplicativo nem criar conta.',
      },
      {
        body: 'Se a confirmação manual estiver ligada, o pedido chega como pendente até você confirmar. Se o sinal estiver ligado, o horário só confirma depois do pagamento.',
      },
    ],
  },
  {
    slug: 'area-do-cliente',
    kind: 'article',
    title: 'O que o cliente consegue fazer pelo link da confirmação',
    summary:
      'Ver os detalhes, confirmar presença, remarcar, cancelar e adicionar ao Google Agenda, dentro do prazo da sua política.',
    category: 'pagina-publica',
    audience: 'all',
    related: ['regras-agendamento'],
    keywords: ['área do cliente', 'cliente cancela', 'cliente remarca', 'confirmar presença'],
    sections: [
      {
        body: 'Toda confirmação e lembrete leva um link só daquele agendamento. Por ele o cliente vê os detalhes, confirma presença, remarca para outro horário livre, cancela e adiciona ao Google Agenda.',
      },
      {
        body: 'Remarcar e cancelar pelo link só vale até o prazo definido em Regras e políticas ("Até quantas horas antes"). Depois disso, a página orienta o cliente a falar com você.',
      },
    ],
  },
  // ---------- Agenda ----------
  {
    slug: 'status-agendamento',
    kind: 'article',
    title: 'O que significa cada status',
    summary:
      'Pendente espera sua confirmação ou o pagamento; Confirmado está garantido; Concluído foi atendido; Faltou não veio; Cancelado foi liberado.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agenda',
    related: ['confirmar-pedido', 'concluir-faltas'],
    keywords: ['status', 'pendente', 'confirmado', 'concluído', 'faltou', 'cancelado', 'cores'],
    sections: [
      {
        body: 'Pendente: o horário está reservado, mas falta a sua confirmação (confirmação manual) ou o pagamento do sinal.',
      },
      { body: 'Confirmado: garantido. O lembrete sai no tempo que você definiu.' },
      {
        body: 'Concluído e Faltou: marcados por você depois do horário. Entram nos relatórios e no histórico do cliente.',
      },
      {
        body: 'Cancelado: o horário voltou a ficar livre. Aparece na Agenda só com "Cancelados" marcado.',
      },
    ],
  },
  {
    slug: 'visoes-da-agenda',
    kind: 'article',
    title: 'Agenda por dia, semana e mês',
    summary:
      'Troque a visão nas abas Dia, Semana e Mês. Em Dia e Semana dá para arrastar um agendamento para remarcar.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agenda',
    related: ['remarcar-cancelar', 'agendamento-manual'],
    keywords: ['agenda', 'dia', 'semana', 'mês', 'calendário', 'arrastar', 'filtro profissional'],
    sections: [
      {
        body: 'As abas Dia, Semana e Mês mudam a visão. "Hoje" volta para a data atual e as setas andam para o período anterior ou o próximo.',
      },
      {
        body: 'Com equipe, a dona escolhe ver toda a equipe ou um profissional. Cada profissional da equipe vê só a própria agenda.',
      },
      {
        body: 'Em Dia e Semana, arraste um agendamento para outro horário: o Marcaí pergunta antes de remarcar.',
      },
    ],
  },
  // ---------- Clientes ----------
  {
    slug: 'clientes-lgpd',
    kind: 'article',
    title: 'Dados dos clientes e LGPD',
    summary:
      'O cliente autoriza o uso dos dados ao agendar. Você pode exportar a lista e excluir os dados de um cliente quando ele pedir.',
    category: 'clientes',
    audience: 'owner',
    route: '/painel/clientes',
    related: ['cadastrar-cliente'],
    keywords: ['lgpd', 'excluir cliente', 'dados', 'privacidade', 'apagar cliente'],
    sections: [
      {
        body: 'Ao agendar, o cliente aceita que você use nome e WhatsApp para cuidar do agendamento.',
      },
      {
        body: 'Para excluir os dados de alguém, abra o cliente e use a opção de excluir. O nome, o telefone, o e-mail, as observações e as fotos de referência são apagados; o histórico financeiro fica sem identificação. Agendamentos futuros são cancelados.',
      },
    ],
  },
  // ---------- Pagamentos ----------
  {
    slug: 'sinal-como-funciona',
    kind: 'article',
    title: 'Como funciona o sinal antecipado',
    summary:
      'O cliente paga uma parte (de 10% a 100%) para reservar. Sem pagamento no prazo, o horário volta a ficar livre sozinho.',
    category: 'pagamentos',
    audience: 'owner',
    route: '/painel/politicas',
    related: ['sinal-pix', 'sinal-mercado-pago', 'aprovar-comprovante'],
    keywords: ['sinal', 'reserva', 'faltas', 'pagamento antecipado', 'porcentagem', 'prazo'],
    sections: [
      {
        body: 'Com "Recebe antecipado" ligado, cada reserva fica pendente até o sinal ser pago. Você escolhe a porcentagem (10% a 100%) e quanto tempo o horário fica segurado esperando.',
      },
      {
        body: 'PIX com comprovante: você confere e aprova. Mercado Pago: confirma sozinho e o dinheiro cai na sua conta.',
      },
      {
        body: 'O sinal é do plano Premium. Horário fixo semanal não aparece na página enquanto o sinal estiver ligado.',
      },
    ],
  },
  // ---------- Mensagens ----------
  {
    slug: 'avisos-canais',
    kind: 'article',
    title: 'Por onde chegam os avisos',
    summary:
      'Para você: sino do painel, som, notificação no celular, seu WhatsApp e e-mail. Para o cliente: WhatsApp (planos Profissional e Premium) e e-mail, se ele informou.',
    category: 'mensagens',
    audience: 'all',
    route: '/painel/notificacoes',
    related: ['avisos-whatsapp'],
    keywords: ['aviso', 'notificação', 'sino', 'push', 'e-mail', 'som', 'whatsapp'],
    sections: [
      {
        body: 'Em Notificações → "Avisos para você" você liga cada canal: no painel (sino), tocar um som, notificação no celular, no seu WhatsApp e por e-mail.',
      },
      {
        body: 'O cliente recebe confirmação, lembrete, remarcação e cancelamento pelo WhatsApp conectado (planos Profissional e Premium) e por e-mail quando informou um.',
      },
      {
        body: 'Para receber notificação no celular, ligue "Notificação no celular" e permita quando o navegador pedir. No iPhone, adicione o painel à tela inicial antes.',
      },
    ],
  },
  // ---------- Equipe e conta ----------
  {
    slug: 'planos',
    kind: 'article',
    title: 'Planos e teste grátis',
    summary:
      'Básico R$ 40, Profissional R$ 69 e Premium R$ 99 por mês. Nos 30 dias de teste, tudo do Premium fica liberado.',
    category: 'equipe-conta',
    audience: 'owner',
    route: '/painel/assinatura',
    keywords: ['plano', 'preço', 'assinatura', 'teste grátis', 'pagar', 'boleto', 'cartão', 'pix'],
    sections: [
      {
        heading: 'Básico — R$ 40/mês',
        body: '1 unidade e 1 profissional, página de agendamento, agenda, avisos no painel e no celular, clientes e relatórios.',
      },
      {
        heading: 'Profissional — R$ 69/mês',
        body: 'Até 3 unidades e 7 profissionais, aviso no seu WhatsApp e confirmação e lembrete no WhatsApp do cliente.',
      },
      {
        heading: 'Premium — R$ 99/mês',
        body: 'Unidades e profissionais ilimitados e sinal antecipado (Mercado Pago ou PIX com comprovante).',
      },
      {
        body: 'O pagamento é mensal por PIX, boleto ou cartão, em Assinatura. Dá para trocar de plano ou cancelar quando quiser.',
      },
    ],
  },
  {
    slug: 'meus-dados',
    kind: 'article',
    title: 'Baixar ou excluir os seus dados',
    summary: 'Em Minha conta → Seus dados (LGPD): "Baixar meus dados" ou excluir a conta.',
    category: 'equipe-conta',
    audience: 'all',
    route: '/painel/conta',
    keywords: ['excluir conta', 'meus dados', 'lgpd', 'baixar dados', 'apagar conta'],
    sections: [
      {
        body: 'Em Minha conta, no card "Seus dados (LGPD)", "Baixar meus dados" gera um arquivo com tudo o que está guardado. Excluir a conta apaga seus dados; se você for a única responsável, o estabelecimento também é excluído.',
      },
    ],
  },
  // ---------- FAQ ----------
  {
    slug: 'faq-app',
    kind: 'faq',
    title: 'O cliente precisa baixar aplicativo ou criar conta?',
    summary:
      'Não. Ele abre o link, escolhe o horário, informa nome e WhatsApp e pronto. Funciona em qualquer celular.',
    category: 'pagina-publica',
    audience: 'all',
    keywords: ['aplicativo', 'app', 'baixar', 'criar conta', 'cliente'],
    sections: [],
  },
  {
    slug: 'faq-whatsapp-manual',
    kind: 'faq',
    title: 'E se eu ainda marcar alguns clientes pelo WhatsApp?',
    summary:
      'Crie o agendamento manual pelo painel ("+ Novo" na Agenda). O horário sai da página na hora e não dá conflito.',
    category: 'agenda',
    audience: 'all',
    related: ['agendamento-manual'],
    keywords: ['whatsapp', 'manual', 'marcar por mensagem', 'conflito'],
    sections: [],
  },
  {
    slug: 'faq-duplicado',
    kind: 'faq',
    title: 'Dois clientes podem pegar o mesmo horário?',
    summary:
      'Não. O horário é travado no momento da reserva: se dois tentarem ao mesmo tempo, só um consegue e o outro escolhe outro horário.',
    category: 'agenda',
    audience: 'all',
    keywords: ['duplicado', 'mesmo horário', 'conflito', 'dois clientes'],
    sections: [],
  },
  {
    slug: 'faq-instalar',
    kind: 'faq',
    title: 'Dá para usar o painel como aplicativo no celular?',
    summary:
      'Sim. No navegador do celular, use "Adicionar à tela inicial". O painel abre como app e pode mandar notificações.',
    category: 'primeiros-passos',
    audience: 'all',
    keywords: ['instalar', 'app', 'tela inicial', 'pwa', 'celular'],
    sections: [],
  },
  {
    slug: 'faq-equipe-ve',
    kind: 'faq',
    title: 'O que a equipe consegue ver?',
    summary:
      'Quem entra com permissão de profissional vê só a própria agenda e os clientes que agendaram com ela. Configurações e relatórios são da dona.',
    category: 'equipe-conta',
    audience: 'owner',
    related: ['equipe'],
    keywords: ['permissão', 'equipe vê', 'acesso', 'profissional vê'],
    sections: [],
  },
  // ---------- Problemas comuns ----------
  {
    slug: 'problema-sem-horarios',
    kind: 'problem',
    title: 'Nenhum horário aparece na minha página',
    summary:
      'Confira o expediente em Horários, bloqueios e feriados, a antecedência mínima e se o profissional faz o serviço e está aceitando agendamentos.',
    category: 'problemas',
    audience: 'all',
    route: '/painel/horarios',
    related: ['configurar-expediente', 'regras-agendamento'],
    keywords: ['sem horário', 'não aparece horário', 'agenda vazia', 'nenhum horário'],
    sections: [
      {
        body: 'Em Horários, veja se o dia tem expediente e se não há um bloqueio cobrindo o período.',
      },
      {
        body: 'Em Regras e políticas, uma antecedência mínima grande esconde os horários mais próximos, e "Até quantos dias à frente" limita as datas.',
      },
      {
        body: 'Em Serviços, confira se o profissional está marcado em "Quem faz esse serviço?". Em Equipe, veja se ele está "Aceitando agendamentos".',
      },
      {
        body: 'O serviço precisa caber inteiro no expediente: um serviço de 2 horas não aparece às 17:30 se o expediente acaba às 18:00.',
      },
    ],
  },
  {
    slug: 'problema-whatsapp',
    kind: 'problem',
    title: 'As mensagens no WhatsApp pararam de sair',
    summary:
      'O WhatsApp pode ter desconectado. Em Notificações, conecte de novo lendo o QR Code com o celular.',
    category: 'problemas',
    audience: 'all',
    route: '/painel/notificacoes',
    related: ['avisos-whatsapp'],
    keywords: ['whatsapp não envia', 'mensagem não chega', 'desconectado', 'lembrete não chegou'],
    sections: [
      {
        body: 'Se o celular ficou muito tempo sem internet ou o WhatsApp foi desconectado dos aparelhos conectados, as mensagens param. Em Notificações, toque em "Conectar WhatsApp" e leia o QR Code de novo.',
      },
      {
        body: 'Confirmação e lembrete no WhatsApp do cliente são dos planos Profissional e Premium.',
      },
    ],
  },
  {
    slug: 'problema-email',
    kind: 'problem',
    title: 'Não recebo os avisos por e-mail',
    summary:
      'Veja se "Por e-mail" está ligado em Notificações e procure na caixa de spam. Marque o remetente como confiável.',
    category: 'problemas',
    audience: 'all',
    route: '/painel/notificacoes',
    keywords: ['e-mail não chega', 'spam', 'aviso por e-mail'],
    sections: [
      {
        body: 'Em Notificações → Avisos para você, ligue "Por e-mail". Os avisos vão para o e-mail da sua conta.',
      },
      { body: 'Procure na caixa de spam ou promoções e marque como "não é spam".' },
    ],
  },
  {
    slug: 'problema-mercado-pago',
    kind: 'problem',
    title: 'O Mercado Pago não conecta',
    summary:
      'Use o Access Token de produção (começa com APP_USR-), não a Public Key nem a credencial de teste. Copie sem espaços.',
    category: 'problemas',
    audience: 'owner',
    route: '/painel/politicas',
    related: ['sinal-mercado-pago'],
    keywords: ['mercado pago erro', 'access token', 'não conecta', 'public key'],
    sections: [
      {
        body: 'Na tela de credenciais do Mercado Pago aparecem a Public Key e o Access Token, os dois começando com APP_USR-. Só o Access Token funciona. Copie de novo, sem espaços no começo ou no fim.',
      },
    ],
  },
  {
    slug: 'problema-recebe-apagado',
    kind: 'problem',
    title: '"Recebe antecipado" está apagado',
    summary: 'O sinal antecipado é do plano Premium. Veja os planos em Assinatura.',
    category: 'problemas',
    audience: 'owner',
    route: '/painel/assinatura',
    keywords: ['recebe antecipado apagado', 'sinal bloqueado', 'premium'],
    sections: [],
  },
  {
    slug: 'problema-botao-sumiu',
    kind: 'problem',
    title: 'Não aparece o botão para cadastrar ou configurar',
    summary:
      'Cadastrar clientes, mexer em serviços, regras, aparência e equipe é só da dona da conta. Quem entra como equipe vê a própria agenda.',
    category: 'problemas',
    audience: 'all',
    keywords: ['botão não aparece', 'sem permissão', 'não consigo configurar', 'equipe'],
    sections: [],
  },
]

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug)
