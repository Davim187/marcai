/**
 * Tipos da central de ajuda. O conteúdo (artigos, tutoriais, tours, demonstrações e dicas)
 * vive em `content/` como dados; os componentes só sabem exibir esses tipos.
 */

/** Quem vê: a dona/gestão (owner) ou também a equipe. */
export type Audience = 'all' | 'owner'

export type HelpCategoryId =
  | 'primeiros-passos'
  | 'agenda'
  | 'clientes'
  | 'servicos-horarios'
  | 'pagamentos'
  | 'mensagens'
  | 'pagina-publica'
  | 'equipe-conta'
  | 'problemas'

export interface HelpCategory {
  id: HelpCategoryId
  title: string
  description: string
}

/** Elemento de interface desenhado nas ilustrações (imita o botão/campo real do painel). */
export type UiChip =
  | { kind: 'button'; label: string; variant?: 'primary' | 'outline' }
  | { kind: 'menu'; path: string[] }
  | { kind: 'switch'; label: string; on?: boolean }
  | { kind: 'field'; label: string; value?: string }
  | { kind: 'tab'; labels: string[]; active: number }

export interface TutorialStep {
  title: string
  body: string
  /** Desenho do que procurar na tela nesta etapa */
  ui?: UiChip[]
}

export interface Tutorial {
  slug: string
  kind: 'tutorial'
  title: string
  description: string
  category: HelpCategoryId
  audience: Audience
  /** Página onde a tarefa é feita */
  route: string
  /** Minutos estimados */
  minutes: number
  steps: TutorialStep[]
  /** Guia interativo que mostra a mesma tarefa na tela de verdade */
  guideId?: string
  /** Plano necessário, quando o recurso não está em todos */
  plan?: 'Profissional' | 'Premium'
  keywords: string[]
}

export interface ArticleSection {
  heading?: string
  body: string
}

export interface Article {
  slug: string
  kind: 'article' | 'faq' | 'problem'
  title: string
  /** Resposta curta (aparece na busca e no assistente) */
  summary: string
  category: HelpCategoryId
  audience: Audience
  sections: ArticleSection[]
  /** Página relacionada, para o botão "Abrir no painel" */
  route?: string
  related?: string[]
  keywords: string[]
}

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourStep {
  /** Valor de `data-tour` do elemento destacado; sem alvo, o balão aparece centralizado */
  target?: string
  /** Página onde a etapa acontece (o tour navega até ela) */
  route?: string
  title: string
  body: string
  placement?: TourPlacement
  audience?: Audience
}

export interface Tour {
  /** "tour:sistema" ou "guide:agenda" */
  id: string
  kind: 'tour' | 'guide'
  title: string
  description: string
  /** Página do guia interativo (o botão "Guia desta página" usa isso) */
  route?: string
  audience: Audience
  steps: TourStep[]
}

export interface DemoScene {
  /** Qual quadro animado mostrar (ver demo/scenes.tsx) */
  scene: string
  caption: string
  /** Duração em ms */
  duration: number
}

export interface Demo {
  /** "demo:link" */
  id: string
  title: string
  description: string
  category: HelpCategoryId
  audience: Audience
  scenes: DemoScene[]
  tutorial?: string
}

export interface Hint {
  title: string
  body: string
  /** Artigo ou tutorial para "Saiba mais" */
  more?: string
}

export interface BeginnerTip {
  /** Rota exata do painel */
  route: string
  title: string
  body: string
  /** Guia interativo da página */
  guideId?: string
  tutorial?: string
}
