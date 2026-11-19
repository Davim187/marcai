export const BUSINESS_GROUPS = [
  { id: 'beleza', label: 'Beleza' },
  { id: 'saude', label: 'Saúde, terapia e bem-estar' },
  { id: 'geral', label: 'Outras áreas' },
] as const
export type BusinessGroup = (typeof BUSINESS_GROUPS)[number]['id']

export const BUSINESS_TYPES = [
  { id: 'manicure', label: 'Manicure e nail design', emoji: '💅', group: 'beleza' },
  { id: 'cabelo', label: 'Cabelo', emoji: '💇‍♀️', group: 'beleza' },
  { id: 'cilios', label: 'Cílios', emoji: '👁️', group: 'beleza' },
  { id: 'sobrancelha', label: 'Sobrancelha', emoji: '✨', group: 'beleza' },
  { id: 'barbearia', label: 'Barbearia', emoji: '💈', group: 'beleza' },
  { id: 'estetica', label: 'Estética', emoji: '🌸', group: 'beleza' },
  { id: 'psicologia', label: 'Psicologia e terapia', emoji: '🧠', group: 'saude' },
  { id: 'massoterapia', label: 'Massoterapia', emoji: '💆', group: 'saude' },
  { id: 'fisioterapia', label: 'Fisioterapia e pilates', emoji: '🧘', group: 'saude' },
  { id: 'nutricao', label: 'Nutrição', emoji: '🥗', group: 'saude' },
  {
    id: 'terapias_integrativas',
    label: 'Acupuntura e terapias integrativas',
    emoji: '🌿',
    group: 'saude',
  },
  { id: 'outro', label: 'Outro', emoji: '📅', group: 'geral' },
] as const satisfies readonly { id: string; label: string; emoji: string; group: BusinessGroup }[]
export type BusinessType = (typeof BUSINESS_TYPES)[number]['id']

export const FORM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'yes_no',
  'photo',
] as const
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  single_select: 'Seleção única',
  multi_select: 'Múltipla escolha',
  yes_no: 'Sim/Não',
  photo: 'Foto de referência',
}

export interface PresetService {
  name: string
  description: string
  durationMinutes: number
  priceCents: number
  priceFrom?: boolean
  bufferMinutes?: number
}
export interface PresetCategory {
  name: string
  services: PresetService[]
}
export interface PresetField {
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
  helpText?: string
}
export interface BusinessPreset {
  categories: PresetCategory[]
  fields: PresetField[]
}

export const MANICURE_FIELDS: PresetField[] = [
  {
    label: 'Tipo de unha',
    type: 'single_select',
    required: false,
    options: ['Quadrada', 'Redonda', 'Amendoada', 'Bailarina', 'Stiletto'],
  },
  { label: 'É manutenção?', type: 'yes_no', required: false },
  { label: 'Quer decoração?', type: 'yes_no', required: false },
  {
    label: 'Foto de referência',
    type: 'photo',
    required: false,
    helpText: 'Mande uma foto do modelo que você quer.',
  },
]

