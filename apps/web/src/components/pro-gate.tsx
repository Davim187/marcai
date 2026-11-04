import { Lock, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { useHasFeature } from '@/lib/session'
import { Button } from './ui/button'

/** Bloqueia um recurso do plano Pro com um aviso de upgrade (gating centralizado no back-end). */
export function ProGate({
  feature,
  children,
  title = 'Recurso do plano Pro',
}: {
  feature: string
  children: React.ReactNode
  title?: string
}) {
  const has = useHasFeature()
  if (has(feature)) return <>{children}</>
  return (
    <div className="relative overflow-hidden rounded-2xl border">
      <div className="pointer-events-none select-none opacity-40 blur-[1px]" aria-hidden>
        {children}
      </div>
      <div className="bg-background/70 absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center backdrop-blur-[1px]">
        <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </span>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground max-w-xs text-sm">
          Avisos no WhatsApp para você e confirmação + lembrete automático para a cliente.
        </p>
        <Button asChild size="sm">
          <Link to="/painel/assinatura">
            <Sparkles /> Fazer upgrade por R$ 99/mês
          </Link>
        </Button>
      </div>
    </div>
  )
}
