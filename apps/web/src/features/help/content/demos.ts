import type { Demo } from '../types'

/**
 * Demonstrações animadas. Cada cena é um quadro desenhado em demo/scenes.tsx que imita a
 * tela real (página pública, painel, WhatsApp), com a legenda explicando o que acontece.
 */
export const DEMOS: Demo[] = [
  {
    id: 'demo:cliente-agenda',
    title: 'O cliente agendando pelo seu link',
    description: 'Do link na bio até o horário confirmado, em 4 toques.',
    category: 'pagina-publica',
    audience: 'all',
    tutorial: 'compartilhar-link',
    scenes: [
      {
        scene: 'public-services',
        caption: 'O cliente abre seu link e vê seus serviços, com preço e duração.',
        duration: 4200,
      },
      {
        scene: 'public-slots',
        caption:
          'Escolhe o dia e um dos horários livres. Ocupados e fora do expediente nem aparecem.',
        duration: 4200,
      },
      {
        scene: 'public-form',
        caption: 'Informa nome e WhatsApp e responde suas perguntas, se você criou alguma.',
        duration: 4000,
      },
      {
        scene: 'public-success',
        caption: 'Pronto: horário confirmado, com link para remarcar ou cancelar.',
        duration: 3800,
      },
    ],
  },
  {
    id: 'demo:aviso-painel',
    title: 'O agendamento chegando para você',
    description: 'Aviso no painel, na agenda e no celular.',
    category: 'agenda',
    audience: 'all',
    tutorial: 'avisos-whatsapp',
    scenes: [
      {
        scene: 'panel-toast',
        caption:
          'Assim que o cliente confirma, o aviso aparece no sino do painel (com som, se ligado).',
        duration: 4000,
      },
      {
        scene: 'panel-agenda',
        caption: 'O horário já entra na Agenda, com a cor do status.',
        duration: 4000,
      },
      {
        scene: 'panel-detail',
        caption:
          'Tocando nele, você vê o cliente, as respostas e as ações: confirmar, remarcar, cancelar.',
        duration: 4400,
      },
    ],
  },
  {
    id: 'demo:lembrete',
    title: 'Lembrete automático no WhatsApp',
    description: 'O cliente confirma presença com um toque.',
    category: 'mensagens',
    audience: 'all',
    tutorial: 'avisos-whatsapp',
    scenes: [
      {
        scene: 'wa-confirmation',
        caption: 'Logo depois de agendar, o cliente recebe a confirmação no WhatsApp.',
        duration: 4000,
      },
      {
        scene: 'wa-reminder',
        caption: 'Antes do horário (você escolhe quanto antes), chega o lembrete com o link.',
        duration: 4200,
      },
      {
        scene: 'wa-confirmed',
        caption: 'Ele toca em "confirmar presença" e você vê o ✅ no agendamento.',
        duration: 4000,
      },
    ],
  },
  {
    id: 'demo:sinal',
    title: 'Sinal pelo PIX com comprovante',
    description: 'O horário só confirma depois do pagamento.',
    category: 'pagamentos',
    audience: 'owner',
    tutorial: 'sinal-pix',
    scenes: [
      {
        scene: 'pay-pix',
        caption:
          'Ao reservar, o cliente vê o valor do sinal e a sua chave PIX (com QR Code e copia e cola).',
        duration: 4400,
      },
      {
        scene: 'pay-proof',
        caption: 'Ele paga no banco e anexa o comprovante ali mesmo, em foto ou PDF.',
        duration: 4000,
      },
      {
        scene: 'pay-approve',
        caption:
          'Você confere no extrato e toca em "Aprovar pagamento". O horário fica confirmado.',
        duration: 4400,
      },
    ],
  },
  {
    id: 'demo:horario-fixo',
    title: 'Horário fixo semanal',
    description: 'As próximas semanas reservadas sozinhas.',
    category: 'agenda',
    audience: 'all',
    tutorial: 'horario-fixo',
    scenes: [
      {
        scene: 'fixed-choose',
        caption: 'Ao agendar, o cliente marca "Quero esse horário fixo toda semana".',
        duration: 4000,
      },
      {
        scene: 'fixed-weeks',
        caption: 'As próximas semanas ficam reservadas. Semana com folga ou feriado é pulada.',
        duration: 4400,
      },
      {
        scene: 'fixed-renew',
        caption: 'A agenda renova sozinha, até alguém encerrar o horário fixo.',
        duration: 4000,
      },
    ],
  },
]

export const demoById = (id: string) => DEMOS.find((d) => d.id === id)
