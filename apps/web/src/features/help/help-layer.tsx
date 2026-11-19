import { AssistantWidget } from './assistant/assistant-widget'
import { WelcomeDialog } from './components/welcome-dialog'
import { DemoDialog } from './demo/demo-dialog'
import { HelpUiProvider } from './help-ui'
import { TourProvider } from './tour/tour-context'

/**
 * Camada de ajuda do painel: tours, boas-vindas, demonstrações e assistente. Fica em volta
 * do layout do painel, então vale em todas as páginas internas.
 */
export function HelpLayer({ children }: { children: React.ReactNode }) {
  return (
    <HelpUiProvider>
      <TourProvider>
        {children}
        <WelcomeDialog />
        <DemoDialog />
        <AssistantWidget />
      </TourProvider>
    </HelpUiProvider>
  )
}

export { BeginnerTip } from './components/beginner-tip'
export { HelpHint } from './components/help-hint'
export { HelpMenu } from './components/help-menu'