export const PRESETS: Record<BusinessType, BusinessPreset> = {
  manicure: {
    categories: [
      {
        name: 'Mãos',
        services: [
          {
            name: 'Manicure simples',
            description: 'Cutilagem, lixamento e esmaltação tradicional.',
            durationMinutes: 45,
            priceCents: 3000,
          },
          {
            name: 'Esmaltação em gel',
            description: 'Esmaltação em gel com duração de até 3 semanas.',
            durationMinutes: 60,
            priceCents: 6000,
          },
        ],
      },
      {
        name: 'Pés',
        services: [
          {
            name: 'Pedicure',
            description: 'Cutilagem, lixamento e esmaltação dos pés.',
            durationMinutes: 50,
            priceCents: 3500,
          },
          {
            name: 'Spa dos pés',
            description: 'Esfoliação, hidratação profunda e massagem relaxante.',
            durationMinutes: 60,
            priceCents: 7000,
          },
        ],
      },
      {
        name: 'Alongamento',
        services: [
          {
            name: 'Alongamento em gel',
            description: 'Alongamento com molde F1 ou tips, acabamento em gel.',
            durationMinutes: 120,
            priceCents: 12000,
            priceFrom: true,
            bufferMinutes: 10,
          },
          {
            name: 'Manutenção de alongamento',
            description: 'Manutenção do alongamento em gel (até 21 dias).',
            durationMinutes: 90,
            priceCents: 8000,
          },
        ],
      },
    ],
    fields: MANICURE_FIELDS,
  },
  cabelo: {
    categories: [
      {
        name: 'Corte',
        services: [
          {
            name: 'Corte feminino',
            description: 'Corte com lavagem e finalização.',
            durationMinutes: 60,
            priceCents: 8000,
          },
          {
            name: 'Escova',
            description: 'Escova modelada.',
            durationMinutes: 45,
            priceCents: 5000,
            priceFrom: true,
          },
        ],
      },
      {
        name: 'Química',
        services: [
          {
            name: 'Coloração',
            description: 'Coloração completa da raiz às pontas.',
            durationMinutes: 120,
            priceCents: 15000,
            priceFrom: true,
          },
          {
            name: 'Hidratação',
            description: 'Tratamento de hidratação profunda.',
            durationMinutes: 60,
            priceCents: 7000,
          },
        ],
      },
    ],
    fields: [
      {
        label: 'Comprimento do cabelo',
        type: 'single_select',
        required: false,
        options: ['Curto', 'Médio', 'Longo'],
      },
      { label: 'Fez química nos últimos 3 meses?', type: 'yes_no', required: false },
      { label: 'Foto de referência', type: 'photo', required: false },
    ],
  },
  cilios: {
    categories: [
      {
        name: 'Extensão de cílios',
        services: [
          {
            name: 'Fio a fio',
            description: 'Extensão clássica, efeito natural.',
            durationMinutes: 120,
            priceCents: 15000,
          },
          {
            name: 'Volume brasileiro',
            description: 'Mais volume com fios em Y.',
            durationMinutes: 150,
            priceCents: 18000,
          },
          {
            name: 'Manutenção',
            description: 'Manutenção de até 20 dias.',
            durationMinutes: 90,
            priceCents: 9000,
          },
        ],
      },
      {
        name: 'Tratamentos',
        services: [
          {
            name: 'Lash lifting',
            description: 'Curvatura natural dos seus cílios.',
            durationMinutes: 60,
            priceCents: 12000,
          },
        ],
      },
    ],
    fields: [
      { label: 'Tem alergia a algum produto?', type: 'yes_no', required: true },
      {
        label: 'Efeito desejado',
        type: 'single_select',
        required: false,
        options: ['Natural', 'Boneca', 'Gatinho', 'Volume'],
      },
      { label: 'Foto de referência', type: 'photo', required: false },
    ],
  },
  sobrancelha: {
    categories: [
      {
        name: 'Sobrancelha',
        services: [
          {
            name: 'Design de sobrancelha',
            description: 'Design com pinça e linha.',
            durationMinutes: 30,
            priceCents: 3500,
          },
          {
            name: 'Design com henna',
            description: 'Design com aplicação de henna.',
            durationMinutes: 45,
            priceCents: 5000,
          },
          {
            name: 'Brow lamination',
            description: 'Fios alinhados e penteados por semanas.',
            durationMinutes: 60,
            priceCents: 12000,
          },
        ],
      },
    ],
    fields: [
      { label: 'Primeira vez com a gente?', type: 'yes_no', required: false },
      { label: 'Foto de referência', type: 'photo', required: false },
    ],
  },
  barbearia: {
    categories: [
      {
        name: 'Cabelo',
        services: [
          {
            name: 'Corte masculino',
            description: 'Corte na máquina e tesoura.',
            durationMinutes: 40,
            priceCents: 4000,
          },
          {
            name: 'Corte + barba',
            description: 'Combo completo.',
            durationMinutes: 60,
            priceCents: 6500,
          },
        ],
      },
      {
        name: 'Barba',
        services: [
          {
            name: 'Barba',
            description: 'Barba com toalha quente.',
            durationMinutes: 30,
            priceCents: 3500,
          },
        ],
      },
    ],
    fields: [{ label: 'Estilo de corte', type: 'short_text', required: false }],
  },
  estetica: {
    categories: [
      {
        name: 'Facial',
        services: [
          {
            name: 'Limpeza de pele',
            description: 'Limpeza profunda com extração.',
            durationMinutes: 90,
            priceCents: 15000,
          },
          {
            name: 'Peeling',
            description: 'Renovação celular.',
            durationMinutes: 60,
            priceCents: 18000,
            priceFrom: true,
          },
        ],
      },
      {
        name: 'Corporal',
        services: [
          {
            name: 'Drenagem linfática',
            description: 'Sessão de drenagem linfática manual.',
            durationMinutes: 60,
            priceCents: 12000,
          },
        ],
      },
    ],
    fields: [
      { label: 'Está grávida ou amamentando?', type: 'yes_no', required: true },
      { label: 'Tem alguma alergia?', type: 'short_text', required: false },
    ],
  },
  psicologia: {
    categories: [
      {
        name: 'Sessões',
        services: [
          {
            name: 'Primeira sessão',
            description: 'Conversa inicial para entender a demanda e combinar o acompanhamento.',
            durationMinutes: 50,
            priceCents: 15000,
            bufferMinutes: 10,
          },
          {
            name: 'Sessão individual',
            description: 'Sessão de psicoterapia individual.',
            durationMinutes: 50,
            priceCents: 15000,
            bufferMinutes: 10,
          },
          {
            name: 'Sessão online',
            description: 'Sessão por videochamada. O link chega antes do horário.',
            durationMinutes: 50,
            priceCents: 15000,
            bufferMinutes: 10,
          },
          {
            name: 'Terapia de casal',
            description: 'Sessão com o casal.',
            durationMinutes: 80,
            priceCents: 25000,
            bufferMinutes: 10,
          },
        ],
      },
    ],
    fields: [
      {
        label: 'Como prefere ser atendido?',
        type: 'single_select',
        required: true,
        options: ['Presencial', 'Online'],
      },
      { label: 'É a sua primeira sessão comigo?', type: 'yes_no', required: false },
    ],
  },
  massoterapia: {
    categories: [
      {
        name: 'Massagens',
        services: [
          {
            name: 'Massagem relaxante',
            description: 'Massagem corporal com movimentos suaves para aliviar o estresse.',
            durationMinutes: 60,
            priceCents: 12000,
            bufferMinutes: 10,
          },
          {
            name: 'Massagem terapêutica',
            description: 'Foco em tensões e dores musculares.',
            durationMinutes: 60,
            priceCents: 14000,
            bufferMinutes: 10,
          },
          {
            name: 'Pedras quentes',
            description: 'Massagem com pedras aquecidas.',
            durationMinutes: 75,
            priceCents: 16000,
            bufferMinutes: 15,
          },
          {
            name: 'Quick massage',
            description: 'Massagem rápida na cadeira, para costas, ombros e pescoço.',
            durationMinutes: 20,
            priceCents: 5000,
          },
        ],
      },
    ],
    fields: [
      { label: 'Tem alguma região que pede mais atenção?', type: 'short_text', required: false },
      {
        label: 'Pressão preferida',
        type: 'single_select',
        required: false,
        options: ['Leve', 'Média', 'Forte'],
      },
      { label: 'Está grávida?', type: 'yes_no', required: false },
    ],
  },
  fisioterapia: {
    categories: [
      {
        name: 'Fisioterapia',
        services: [
          {
            name: 'Avaliação',
            description: 'Primeira consulta para avaliar e montar o plano de tratamento.',
            durationMinutes: 60,
            priceCents: 15000,
          },
          {
            name: 'Sessão de fisioterapia',
            description: 'Sessão do tratamento em andamento.',
            durationMinutes: 50,
            priceCents: 12000,
          },
          {
            name: 'RPG',
            description: 'Reeducação postural global.',
            durationMinutes: 50,
            priceCents: 13000,
          },
        ],
      },
      {
        name: 'Pilates',
        services: [
          {
            name: 'Aula experimental de pilates',
            description: 'Primeira aula para conhecer o método.',
            durationMinutes: 50,
            priceCents: 5000,
          },
          {
            name: 'Pilates individual',
            description: 'Aula individual nos aparelhos.',
            durationMinutes: 50,
            priceCents: 10000,
          },
        ],
      },
    ],
    fields: [
      { label: 'É a sua primeira vez aqui?', type: 'yes_no', required: false },
      {
        label: 'Tem pedido médico?',
        type: 'yes_no',
        required: false,
        helpText: 'Se tiver, traga no dia da avaliação.',
      },
    ],
  },
  nutricao: {
    categories: [
      {
        name: 'Consultas',
        services: [
          {
            name: 'Primeira consulta',
            description: 'Avaliação completa e montagem do plano alimentar.',
            durationMinutes: 60,
            priceCents: 25000,
          },
          {
            name: 'Retorno',
            description: 'Acompanhamento e ajuste do plano.',
            durationMinutes: 40,
            priceCents: 15000,
          },
          {
            name: 'Consulta online',
            description: 'Consulta por videochamada. O link chega antes do horário.',
            durationMinutes: 60,
            priceCents: 22000,
          },
        ],
      },
    ],
    fields: [
      {
        label: 'Como prefere ser atendido?',
        type: 'single_select',
        required: true,
        options: ['Presencial', 'Online'],
      },
      {
        label: 'Objetivo principal',
        type: 'single_select',
        required: false,
        options: [
          'Emagrecimento',
          'Ganho de massa',
          'Saúde e qualidade de vida',
          'Esporte',
          'Outro',
        ],
      },
    ],
  },
  terapias_integrativas: {
    categories: [
      {
        name: 'Terapias',
        services: [
          {
            name: 'Acupuntura',
            description: 'Sessão de acupuntura sistêmica.',
            durationMinutes: 50,
            priceCents: 13000,
            bufferMinutes: 10,
          },
          {
            name: 'Auriculoterapia',
            description: 'Estímulo de pontos na orelha com sementes ou agulhas.',
            durationMinutes: 30,
            priceCents: 7000,
          },
          {
            name: 'Reiki',
            description: 'Sessão de reiki.',
            durationMinutes: 50,
            priceCents: 10000,
            bufferMinutes: 10,
          },
          {
            name: 'Ventosaterapia',
            description: 'Sessão de ventosas.',
            durationMinutes: 40,
            priceCents: 9000,
          },
        ],
      },
    ],
    fields: [
      { label: 'É a sua primeira sessão?', type: 'yes_no', required: false },
      { label: 'Está grávida?', type: 'yes_no', required: false },
    ],
  },
  outro: {
    categories: [
      {
        name: 'Serviços',
        services: [
          {
            name: 'Atendimento',
            description: 'Atendimento padrão.',
            durationMinutes: 60,
            priceCents: 10000,
          },
        ],
      },
    ],
    fields: [],
  },
}
