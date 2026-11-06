import {
  INVOICE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from '@marcai/shared'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fmt } from '@/lib/dates'

/** Horário local de quem está olhando a tela. */
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export const fmtLocal = (date: string, pattern = "dd/MM/yy 'às' HH:mm") =>
  fmt(date, LOCAL_TZ, pattern)

type BadgeVariant = 'default' | 'success' | 'warning' | 'muted' | 'destructive'

export const SUB_STATUS: Record<SubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  trial: { label: SUBSCRIPTION_STATUS_LABELS.trial, variant: 'default' },
  active: { label: SUBSCRIPTION_STATUS_LABELS.active, variant: 'success' },
  past_due: { label: SUBSCRIPTION_STATUS_LABELS.past_due, variant: 'warning' },
  canceled: { label: SUBSCRIPTION_STATUS_LABELS.canceled, variant: 'muted' },
}

export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABELS
export const INVOICE_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  pending: 'default',
  paid: 'success',
  overdue: 'warning',
  refunded: 'muted',
  canceled: 'muted',
}

export function SubStatusBadge({ status }: { status: SubscriptionStatus }) {
  const s = SUB_STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={INVOICE_VARIANT[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
}

/** Número de destaque do topo das páginas do admin. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode | undefined
  hint?: React.ReactNode
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      {value !== undefined ? (
        <p className="mt-1 text-xl font-bold">{value}</p>
      ) : (
        <Skeleton className="mt-1 h-7 w-20" />
      )}
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </Card>
  )
}

/** "Chrome no Windows" a partir do user-agent, sem biblioteca. */
export function deviceName(ua: string | null) {
  if (!ua) return 'Aparelho desconhecido'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador'
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} no ${os}` : browser
}
