import { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface HelpUi {
  assistantOpen: boolean
  /** Abre o assistente; `ask` já envia uma pergunta */
  openAssistant: (ask?: string) => void
  closeAssistant: () => void
  pendingQuestion: string | null
  consumeQuestion: () => void
  demoId: string | null
  openDemo: (id: string) => void
  closeDemo: () => void
}

const Ctx = createContext<HelpUi | null>(null)

export function useHelpUi() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useHelpUi fora do HelpUiProvider')
  return c
}

/** O que está aberto na camada de ajuda (assistente e demonstração), compartilhado entre as telas. */
export function HelpUiProvider({ children }: { children: React.ReactNode }) {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [pendingQuestion, setPending] = useState<string | null>(null)
  const [demoId, setDemoId] = useState<string | null>(null)

  const openAssistant = useCallback((ask?: string) => {
    if (ask) setPending(ask)
    setAssistantOpen(true)
  }, [])

  const value = useMemo<HelpUi>(
    () => ({
      assistantOpen,
      openAssistant,
      closeAssistant: () => setAssistantOpen(false),
      pendingQuestion,
      consumeQuestion: () => setPending(null),
      demoId,
      openDemo: setDemoId,
      closeDemo: () => setDemoId(null),
    }),
    [assistantOpen, openAssistant, pendingQuestion, demoId],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
