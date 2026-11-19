import { normalize, searchHelp, tourById, type HelpEntry } from '../content'

/** Ação que a resposta oferece: abrir um artigo, mostrar um guia na tela, ir até a página… */
export type AssistantAction =
  | { type: 'link'; label: string; href: string }
  | { type: 'guide'; label: string; tourId: string }
  | { type: 'demo'; label: string; demoId: string }

export interface AssistantReply {
  text: string
  /** Passos curtos, quando a resposta é um tutorial */
  steps?: string[]
  actions: AssistantAction[]
  /** Outros conteúdos que também podem ajudar */
  related: Array<{ label: string; ask: string }>
  /** De onde veio a resposta (a interface mostra isso para não parecer o que não é) */
  source: 'central' | 'ia'
  found: boolean
}

export interface AssistantContext {
  role: string
  pathname: string
}

/**
 * Contrato de quem responde. Hoje só existe o provedor de conteúdo (busca na central de
 * ajuda). Para ligar uma IA no futuro: criar um provedor que chame um endpoint da API
 * (ex.: POST /api/help/assistant, com a chave do modelo só no servidor), devolver
 * `source: 'ia'` e registrá-lo em PROVIDERS abaixo. A interface do chat não muda.
 */
export interface AssistantProvider {
  id: string
  answer(question: string, ctx: AssistantContext): Promise<AssistantReply>
}

function actionsFor(e: HelpEntry): AssistantAction[] {
  switch (e.type) {
    case 'tutorial': {
      const acts: AssistantAction[] = [
        { type: 'link', label: 'Ver o passo a passo', href: `/painel/ajuda/${e.item.slug}` },
      ]
      if (e.item.guideId && tourById(e.item.guideId))
        acts.push({ type: 'guide', label: 'Mostrar na tela', tourId: e.item.guideId })
      else acts.push({ type: 'link', label: 'Ir para a página', href: e.item.route })
      return acts
    }
    case 'article': {
      const acts: AssistantAction[] = []
      if (e.item.kind === 'article' || e.item.sections.length)
        acts.push({ type: 'link', label: 'Ler o artigo', href: `/painel/ajuda/${e.item.slug}` })
      if (e.item.route) acts.push({ type: 'link', label: 'Ir para a página', href: e.item.route })
      return acts
    }
    case 'tour':
      return [
        {
          type: 'guide',
          label: e.item.kind === 'tour' ? 'Começar o tour' : 'Mostrar na tela',
          tourId: e.item.id,
        },
      ]
    case 'demo':
      return [{ type: 'demo', label: 'Assistir à demonstração', demoId: e.item.id }]
  }
}

function textFor(e: HelpEntry): Pick<AssistantReply, 'text' | 'steps'> {
  switch (e.type) {
    case 'tutorial':
      return {
        text: `${e.item.title}: ${e.item.description}`,
        steps: e.item.steps.map((s) => `${s.title}. ${s.body}`),
      }
    case 'article':
      return { text: e.item.summary }
    case 'tour':
    case 'demo':
      return { text: `${e.item.title}: ${e.item.description}` }
  }
}

const GREETING = /^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey|opa)\b/
const THANKS = /^(obrigad|valeu|brigad|show|perfeito|otimo)/

/** Responde com o conteúdo da central de ajuda (sem IA): procura e explica o melhor resultado. */
export const contentProvider: AssistantProvider = {
  id: 'central',
  async answer(question, ctx) {
    const q = normalize(question).trim()
    const base = { actions: [], related: [], source: 'central' as const }
    if (THANKS.test(q))
      return {
        ...base,
        text: 'Por nada! Se precisar de mais alguma coisa, é só perguntar.',
        found: true,
      }
    if (GREETING.test(q) && q.split(/\s+/).length <= 3)
      return {
        ...base,
        text: 'Oi! Pergunte sobre qualquer parte do painel: agenda, clientes, serviços, horários, sinal, WhatsApp… Eu procuro na central de ajuda e te mostro o caminho.',
        found: true,
      }

    const hits = searchHelp(question, ctx.role, 4)
    if (!hits.length)
      return {
        ...base,
        text: 'Não encontrei nada sobre isso na central de ajuda. Tente com outras palavras (ex.: "bloquear folga", "cobrar sinal", "lembrete no WhatsApp") ou abra a central para ver todos os assuntos.',
        actions: [{ type: 'link', label: 'Abrir a central de ajuda', href: '/painel/ajuda' }],
        found: false,
      }
    const [top, ...rest] = hits
    return {
      ...base,
      ...textFor(top!.entry),
      actions: actionsFor(top!.entry),
      related: rest
        .slice(0, 3)
        .map((h) => ({ label: h.entry.item.title, ask: h.entry.item.title })),
      found: true,
    }
  },
}

const PROVIDERS: Record<string, AssistantProvider> = { [contentProvider.id]: contentProvider }

/** Provedor ativo. Hoje sempre o da central; um provedor de IA entra aqui quando existir. */
export function getAssistantProvider(): AssistantProvider {
  return PROVIDERS.central!
}
