import type { Tutorial } from '../types'

/**
 * Tutoriais passo a passo. Os nomes de botões, campos e menus são os mesmos do painel:
 * se um rótulo mudar na tela, mude aqui também.
 */
export const TUTORIALS: Tutorial[] = [
  {
    slug: 'compartilhar-link',
    kind: 'tutorial',
    title: 'Divulgar seu link de agendamento',
    description: 'Copie o link, coloque na bio do Instagram e imprima o QR Code para o balcão.',
    category: 'primeiros-passos',
    audience: 'all',
    route: '/painel',
    minutes: 2,
    guideId: 'guide:inicio',
    keywords: ['link', 'instagram', 'bio', 'qr code', 'divulgar', 'compartilhar', 'whatsapp'],
    steps: [
      {
        title: 'Abra o Início',
        body: 'No cartão "Seu link de agendamento" está o endereço da sua página. É por ele que os clientes agendam sozinhos.',
        ui: [{ kind: 'menu', path: ['Início'] }],
      },
      {
        title: 'Copie o link',
        body: 'Toque em "Copiar link" e cole na bio do Instagram, na mensagem automática do WhatsApp ou onde seus clientes te procuram.',
        ui: [{ kind: 'button', label: 'Copiar link' }],
      },
      {
        title: 'Compartilhe direto pelo celular',
        body: 'O botão de compartilhar abre a lista de apps do celular (WhatsApp, Instagram, e-mail) com o link já escrito.',
      },
      {
        title: 'Imprima o QR Code',
        body: 'O botão de QR Code mostra um código para imprimir e deixar no balcão. O cliente aponta a câmera do celular e já cai na sua página.',
      },
    ],
  },
  {
    slug: 'criar-servico',
    kind: 'tutorial',
    title: 'Cadastrar um serviço',
    description: 'Nome, duração, preço e o intervalo de limpeza depois do atendimento.',
    category: 'servicos-horarios',
    audience: 'owner',
    route: '/painel/servicos',
    minutes: 2,
    guideId: 'guide:servicos',
    keywords: ['serviço', 'preço', 'duração', 'categoria', 'cadastrar serviço', 'valor'],
    steps: [
      {
        title: 'Abra Serviços',
        body: 'Fica no menu, em Configurar. No celular, está na aba Mais.',
        ui: [{ kind: 'menu', path: ['Configurar', 'Serviços'] }],
      },
      {
        title: 'Toque em "Novo serviço"',
        body: 'O botão fica no topo da página.',
        ui: [{ kind: 'button', label: '+ Novo serviço' }],
      },
      {
        title: 'Preencha os dados',
        body: 'Nome, Duração (min) e Preço são o que o cliente vê. "Intervalo após (min)" é o tempo de limpeza ou preparo: ele bloqueia a agenda, mas não aparece para o cliente.',
        ui: [
          { kind: 'field', label: 'Nome do serviço', value: 'Sessão individual' },
          { kind: 'field', label: 'Duração (min)', value: '50' },
          { kind: 'field', label: 'Intervalo após (min)', value: '10' },
        ],
      },
      {
        title: 'Salve',
        body: 'O serviço aparece na hora na sua página de agendamento. Para mudar a ordem, arraste os serviços na lista.',
      },
    ],
  },
  {
    slug: 'configurar-expediente',
    kind: 'tutorial',
    title: 'Configurar os dias e horários de atendimento',
    description: 'Seu expediente semanal, com mais de um turno por dia.',
    category: 'servicos-horarios',
    audience: 'all',
    route: '/painel/horarios',
    minutes: 3,
    guideId: 'guide:horarios',
    keywords: ['expediente', 'horário de atendimento', 'turno', 'almoço', 'dias da semana'],
    steps: [
      {
        title: 'Abra Horários',
        body: 'Em Configurar → Horários. Quem tem equipe escolhe o profissional no topo da página.',
        ui: [{ kind: 'menu', path: ['Configurar', 'Horários'] }],
      },
      {
        title: 'Ajuste o Expediente semanal',
        body: 'Para cada dia, defina o horário de início e fim. Dá para ter mais de um turno no mesmo dia, por exemplo 08:00–12:00 e 13:30–19:00.',
      },
      {
        title: 'Cadastre as pausas fixas',
        body: 'Em "Pausas fixas", toque em "+ Pausa" para algo que se repete toda semana, como o almoço.',
        ui: [{ kind: 'button', label: '+ Pausa', variant: 'outline' }],
      },
      {
        title: 'Confira os feriados',
        body: 'No card "Feriados" ficam as datas em que a agenda fecha. Os feriados nacionais podem ser carregados sozinhos em Regras e políticas.',
      },
    ],
  },
  {
    slug: 'bloquear-horario',
    kind: 'tutorial',
    title: 'Bloquear uma folga, viagem ou consulta',
    description: 'Tire um período da agenda sem precisar mexer no expediente.',
    category: 'servicos-horarios',
    audience: 'all',
    route: '/painel/horarios',
    minutes: 1,
    keywords: ['bloquear', 'folga', 'férias', 'viagem', 'médico', 'fechar agenda'],
    steps: [
      {
        title: 'Pela página Horários',
        body: 'No card "Folgas e bloqueios", toque em "+ Bloquear", escolha de quando até quando e, se quiser, o motivo.',
        ui: [{ kind: 'button', label: '+ Bloquear', variant: 'outline' }],
      },
      {
        title: 'Ou direto pela Agenda',
        body: 'Na Agenda, toque em "+ Novo" e escolha a aba "Bloquear horário". Serve para um bloqueio rápido no mesmo dia.',
        ui: [{ kind: 'tab', labels: ['Agendamento', 'Bloquear horário'], active: 1 }],
      },
      {
        title: 'Pronto',
        body: 'O período some da página de agendamento. Agendamentos que já existiam nesse horário continuam marcados: remarque ou cancele se precisar.',
      },
    ],
  },
  {
    slug: 'agendamento-manual',
    kind: 'tutorial',
    title: 'Marcar um horário pelo painel',
    description: 'Para quem pediu por mensagem ou telefone.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agenda',
    minutes: 2,
    guideId: 'guide:agenda',
    keywords: ['agendar', 'agendamento manual', 'marcar', 'novo agendamento', 'encaixe'],
    steps: [
      {
        title: 'Toque em "+ Novo" na Agenda',
        body: 'Também dá para usar "Agendamento manual" no Início.',
        ui: [{ kind: 'button', label: '+ Novo' }],
      },
      {
        title: 'Escolha serviço, dia e horário',
        body: 'Os horários mostrados já respeitam seu expediente e os outros agendamentos.',
      },
      {
        title: 'Escolha o cliente',
        body: 'Busque pelo nome ou WhatsApp. Se for novo, toque em "Novo cliente" e informe nome e WhatsApp.',
      },
      {
        title: 'Repetir toda semana (opcional)',
        body: 'Para cliente fixo, ligue "Repetir toda semana (horário fixo)". As próximas semanas ficam reservadas e renovam sozinhas.',
        ui: [{ kind: 'switch', label: 'Repetir toda semana (horário fixo)', on: true }],
      },
      {
        title: 'Toque em "Agendar"',
        body: 'Se o aviso no WhatsApp estiver ligado, o cliente recebe a confirmação.',
        ui: [{ kind: 'button', label: 'Agendar' }],
      },
    ],
  },
  {
    slug: 'confirmar-pedido',
    kind: 'tutorial',
    title: 'Confirmar ou recusar um pedido',
    description: 'Quando a confirmação manual está ligada, cada agendamento chega como pendente.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agendamentos',
    minutes: 1,
    keywords: ['pendente', 'confirmar', 'recusar', 'aprovar pedido', 'confirmação manual'],
    steps: [
      {
        title: 'Abra o agendamento pendente',
        body: 'Ele aparece no Início, na Agenda e em Agendamentos com o status "Pendente".',
      },
      {
        title: 'Confirme',
        body: 'Toque em "Confirmar". O cliente recebe a confirmação e o lembrete é agendado.',
        ui: [{ kind: 'button', label: 'Confirmar' }],
      },
      {
        title: 'Ou recuse',
        body: 'Toque em "Cancelar", escreva o motivo se quiser e confirme. O horário volta a ficar livre e o cliente é avisado.',
      },
    ],
  },
  {
    slug: 'remarcar-cancelar',
    kind: 'tutorial',
    title: 'Remarcar ou cancelar um agendamento',
    description: 'Mudar dia, horário ou profissional, ou liberar o horário.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agenda',
    minutes: 1,
    keywords: ['remarcar', 'cancelar', 'mudar horário', 'trocar dia', 'arrastar'],
    steps: [
      {
        title: 'Abra o agendamento',
        body: 'Toque nele na Agenda ou em Agendamentos.',
      },
      {
        title: 'Remarcar',
        body: 'Toque em "Remarcar" e escolha o novo horário. Na visão de Dia ou Semana da Agenda também dá para arrastar o agendamento.',
        ui: [{ kind: 'button', label: 'Remarcar', variant: 'outline' }],
      },
      {
        title: 'Cancelar',
        body: 'Toque em "Cancelar". O horário volta a ficar livre e o cliente é avisado, se as mensagens estiverem ligadas.',
      },
    ],
  },
  {
    slug: 'concluir-faltas',
    kind: 'tutorial',
    title: 'Marcar atendimento concluído ou falta',
    description: 'Mantém os relatórios e o histórico do cliente certos.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/agendamentos',
    minutes: 1,
    keywords: ['concluir', 'faltou', 'falta', 'no show', 'atendido'],
    steps: [
      {
        title: 'Depois do horário começar',
        body: 'Abra o agendamento. Os botões "Concluir" e "Faltou" aparecem só a partir do horário marcado.',
        ui: [
          { kind: 'button', label: 'Concluir' },
          { kind: 'button', label: 'Faltou', variant: 'outline' },
        ],
      },
      {
        title: 'Errou?',
        body: 'Use "Na verdade, veio" ou "Na verdade, faltou" para corrigir.',
      },
    ],
  },
  {
    slug: 'horario-fixo',
    kind: 'tutorial',
    title: 'Horário fixo semanal (cliente fixo)',
    description: 'O mesmo dia e horário toda semana, para terapia, aulas e tratamentos.',
    category: 'agenda',
    audience: 'all',
    route: '/painel/politicas',
    minutes: 3,
    keywords: [
      'horário fixo',
      'recorrente',
      'toda semana',
      'cliente fixo',
      'terapia',
      'semanal',
      'repetir',
    ],
    steps: [
      {
        title: 'Ligue para os clientes',
        body: 'Em Regras e políticas, no card "Horário fixo semanal", ligue "Cliente pode reservar horário fixo" e escolha quantas semanas ficam reservadas à frente (4, 8 ou 12).',
        ui: [
          { kind: 'menu', path: ['Configurar', 'Regras e políticas'] },
          { kind: 'switch', label: 'Cliente pode reservar horário fixo', on: true },
        ],
      },
      {
        title: 'Como o cliente pede',
        body: 'Ao agendar, ele marca "Quero esse horário fixo toda semana". As próximas sessões ficam reservadas e a agenda renova sozinha.',
      },
      {
        title: 'Criar pelo painel',
        body: 'No agendamento manual, ligue "Repetir toda semana (horário fixo)". Funciona mesmo com a opção da página desligada.',
      },
      {
        title: 'Semanas que não couberam',
        body: 'Semana com folga, feriado ou horário ocupado é pulada. O cliente vê quais datas ficaram de fora.',
      },
      {
        title: 'Encerrar',
        body: 'No agendamento, toque em "Encerrar horário fixo": esta sessão e as próximas são canceladas, com um aviso só para o cliente. "Cancelar" desmarca só uma sessão.',
      },
    ],
  },
  {
    slug: 'cadastrar-cliente',
    kind: 'tutorial',
    title: 'Cadastrar e importar clientes',
    description: 'Um por um ou vários de uma vez pela planilha.',
    category: 'clientes',
    audience: 'owner',
    route: '/painel/clientes',
    minutes: 2,
    guideId: 'guide:clientes',
    keywords: ['cliente', 'cadastrar', 'importar', 'planilha', 'csv', 'excel', 'exportar'],
    steps: [
      {
        title: 'Não precisa cadastrar para começar',
        body: 'Quem agenda pelo link entra na lista sozinho. O WhatsApp evita criar a mesma pessoa duas vezes.',
      },
      {
        title: 'Cadastrar na mão',
        body: 'Em Clientes, toque em "+ Novo cliente". Nome e WhatsApp são obrigatórios; aniversário, e-mail, tags e observações privadas são opcionais.',
        ui: [{ kind: 'button', label: '+ Novo cliente' }],
      },
      {
        title: 'Importar planilha',
        body: 'Salve a planilha como CSV com as colunas nome, whatsapp, e-mail, tags e observações, e toque em "Importar". Quem já existe é atualizado sem apagar o que estava preenchido.',
        ui: [{ kind: 'button', label: 'Importar', variant: 'outline' }],
      },
      {
        title: 'Exportar',
        body: '"Exportar" baixa a lista inteira em CSV.',
      },
    ],
  },
  {
    slug: 'formulario',
    kind: 'tutorial',
    title: 'Fazer perguntas antes do atendimento',
    description: 'Perguntas extras no agendamento, com respostas chegando no aviso.',
    category: 'pagina-publica',
    audience: 'owner',
    route: '/painel/formulario',
    minutes: 2,
    keywords: ['formulário', 'pergunta', 'anamnese', 'foto de referência', 'perguntas sugeridas'],
    steps: [
      {
        title: 'Abra Formulário',
        body: 'Nome, WhatsApp e observações já são pedidos sempre. Aqui você acrescenta o que mais precisa saber.',
        ui: [{ kind: 'menu', path: ['Configurar', 'Formulário'] }],
      },
      {
        title: 'Use as perguntas sugeridas',
        body: 'Escolha sua área no quadro de perguntas sugeridas e toque em "Adicionar perguntas".',
        ui: [{ kind: 'button', label: 'Adicionar perguntas', variant: 'outline' }],
      },
      {
        title: 'Ou crie a sua',
        body: 'Toque em "+ Nova pergunta", escreva a pergunta e escolha o tipo de resposta: texto, seleção, sim/não ou foto de referência.',
        ui: [{ kind: 'button', label: '+ Nova pergunta' }],
      },
      {
        title: 'Confira como fica',
        body: '"Pré-visualizar" mostra o formulário como o cliente vê.',
      },
    ],
  },
  {
    slug: 'aparencia',
    kind: 'tutorial',
    title: 'Deixar a página com a cara do seu negócio',
    description: 'Logo, foto de capa, cor e informações de contato.',
    category: 'pagina-publica',
    audience: 'owner',
    route: '/painel/aparencia',
    minutes: 3,
    guideId: 'guide:aparencia',
    keywords: ['aparência', 'logo', 'capa', 'cor', 'foto', 'endereço', 'instagram'],
    steps: [
      {
        title: 'Envie logo e foto de capa',
        body: 'No card "Marca". Depois de enviar a capa, arraste a foto em "Enquadramento da capa" para escolher a parte que aparece e ajuste o zoom.',
      },
      {
        title: 'Escolha a cor principal',
        body: 'A cor vale só na sua página de agendamento e na área do cliente. Se ela ficar difícil de ler, o Marcaí ajusta o tom sozinho.',
      },
      {
        title: 'Preencha as informações',
        body: 'Bio curta, endereço, cidade, Instagram e WhatsApp do estabelecimento aparecem no topo da página.',
      },
      {
        title: 'Salve',
        body: 'A pré-visualização ao lado mostra o resultado antes de salvar.',
        ui: [{ kind: 'button', label: 'Salvar' }],
      },
    ],
  },
  {
    slug: 'regras-agendamento',
    kind: 'tutorial',
    title: 'Ajustar as regras para agendar e cancelar',
    description:
      'Antecedência, intervalo entre horários, confirmação manual e prazo de cancelamento.',
    category: 'pagina-publica',
    audience: 'owner',
    route: '/painel/politicas',
    minutes: 3,
    guideId: 'guide:politicas',
    keywords: [
      'regras',
      'antecedência',
      'cancelamento',
      'política',
      'confirmação manual',
      'intervalo',
    ],
    steps: [
      {
        title: 'Abra Regras e políticas',
        body: 'Fica em Configurar.',
        ui: [{ kind: 'menu', path: ['Configurar', 'Regras e políticas'] }],
      },
      {
        title: 'Agendamento online',
        body: 'Defina a antecedência mínima, até quantos dias à frente a agenda fica aberta, de quanto em quanto tempo os horários aparecem e se cada pedido precisa da sua confirmação.',
      },
      {
        title: 'Cancelamento e remarcação',
        body: 'Escolha até quantas horas antes o cliente pode cancelar ou remarcar sozinho pelo link, e escreva sua política.',
      },
      {
        title: 'Salve',
        body: 'Nada muda até tocar em "Salvar regras", no fim da página.',
        ui: [{ kind: 'button', label: 'Salvar regras' }],
      },
    ],
  },
  {
    slug: 'sinal-pix',
    kind: 'tutorial',
    title: 'Cobrar sinal pelo PIX com comprovante',
    description: 'O cliente paga parte do valor para reservar e envia o comprovante.',
    category: 'pagamentos',
    audience: 'owner',
    route: '/painel/politicas',
    minutes: 3,
    plan: 'Premium',
    keywords: ['sinal', 'pix', 'comprovante', 'pagamento antecipado', 'reserva', 'faltas'],
    steps: [
      {
        title: 'Ligue "Recebe antecipado"',
        body: 'Em Regras e políticas → Agendamento online.',
        ui: [{ kind: 'switch', label: 'Recebe antecipado', on: true }],
      },
      {
        title: 'Defina quanto',
        body: 'Em "Quanto o cliente paga antes", use 30%, 50%, Valor total ou digite qualquer número de 10% a 100%.',
      },
      {
        title: 'Escolha PIX com comprovante',
        body: 'Em "Como você recebe". Informe a chave PIX e o nome de quem recebe, igual ao da conta no banco. Chave de celular vai com +55 e DDD.',
      },
      {
        title: 'Salve as regras',
        body: 'A partir daí, cada reserva fica pendente até você aprovar o comprovante.',
        ui: [{ kind: 'button', label: 'Salvar regras' }],
      },
    ],
  },
  {
    slug: 'sinal-mercado-pago',
    kind: 'tutorial',
    title: 'Receber o sinal pelo Mercado Pago',
    description: 'O pagamento confirma o horário sozinho.',
    category: 'pagamentos',
    audience: 'owner',
    route: '/painel/politicas',
    minutes: 4,
    plan: 'Premium',
    keywords: ['mercado pago', 'access token', 'pagamento automático', 'cartão', 'sinal'],
    steps: [
      {
        title: 'Copie o Access Token',
        body: 'No Mercado Pago: Configurações → Negócios → Integrações → Suas integrações → Credenciais de produção. Copie o Access Token (começa com APP_USR-). Não use a Public Key.',
      },
      {
        title: 'Conecte no Marcaí',
        body: 'Em Regras e políticas, com "Recebe antecipado" ligado, escolha Mercado Pago em "Como você recebe", cole o código e toque em "Conectar".',
      },
      {
        title: 'Salve as regras',
        body: 'Quando aparecer "Mercado Pago conectado" com o nome da sua conta, toque em "Salvar regras".',
        ui: [{ kind: 'button', label: 'Salvar regras' }],
      },
      {
        title: 'Guarde o código como senha',
        body: 'Quem tem o Access Token consegue cobrar em nome da sua conta. Se achar que vazou, gere outro no Mercado Pago e conecte de novo.',
      },
    ],
  },
  {
    slug: 'aprovar-comprovante',
    kind: 'tutorial',
    title: 'Aprovar o comprovante do PIX',
    description: 'Confira no banco e confirme o horário.',
    category: 'pagamentos',
    audience: 'all',
    route: '/painel/agendamentos',
    minutes: 1,
    plan: 'Premium',
    keywords: ['comprovante', 'aprovar pagamento', 'recusar comprovante', 'pix'],
    steps: [
      {
        title: 'Abra o agendamento',
        body: 'Você recebe um aviso quando o cliente envia o comprovante (foto ou PDF).',
      },
      {
        title: 'Confira no seu banco',
        body: 'Abra o comprovante e veja no extrato se o valor entrou mesmo. Comprovante pode ser editado.',
      },
      {
        title: 'Aprove ou recuse',
        body: '"Aprovar pagamento" confirma o horário. "Recusar" libera o horário e avisa o cliente com o motivo.',
        ui: [{ kind: 'button', label: 'Aprovar pagamento' }],
      },
    ],
  },
  {
    slug: 'avisos-whatsapp',
    kind: 'tutorial',
    title: 'Ligar os avisos e o WhatsApp',
    description: 'Avisos para você e confirmação e lembrete para o cliente.',
    category: 'mensagens',
    audience: 'all',
    route: '/painel/notificacoes',
    minutes: 3,
    plan: 'Profissional',
    keywords: ['whatsapp', 'lembrete', 'notificação', 'aviso', 'mensagem', 'qr code', 'conectar'],
    steps: [
      {
        title: 'Escolha como você é avisado',
        body: 'Em Notificações → "Avisos para você": no painel (sino), som, notificação no celular, no seu WhatsApp e por e-mail.',
      },
      {
        title: 'Conecte o WhatsApp',
        body: 'As mensagens para clientes saem do seu número. Conecte lendo o QR Code com o WhatsApp do celular, como no WhatsApp Web.',
      },
      {
        title: 'Ligue confirmação e lembrete',
        body: 'Em "Mensagens para o cliente", ligue "Confirmação e lembrete no WhatsApp". O tempo do lembrete fica em Regras e políticas.',
        ui: [{ kind: 'switch', label: 'Confirmação e lembrete no WhatsApp', on: true }],
      },
      {
        title: 'Ajuste os textos',
        body: 'Em "Textos das mensagens" dá para editar cada mensagem. As palavras entre chaves, como {cliente}, viram os dados do agendamento.',
      },
    ],
  },
  {
    slug: 'equipe',
    kind: 'tutorial',
    title: 'Adicionar profissionais e dar acesso',
    description: 'Cada profissional com a própria agenda, serviços e expediente.',
    category: 'equipe-conta',
    audience: 'owner',
    route: '/painel/equipe',
    minutes: 2,
    keywords: ['equipe', 'profissional', 'funcionário', 'convidar', 'acesso', 'permissão'],
    steps: [
      {
        title: 'Crie a agenda do profissional',
        body: 'Em Equipe, toque em "+ Profissional". Com mais de um, o cliente escolhe com quem quer agendar.',
        ui: [{ kind: 'button', label: '+ Profissional' }],
      },
      {
        title: 'Dê acesso ao painel (opcional)',
        body: 'Toque em "Dar acesso ao painel", informe o e-mail e a permissão. A pessoa recebe um convite e, como equipe, vê só a própria agenda.',
        ui: [{ kind: 'button', label: 'Dar acesso ao painel', variant: 'outline' }],
      },
      {
        title: 'Ajuste serviços e horários dele',
        body: 'Em Serviços, abra cada serviço e marque em "Quem faz esse serviço?". Em Horários, escolha o profissional no topo para montar o expediente.',
      },
    ],
  },
]

export const tutorialBySlug = (slug: string) => TUTORIALS.find((t) => t.slug === slug)
