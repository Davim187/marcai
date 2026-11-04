import { useQuery } from '@tanstack/react-query'
import { Check, CreditCard, ExternalLink, FileText, QrCode, Receipt, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { formatBRL, type PlanDefinition, type PlanId } from '@marcai/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { fmt } from '@/lib/dates'
import { useApiMutation } from '@/lib/queries'
import { useRefreshSession, useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'

interface Overview {
  subscription: {
    plan: PlanId
    status: string
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    billingType: string | null
    providerSubscriptionId: string | null
    canceledAt: string | null
  } | null
  invoices: Array<{
    id: string
    amountCents: number
    status: string
    dueDate: string
    paidAt: string | null
    invoiceUrl: string | null
    billingType: string | null
    description: string | null
  }>
  provider: 'asaas' | 'fake'
  plans: PlanDefinition[]
}

const STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'default' }
> = {
  trial: { label: 'Teste grátis', variant: 'default' },
  active: { label: 'Ativa', variant: 'success' },
  past_due: { label: 'Pagamento pendente', variant: 'warning' },
  canceled: { label: 'Cancelada', variant: 'muted' },
}
const INVOICE: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }
> = {
  pending: { label: 'Em aberto', variant: 'warning' },
  paid: { label: 'Paga', variant: 'success' },
  overdue: { label: 'Vencida', variant: 'destructive' },
  refunded: { label: 'Estornada', variant: 'muted' },
  canceled: { label: 'Cancelada', variant: 'muted' },
}
const METHODS = [
  { id: 'PIX', label: 'PIX', icon: QrCode },
  { id: 'BOLETO', label: 'Boleto', icon: FileText },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito', icon: CreditCard },
] as const

