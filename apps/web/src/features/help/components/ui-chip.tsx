import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UiChip } from '../types'

/**
 * Desenho do elemento que a pessoa precisa procurar na tela (botão, menu, chave, campo, aba),
 * no mesmo estilo do painel. Ilustra os tutoriais sem depender de print que envelhece.
 */
export function UiChipView({ chip }: { chip: UiChip }) {
  switch (chip.kind) {
    case 'button':
      return (
        <span
          className={cn(
            'inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold',
            chip.variant === 'outline'
              ? 'border-foreground/80 border-[1.5px]'
              : 'bg-primary text-primary-foreground shadow-soft',
          )}
        >
          {chip.label}
        </span>
      )
    case 'menu':
      return (
        <span className="inline-flex flex-wrap items-center gap-1 text-xs">
          {chip.path.map((p, i) => (
            <span key={p} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="text-muted-foreground h-3 w-3" aria-hidden />}
              <span className="bg-muted rounded px-2 py-0.5 font-semibold">{p}</span>
            </span>
          ))}
        </span>
      )
    case 'switch':
      return (
        <span className="bg-card inline-flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs font-medium">
          <span
            className={cn(
              'relative h-4 w-7 rounded-full transition-colors',
              chip.on ? 'bg-primary' : 'bg-input',
            )}
            aria-hidden
          >
            <span
              className={cn(
                'bg-background absolute top-0.5 h-3 w-3 rounded-full shadow-sm',
                chip.on ? 'left-3.5' : 'left-0.5',
              )}
            />
          </span>
          {chip.label}
        </span>
      )
    case 'field':
      return (
        <span className="inline-flex flex-col gap-0.5 text-xs">
          <span className="font-semibold">{chip.label}</span>
          <span className="bg-card text-muted-foreground min-w-36 rounded-md border px-2.5 py-1.5">
            {chip.value ?? '…'}
          </span>
        </span>
      )
    case 'tab':
      return (
        <span className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {chip.labels.map((l, i) => (
            <span
              key={l}
              className={cn(
                'rounded px-2.5 py-1 font-medium',
                i === chip.active && 'bg-card shadow-soft font-semibold',
              )}
            >
              {l}
            </span>
          ))}
        </span>
      )
  }
}

export function UiChips({ chips, className }: { chips: UiChip[]; className?: string }) {
  return (
    <div
      className={cn(
        'bg-background/60 flex flex-wrap items-end gap-2.5 rounded-lg border border-dashed p-3',
        className,
      )}
      aria-label="O que procurar na tela"
    >
      {chips.map((c, i) => (
        <UiChipView key={i} chip={c} />
      ))}
    </div>
  )
}
