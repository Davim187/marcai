import { cn } from '@/lib/utils'

/**
 * Linha de detalhes (serviço, valor, profissional…). Separa por espaço em vez de "·":
 * cada item fica num bloco que quebra de linha inteiro no celular.
 */
export function Meta({
  items,
  className,
}: {
  items: (React.ReactNode | false | null | undefined | 0 | '')[]
  className?: string
}) {
  const visible = items.filter(
    (i) => i !== false && i !== null && i !== undefined && i !== '' && i !== 0,
  )
  return (
    <span
      className={cn('text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-sm', className)}
    >
      {visible.map((item, i) => (
        <span key={i} className="truncate">
          {item}
        </span>
      ))}
    </span>
  )
}
