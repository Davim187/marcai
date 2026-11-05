import { BOOKING_STATUS_LABELS, type BookingStatus } from '@marcai/shared'
import { Badge } from '@/components/ui/badge'

// Cada status tem o seu feltro (ver index.css). O texto do status sempre acompanha a cor.
export const STATUS_STYLES: Record<
  BookingStatus,
  {
    badge: 'mustard' | 'cobalt' | 'green' | 'muted' | 'terra'
    block: string
    dot: string
  }
> = {
  pending: {
    badge: 'mustard',
    block: 'border-t-mustard bg-mustard/20 text-foreground',
    dot: 'bg-mustard',
  },
  confirmed: {
    badge: 'cobalt',
    block: 'border-t-cobalt bg-cobalt/12 text-foreground',
    dot: 'bg-cobalt',
  },
  completed: {
    badge: 'green',
    block: 'border-t-green bg-green/12 text-foreground',
    dot: 'bg-green',
  },
  canceled: {
    badge: 'muted',
    block: 'border-t-muted-foreground/50 bg-muted text-muted-foreground line-through',
    dot: 'bg-muted-foreground/50',
  },
  no_show: {
    badge: 'terra',
    block: 'border-t-terra bg-terra/12 text-foreground',
    dot: 'bg-terra',
  },
}

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <Badge variant={STATUS_STYLES[status].badge} className={className}>
      {BOOKING_STATUS_LABELS[status]}
    </Badge>
  )
}
