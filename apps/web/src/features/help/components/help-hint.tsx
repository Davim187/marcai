import { Info } from 'lucide-react'
import { Link } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { HINTS, type HintId } from '../content'
import { useBeginnerMode } from '../state/help-state'

/**
 * Ícone ⓘ com uma explicação curta (abre no clique, no toque e pelo teclado). No modo
 * iniciante mostra também o texto "O que é?", para ninguém deixar de ver.
 */
export function HelpHint({ id, className }: { id: HintId; className?: string }) {
  const hint = HINTS[id]
  const beginner = useBeginnerMode()
  const more = 'more' in hint ? hint.more : undefined
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex shrink-0 items-center gap-1 rounded-full align-middle text-xs font-medium normal-case tracking-normal outline-none transition-colors focus-visible:ring-2',
          beginner && 'bg-accent text-accent-foreground hover:text-accent-foreground px-2 py-0.5',
          className,
        )}
        aria-label={`O que é: ${hint.title}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        {beginner && <span>O que é?</span>}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3.5 text-sm" side="top" align="start">
        <p className="font-semibold">{hint.title}</p>
        <p className="text-muted-foreground mt-1 leading-relaxed">{hint.body}</p>
        {more && (
          <Link
            to={`/painel/ajuda/${more}`}
            className="text-cobalt mt-2 inline-block text-xs font-semibold underline-offset-4 hover:underline"
          >
            Saiba mais
          </Link>
        )}
      </PopoverContent>
    </Popover>
  )
}
