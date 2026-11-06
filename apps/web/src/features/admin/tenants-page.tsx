import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  CalendarPlus,
  ChevronRight,
  CreditCard,
  ExternalLink,
  LogIn,
  RotateCcw,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatBRL, type SubscriptionStatus } from '@marcai/shared'
import { askConfirm } from '@/components/confirm-host'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import {
  fmtLocal,
  InvoiceBadge,
  type InvoiceStatus,
  SUB_STATUS,
  SubStatusBadge,
} from './admin-shared'

interface TenantRow {
  id: string
  name: string
  slug: string
  createdAt: string
  blocked: boolean
  blockedReason: string | null
  deletedAt: string | null
  publicUrl: string
  owner: { name: string; email: string } | null
  subscription: {
    plan: string
    status: SubscriptionStatus
    trialEndsAt: string | null
    currentPeriodEnd: string | null
  } | null
  counts: { bookings: number; customers: number }
}

interface TenantDetail {
  id: string
  name: string
  slug: string
  businessType: string
  city: string | null
  whatsapp: string | null
  instagram: string | null
  createdAt: string
  deletedAt: string | null
  onboardingCompleted: boolean
  blocked: boolean
  blockedReason: string | null
  publicUrl: string
  whatsappConnection: { status: string; phone: string | null; provider: string } | null
  members: Array<{
    user: { id: string; name: string; email: string }
    role: 'owner' | 'professional'
    pending: boolean
  }>
  subscription: {
    plan: 'essencial' | 'pro'
    status: SubscriptionStatus
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    billingType: string | null
    canceledAt: string | null
  } | null
  invoices: Array<{
    id: string
    amountCents: number
    status: InvoiceStatus
    dueDate: string
    paidAt: string | null
    paymentMethod: string | null
  }>
  counts: {
    bookings: number
    customers: number
    services: number
    professionals: number
    bookingsLast30: number
  }
  lastBookingAt: string | null
}

const INVALIDATE = [['admin-tenants'], ['admin-tenant'], ['admin-overview'], ['admin-audit']]
const ROLE = { owner: 'Dona', professional: 'Profissional' } as const

export default function AdminTenantsPage() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('id')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'active' | 'deleted'>('active')
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['admin-tenants', q, status, view],
    queryFn: () =>
      api<TenantRow[]>(
        `/admin/tenants?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}${view === 'deleted' ? '&deleted=true' : ''}`,
      ),
  })
  const open = (id: string | null) => setParams(id ? { id } : {})

  return (
    <div>
      <PageHeader
        title="Estabelecimentos"
        description="Todos os negócios do sistema, com assinatura, uso e ações de suporte."
      />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                className="h-10 pl-9"
                placeholder="Nome, endereço (slug) ou e-mail da dona"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar"
              />
            </div>
            <NativeSelect
              className="h-10 sm:w-40"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status da assinatura"
            >
              <option value="">Todos os status</option>
              {Object.entries(SUB_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              className="h-10 sm:w-36"
              value={view}
              onChange={(e) => setView(e.target.value as 'active' | 'deleted')}
              aria-label="Mostrar"
            >
              <option value="active">Ativos</option>
              <option value="deleted">Excluídos</option>
            </NativeSelect>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : !tenants?.length ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Nenhum estabelecimento encontrado.
              </p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-2">Estabelecimento</th>
                    <th>Responsável</th>
                    <th>Plano</th>
                    <th>Status</th>
                    <th>Uso</th>
                    <th>Criado</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenants.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => open(t.id)}
                    >
                      <td className="py-2.5">
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-muted-foreground text-xs">/{t.slug}</p>
                      </td>
                      <td>
                        <p>{t.owner?.name ?? '—'}</p>
                        <p className="text-muted-foreground text-xs">{t.owner?.email}</p>
                      </td>
                      <td className="capitalize">{t.subscription?.plan ?? '—'}</td>
                      <td>
                        {t.deletedAt ? (
                          <Badge variant="muted">Excluído</Badge>
                        ) : t.blocked ? (
                          <Badge variant="destructive">Bloqueado</Badge>
                        ) : t.subscription ? (
                          <SubStatusBadge status={t.subscription.status} />
                        ) : (
                          '—'
                        )}
                        {t.subscription?.status === 'trial' && t.subscription.trialEndsAt && (
                          <p className="text-muted-foreground text-xs">
                            até {fmtLocal(t.subscription.trialEndsAt, 'dd/MM')}
                          </p>
                        )}
                      </td>
                      <td className="text-muted-foreground text-xs">
                        {t.counts.bookings} ag. · {t.counts.customers} cli.
                      </td>
                      <td className="text-xs">{fmtLocal(t.createdAt, 'dd/MM/yy')}</td>
                      <td>
                        <ChevronRight className="text-muted-foreground h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
      {openId && <TenantDialog id={openId} onClose={() => open(null)} />}
    </div>
  )
}

function TenantDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t, isLoading } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => api<TenantDetail>(`/admin/tenants/${id}`),
  })
  const [panel, setPanel] = useState<'trial' | 'subscription' | 'block' | null>(null)

  const impersonate = useApiMutation(
    () => api(`/admin/tenants/${id}/impersonate`, { method: 'POST' }),
    {
      onSuccess: () => {
        window.location.href = '/painel'
      },
    },
  )
  const unblock = useApiMutation(
    () => api(`/admin/tenants/${id}/block`, { body: { blocked: false } }),
    { success: 'Estabelecimento desbloqueado', invalidate: INVALIDATE },
  )
  const setDeleted = useApiMutation(
    (deleted: boolean) => api(`/admin/tenants/${id}/delete`, { body: { deleted } }),
    {
      success: 'Atualizado',
      invalidate: INVALIDATE,
      onSuccess: (_r, deleted) => deleted && onClose(),
    },
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {isLoading || !t ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {t.name}
                {t.deletedAt ? (
                  <Badge variant="muted">Excluído</Badge>
                ) : t.blocked ? (
                  <Badge variant="destructive">Bloqueado</Badge>
                ) : (
                  t.subscription && <SubStatusBadge status={t.subscription.status} />
                )}
              </DialogTitle>
              <a
                href={t.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cobalt inline-flex items-center gap-1 text-sm"
              >
                {t.publicUrl.replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
              </a>
            </DialogHeader>

            {t.blocked && t.blockedReason && (
              <p className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                Motivo do bloqueio: {t.blockedReason}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Agendamentos', t.counts.bookings],
                ['Últimos 30 dias', t.counts.bookingsLast30],
                ['Clientes', t.counts.customers],
                ['Serviços · equipe', `${t.counts.services} · ${t.counts.professionals}`],
              ].map(([k, v]) => (
                <div key={String(k)} className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">{k}</p>
                  <p className="font-bold">{v}</p>
                </div>
              ))}
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Info label="Tipo de negócio" value={t.businessType} />
              <Info label="Cidade" value={t.city} />
              <Info label="WhatsApp" value={t.whatsapp} />
              <Info label="Instagram" value={t.instagram} />
              <Info label="Criado em" value={fmtLocal(t.createdAt)} />
              <Info
                label="Último agendamento"
                value={t.lastBookingAt ? fmtLocal(t.lastBookingAt) : 'Nenhum'}
              />
              <Info label="Cadastro concluído" value={t.onboardingCompleted ? 'Sim' : 'Não'} />
              <Info
                label="Conexão do WhatsApp"
                value={
                  t.whatsappConnection
                    ? `${t.whatsappConnection.status}${t.whatsappConnection.phone ? ` · ${t.whatsappConnection.phone}` : ''}`
                    : 'Não conectado'
                }
              />
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Assinatura</h3>
              {t.subscription ? (
                <p className="text-sm">
                  Plano <b className="capitalize">{t.subscription.plan}</b> ·{' '}
                  {SUB_STATUS[t.subscription.status].label}
                  {t.subscription.status === 'trial' &&
                    t.subscription.trialEndsAt &&
                    ` até ${fmtLocal(t.subscription.trialEndsAt, 'dd/MM/yy')}`}
                  {t.subscription.status === 'active' &&
                    t.subscription.currentPeriodEnd &&
                    ` · renova em ${fmtLocal(t.subscription.currentPeriodEnd, 'dd/MM/yy')}`}
                  {t.subscription.billingType && ` · ${t.subscription.billingType}`}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">Sem assinatura.</p>
              )}
              {t.invoices.length > 0 && (
                <ul className="mt-2 divide-y rounded-lg border text-sm">
                  {t.invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-20 text-xs">{fmtLocal(i.dueDate, 'dd/MM/yy')}</span>
                      <span className="flex-1 font-medium">{formatBRL(i.amountCents)}</span>
                      <InvoiceBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Equipe com acesso</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {t.members.map((m) => (
                  <li key={m.user.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.user.name}</p>
                      <p className="text-muted-foreground truncate text-xs">{m.user.email}</p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {ROLE[m.role]}
                      {m.pending && ' · convite pendente'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {panel === 'trial' && <ExtendTrial id={id} onDone={() => setPanel(null)} />}
            {panel === 'subscription' && t.subscription && (
              <AdjustSubscription id={id} sub={t.subscription} onDone={() => setPanel(null)} />
            )}
            {panel === 'block' && <BlockForm id={id} onDone={() => setPanel(null)} />}

            <DialogFooter className="flex-wrap gap-2 sm:justify-start">
              {t.deletedAt ? (
                <Button onClick={() => setDeleted.mutate(false)} loading={setDeleted.isPending}>
                  <RotateCcw /> Restaurar
                </Button>
              ) : (
                <>
                  <Button onClick={() => impersonate.mutate()} loading={impersonate.isPending}>
                    <LogIn /> Entrar como
                  </Button>
                  <Button variant="secondary" onClick={() => setPanel('trial')}>
                    <CalendarPlus /> Estender teste
                  </Button>
                  <Button variant="secondary" onClick={() => setPanel('subscription')}>
                    <CreditCard /> Ajustar assinatura
                  </Button>
                  {t.blocked ? (
                    <Button
                      variant="secondary"
                      onClick={() => unblock.mutate()}
                      loading={unblock.isPending}
                    >
                      <Unlock /> Desbloquear
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setPanel('block')}>
                      <Ban /> Bloquear
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (
                        await askConfirm({
                          title: `Excluir ${t.name}?`,
                          description:
                            'O estabelecimento sai do ar e some do painel de todos da equipe. Os dados ficam guardados e você pode restaurar depois em "Excluídos".',
                          confirmLabel: 'Excluir',
                        })
                      )
                        setDeleted.mutate(true)
                    }}
                  >
                    <Trash2 /> Excluir
                  </Button>
                </>
              )}
            </DialogFooter>
            <p className="text-muted-foreground text-xs">
              “Entrar como” abre uma sessão de suporte de 1 dia, com aviso à dona e registro na
              auditoria. Ao encerrar, entre de novo como admin.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

function ExtendTrial({ id, onDone }: { id: string; onDone: () => void }) {
  const [days, setDays] = useState(15)
  const ext = useApiMutation(() => api(`/admin/tenants/${id}/extend-trial`, { body: { days } }), {
    success: 'Teste estendido',
    invalidate: INVALIDATE,
    onSuccess: onDone,
  })
  return (
    <InlineForm
      title="Estender teste"
      onCancel={onDone}
      onSubmit={() => ext.mutate()}
      loading={ext.isPending}
    >
      <Field label="Dias a mais" htmlFor="ext-days">
        <Input
          id="ext-days"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
      </Field>
    </InlineForm>
  )
}

function AdjustSubscription({
  id,
  sub,
  onDone,
}: {
  id: string
  sub: NonNullable<TenantDetail['subscription']>
  onDone: () => void
}) {
  const [plan, setPlan] = useState(sub.plan)
  const [status, setStatus] = useState<SubscriptionStatus>(sub.status)
  const [until, setUntil] = useState('')
  const save = useApiMutation(
    () =>
      api(`/admin/tenants/${id}/subscription`, {
        body: { plan, status, until: until || undefined },
      }),
    { success: 'Assinatura ajustada', invalidate: INVALIDATE, onSuccess: onDone },
  )
  return (
    <InlineForm
      title="Ajustar assinatura"
      hint="Use para cortesias ou pagamentos feitos por fora. Não altera nada no Mercado Pago."
      onCancel={onDone}
      onSubmit={() => save.mutate()}
      loading={save.isPending}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Plano" htmlFor="sub-plan">
          <NativeSelect
            id="sub-plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as 'essencial' | 'pro')}
          >
            <option value="essencial">Essencial</option>
            <option value="pro">Pro</option>
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="sub-status">
          <NativeSelect
            id="sub-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
          >
            {Object.entries(SUB_STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {(status === 'trial' || status === 'active') && (
          <Field label={status === 'trial' ? 'Teste até' : 'Pago até'} htmlFor="sub-until">
            <Input
              id="sub-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </Field>
        )}
      </div>
    </InlineForm>
  )
}

function BlockForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const block = useApiMutation(
    () =>
      api(`/admin/tenants/${id}/block`, {
        body: { blocked: true, reason: reason.trim() || 'Bloqueado pelo suporte' },
      }),
    { success: 'Estabelecimento bloqueado', invalidate: INVALIDATE, onSuccess: onDone },
  )
  return (
    <InlineForm
      title="Bloquear estabelecimento"
      hint="A página pública sai do ar e o painel fica somente leitura até desbloquear."
      onCancel={onDone}
      onSubmit={() => block.mutate()}
      loading={block.isPending}
      submitLabel="Bloquear"
    >
      <Field label="Motivo (a dona vê esta mensagem)" htmlFor="block-reason">
        <Textarea
          id="block-reason"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </InlineForm>
  )
}

function InlineForm({
  title,
  hint,
  children,
  onSubmit,
  onCancel,
  loading,
  submitLabel = 'Salvar',
}: {
  title: string
  hint?: string
  children: React.ReactNode
  onSubmit: () => void
  onCancel: () => void
  loading: boolean
  submitLabel?: string
}) {
  return (
    <form
      className="bg-muted/60 space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      {children}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={loading}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
