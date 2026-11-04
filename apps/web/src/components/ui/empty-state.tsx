import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Estado vazio ilustrado com uma ação clara. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-card/50 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <div className="relative mb-4">
        <div
          className="bg-primary-soft/70 absolute inset-0 -m-3 rounded-full blur-md"
          aria-hidden
        />
        <div className="bg-primary-soft text-primary relative flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
