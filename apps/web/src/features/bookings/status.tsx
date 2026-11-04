import { BOOKING_STATUS_LABELS, type BookingStatus } from '@marcai/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const STATUS_STYLES: Record<
  BookingStatus,
  { badge: 'warning' | 'default' | 'success' | 'muted' | 'destructive'; block: string; dot: string }
> = {
  pending: {
    badge: 'warning',
    block: 'border-l-warning bg-warning/10 text-foreground',
    dot: 'bg-warning',
  },
  confirmed: {
    badge: 'default',
    block: 'border-l-primary bg-primary-soft text-foreground',
    dot: 'bg-primary',
  },
  completed: {
    badge: 'success',
    block: 'border-l-success bg-success/10 text-foreground',
    dot: 'bg-success',
  },
  canceled: {
    badge: 'muted',
    block: 'border-l-muted-foreground/40 bg-muted text-muted-foreground line-through',
    dot: 'bg-muted-foreground/50',
  },
  no_show: {
    badge: 'destructive',
    block: 'border-l-destructive bg-destructive/10 text-foreground',
    dot: 'bg-destructive',
  },
}

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <Badge variant={STATUS_STYLES[status].badge} className={className}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLES[status].dot)} aria-hidden />
      {BOOKING_STATUS_LABELS[status]}
    </Badge>
  )
}
