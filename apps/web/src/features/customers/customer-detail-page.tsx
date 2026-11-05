import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarPlus,
  Download,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatBRL, formatPhone, whatsappLink } from '@marcai/shared'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { fmt, todayIn } from '@/lib/dates'
import { useApiMutation } from '@/lib/queries'
import { useTenant } from '@/lib/session'
import type { BookingDTO, CustomerDTO } from '@/lib/types'
import { downloadBlob } from '@/lib/utils'
import { BookingDetailDialog } from '../bookings/booking-detail-dialog'
import { NewBookingDialog } from '../bookings/new-booking-dialog'
import { StatusBadge } from '../bookings/status'
import { CustomerDialog } from './customer-dialog'

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { tenant } = useTenant()
  const tz = tenant.timezone
  const navigate = useNavigate()
  const { data: c, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDTO & { bookings: BookingDTO[] }>(`/customers/${id}`),
  })
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const remove = useApiMutation(() => api(`/customers/${id}`, { method: 'DELETE' }), {
    success: 'Dados da cliente excluídos',
    invalidate: [['customers']],
    onSuccess: () => navigate('/painel/clientes'),
  })

  if (isLoading || !c)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    )
  const s = c.stats!
  return (
    <div className="space-y-6">
      <Link
        to="/painel/clientes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={c.name} className="h-16 w-16 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{c.name}</h1>
          <p className="text-muted-foreground">
            {formatPhone(c.phone)}
            {c.email && ` · ${c.email}`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <CalendarPlus /> Agendar
          </Button>
          {tenant.role === 'owner' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Mais opções">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () =>
                    downloadBlob(
                      JSON.stringify(await api(`/customers/${id}/export`), null, 2),
                      `dados-${c.name}.json`,
                      'application/json',
                    )
                  }
                >
                  <Download /> Exportar dados (LGPD)
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                  <Trash2 /> Excluir dados (LGPD)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Total gasto', formatBRL(s.totalSpentCents)],
          ['Atendimentos', String(s.visits)],
          ['Faltas', String(s.noShows)],
          ['Último atendimento', s.lastVisit ? fmt(s.lastVisit, tz, 'dd/MM/yyyy') : '—'],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-muted-foreground text-xs">{k}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </Card>
        ))}
      </div>
      {c.notes && (
        <Card className="border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-semibold">Observações privadas</p>
          {c.notes}
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!c.bookings.length && (
            <p className="text-muted-foreground text-sm">Nenhum agendamento ainda.</p>
          )}
          {c.bookings.map((b) => (
            <button
              key={b.id}
              onClick={() => setOpenId(b.id)}
              className="hover:bg-muted/40 flex w-full items-center gap-3 rounded-xl border p-3 text-left"
            >
              <div className="w-16 text-center text-sm">
                <p className="font-bold">{fmt(b.startsAt, tz, 'dd/MM')}</p>
                <p className="text-muted-foreground text-xs">{fmt(b.startsAt, tz, 'yyyy')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.serviceName}</p>
                <p className="text-muted-foreground text-sm">
                  {fmt(b.startsAt, tz, 'HH:mm')} · {formatBRL(b.priceCents)}
                </p>
              </div>
              <StatusBadge status={b.status} />
            </button>
          ))}
        </CardContent>
      </Card>
      {editing && <CustomerDialog customer={c} onClose={() => setEditing(false)} />}
      {newOpen && (
        <NewBookingDialog
          prefill={{ date: todayIn(tz), customer: { id: c.id, name: c.name, phone: c.phone } }}
          onClose={() => setNewOpen(false)}
        />
      )}
      <BookingDetailDialog bookingId={openId} onClose={() => setOpenId(null)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Excluir os dados desta cliente?"
        description="Nome, telefone, e-mail, observações e respostas são apagados (LGPD). O histórico financeiro fica anônimo. Agendamentos futuros são cancelados. Não dá para desfazer."
        confirmLabel="Excluir dados"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}
