import { Compass, GraduationCap, LifeBuoy } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTenant } from '@/lib/session'
import { useHelpActions, useHelpState } from '../state/help-state'
import { useTour } from '../tour/tour-context'

/**
 * Boas-vindas na primeira vez no painel: oferece o tour e o modo iniciante. Qualquer
 * escolha (inclusive fechar) marca como vista, e ela não volta mais.
 */
export function WelcomeDialog() {
  const { user, impersonating } = useTenant()
  const { data } = useHelpState()
  const { markIntroSeen, setBeginnerMode } = useHelpActions()
  const { start } = useTour()
  const navigate = useNavigate()
  const [beginner, setBeginner] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  // No modo suporte o admin vê o painel de outra pessoa: nunca mostra a boas-vindas dela
  const open = !!data && !data.introSeenAt && !impersonating && !dismissed

  function finish(next?: () => void) {
    setDismissed(true)
    markIntroSeen()
    if (beginner) setBeginnerMode(true)
    next?.()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent>
        <DialogHeader>
          <p className="letters text-muted-foreground text-xs tracking-[0.12em]">Boas-vindas</p>
          <DialogTitle className="letters text-3xl leading-none">
            Oi, {user.name.split(' ')[0]}! Vamos começar?
          </DialogTitle>
          <DialogDescription>
            Em 2 minutos o tour mostra onde fica cada coisa. Depois, a ajuda fica sempre no botão
            “?” lá em cima.
          </DialogDescription>
        </DialogHeader>

        <label className="bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg p-3.5 text-sm">
          <Checkbox
            checked={beginner}
            onCheckedChange={(v) => setBeginner(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <GraduationCap className="h-4 w-4" aria-hidden /> Ligar o modo iniciante
            </span>
            <span className="text-muted-foreground mt-0.5 block">
              Dicas em cada página e explicações visíveis ao lado das opções. Dá para desligar
              quando quiser, no botão “?”.
            </span>
          </span>
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={() => finish(() => start('tour:sistema', { restart: true }))}>
            <Compass /> Fazer o tour
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => finish(() => navigate('/painel/ajuda'))}
          >
            <LifeBuoy /> Ver a central de ajuda
          </Button>
        </div>
        <button
          type="button"
          onClick={() => finish()}
          className="text-muted-foreground hover:text-foreground mx-auto text-sm font-medium underline-offset-4 hover:underline"
        >
          Agora não
        </button>
      </DialogContent>
    </Dialog>
  )
}