export default function BillingPage() {
  const { tenant } = useTenant()
  const refresh = useRefreshSession()
  const { data, isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api<Overview>('/billing'),
  })
  const [choosing, setChoosing] = useState<PlanId | null>(null)
  const [method, setMethod] = useState<string>('PIX')
  const [cpf, setCpf] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [methodOpen, setMethodOpen] = useState(false)
  const after = { invalidate: [['billing']], onSuccess: () => refresh() }
  const subscribe = useApiMutation(
    () =>
      api('/billing/subscribe', {
        body: { plan: choosing, billingType: method, ...(cpf ? { cpfCnpj: cpf } : {}) },
      }),
    {
      ...after,
      success: 'Plano atualizado!',
      onSuccess: () => {
        setChoosing(null)
        refresh()
      },
    },
  )
  const cancel = useApiMutation(() => api('/billing/cancel', { method: 'POST' }), {
    ...after,
    success: 'Assinatura cancelada',
    onSuccess: () => {
      setCancelOpen(false)
      refresh()
    },
  })
  const changeMethod = useApiMutation(
    () => api('/billing/change-payment', { body: { billingType: method } }),
    { ...after, success: 'Forma de pagamento atualizada', onSuccess: () => setMethodOpen(false) },
  )
  const fakePay = useApiMutation(
    (id: string) => api(`/billing/fake/pay/${id}`, { method: 'POST' }),
    { ...after, success: 'Pagamento simulado com sucesso' },
  )

  if (isLoading || !data) return <Skeleton className="h-96" />
  const sub = data.subscription
  const st = STATUS[sub?.status ?? 'trial']!
  const hasPaid = !!sub?.providerSubscriptionId && sub.status !== 'canceled'
  const pending = data.invoices.find((i) => i.status === 'pending' || i.status === 'overdue')

  return (
    <div className="space-y-6">
      <PageHeader title="Assinatura" description="Seu plano, faturas e forma de pagamento." />
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold">
                Plano {sub?.plan === 'essencial' ? 'Essencial' : 'Pro'}
              </p>
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {sub?.status === 'trial' && tenant.subscription
                ? tenant.subscription.trialDaysLeft > 0
                  ? `Faltam ${tenant.subscription.trialDaysLeft} dias de teste grátis (até ${fmt(sub.trialEndsAt!, tenant.timezone, 'dd/MM/yyyy')}). Durante o teste, tudo do Pro fica liberado.`
                  : 'Seu teste grátis terminou. Escolha um plano para continuar.'
                : sub?.status === 'canceled'
                  ? `Cancelada. Acesso até ${sub.currentPeriodEnd ? fmt(sub.currentPeriodEnd, tenant.timezone, 'dd/MM/yyyy') : 'o fim do período'}.`
                  : sub?.currentPeriodEnd
                    ? `Próxima renovação em ${fmt(sub.currentPeriodEnd, tenant.timezone, 'dd/MM/yyyy')}${sub.billingType ? ` · ${METHODS.find((m) => m.id === sub.billingType)?.label ?? 'a escolher'}` : ''}.`
                    : ''}
            </p>
          </div>
          {pending && (
            <div className="flex gap-2">
              {pending.invoiceUrl && (
                <Button asChild>
                  <a href={pending.invoiceUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Pagar fatura
                  </a>
                </Button>
              )}
              {data.provider === 'fake' && (
                <Button
                  variant="outline"
                  onClick={() => fakePay.mutate(pending.id)}
                  loading={fakePay.isPending}
                >
                  Simular pagamento
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {data.plans.map((p) => {
          const current = sub?.plan === p.id && hasPaid
          return (
            <Card
              key={p.id}
              className={cn(
                'relative flex flex-col',
                p.id === 'pro' && 'border-primary ring-primary/30 ring-1',
              )}
            >
              {p.id === 'pro' && (
                <Badge className="bg-primary text-primary-foreground absolute -top-2.5 left-5">
                  <Sparkles className="h-3 w-3" /> Mais escolhido
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{p.name}</CardTitle>
                <CardDescription>{p.tagline}</CardDescription>
                <p className="pt-2">
                  <span className="text-3xl font-extrabold">
                    {formatBRL(p.priceCents).replace(',00', '')}
                  </span>
                  <span className="text-muted-foreground">/mês</span>
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="mb-5 flex-1 space-y-2 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="text-success h-4 w-4 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={p.id === 'pro' ? 'default' : 'outline'}
                  disabled={current}
                  onClick={() => {
                    setChoosing(p.id)
                    setMethod(
                      sub?.billingType && sub.billingType !== 'UNDEFINED' ? sub.billingType : 'PIX',
                    )
                  }}
                >
                  {current
                    ? 'Seu plano atual'
                    : hasPaid
                      ? p.id === 'pro'
                        ? 'Fazer upgrade'
                        : 'Mudar para o Essencial'
                      : `Assinar o ${p.name}`}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="text-primary h-4 w-4" /> Faturas
          </CardTitle>
          {hasPaid && (
            <Button variant="ghost" size="sm" onClick={() => setMethodOpen(true)}>
              Trocar forma de pagamento
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!data.invoices.length ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma fatura ainda. A primeira cobrança acontece no fim do teste grátis.
            </p>
          ) : (
            <div className="divide-y">
              {data.invoices.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{i.description ?? 'Mensalidade'}</p>
                    <p className="text-muted-foreground">
                      Vencimento {fmt(i.dueDate, 'UTC', 'dd/MM/yyyy')}
                      {i.paidAt && ` · paga em ${fmt(i.paidAt, 'UTC', 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBRL(i.amountCents)}</span>
                  <Badge variant={INVOICE[i.status]?.variant ?? 'muted'}>
                    {INVOICE[i.status]?.label ?? i.status}
                  </Badge>
                  {i.invoiceUrl && (
                    <a
                      href={i.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary"
                      aria-label="Abrir fatura"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasPaid && (
        <div className="text-center">
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => setCancelOpen(true)}
          >
            Cancelar assinatura
          </Button>
        </div>
      )}

      <Dialog open={!!choosing} onOpenChange={(o) => !o && setChoosing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar o plano {choosing === 'pro' ? 'Pro' : 'Essencial'}</DialogTitle>
            <DialogDescription>
              {sub?.status === 'trial' && (tenant.subscription?.trialDaysLeft ?? 0) > 0
                ? `Nada é cobrado agora: a primeira cobrança vem no fim do teste grátis.`
                : 'A cobrança é mensal e você pode cancelar quando quiser.'}
            </DialogDescription>
          </DialogHeader>
          <MethodPicker value={method} onChange={setMethod} />
          {data.provider === 'asaas' && !sub?.providerSubscriptionId && (
            <Field label="CPF ou CNPJ" htmlFor="cpf" hint="Exigido para emitir as cobranças.">
              <Input
                id="cpf"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
              />
            </Field>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChoosing(null)}>
              Voltar
            </Button>
            <Button onClick={() => subscribe.mutate()} loading={subscribe.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
            <DialogDescription>
              Vale a partir da próxima fatura. No cartão, você informa os dados com segurança na
              página de pagamento.
            </DialogDescription>
          </DialogHeader>
          <MethodPicker value={method} onChange={setMethod} />
          <DialogFooter>
            <Button onClick={() => changeMethod.mutate()} loading={changeMethod.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar a assinatura?"
        description="Você continua com acesso até o fim do período pago. Depois disso, sua página de agendamento sai do ar."
        confirmLabel="Cancelar assinatura"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  )
}

function MethodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
      {METHODS.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition',
            value === m.id
              ? 'border-primary bg-primary-soft text-primary'
              : 'hover:border-primary/50',
          )}
        >
          <m.icon className="h-5 w-5" />
          {m.label}
        </button>
      ))}
    </div>
  )
}
