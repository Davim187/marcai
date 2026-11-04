import { useQuery } from '@tanstack/react-query'
import {
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { DAY_MS, formatBRL, GRACE_DAYS, type PlanDefinition, type PlanId } from '@marcai/shared'
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
import { PageHeader } from '@/components/ui/page-header'
import { QueryError } from '@/components/query-error'
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
    processingSince: string | null
  }>
  provider: 'mercadopago' | 'fake'
  plans: PlanDefinition[]
  /** Assinatura no cartão aguardando autorização no Mercado Pago */
  cardCheckoutUrl: string | null
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

const RETURN_MESSAGES: Record<string, { text: string; kind: 'success' | 'info' | 'error' }> = {
  aprovado: {
    text: 'Pagamento aprovado! A confirmação aparece aqui em instantes.',
    kind: 'success',
  },
  pendente: {
    text: 'Pagamento em processamento. Assim que o Mercado Pago confirmar, sua assinatura é atualizada.',
    kind: 'info',
  },
  recusado: {
    text: 'O pagamento não foi aprovado. Tente de novo ou escolha outra forma.',
    kind: 'error',
  },
}

export default function BillingPage() {
  const { tenant } = useTenant()
  const refresh = useRefreshSession()
  const [params, setParams] = useSearchParams()
  // Voltando do Mercado Pago, o webhook pode levar alguns segundos: consulta até confirmar.
  const [waitingUntil, setWaitingUntil] = useState(0)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api<Overview>('/billing'),
    refetchInterval: () => (Date.now() < waitingUntil ? 4000 : false),
  })
  const [choosing, setChoosing] = useState<PlanId | null>(null)
  const [method, setMethod] = useState<string>('PIX')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [methodOpen, setMethodOpen] = useState(false)

  useEffect(() => {
    const result = params.get('pagamento')
    const card = params.get('cartao')
    const simulate = params.get('simular')
    if (!result && !card && !simulate) return
    if (simulate) toast.info('Ambiente de testes: use o botão "Simular pagamento".')
    const msg = result ? RETURN_MESSAGES[result] : null
    if (msg) toast[msg.kind](msg.text, { duration: 8000 })
    if (card)
      toast.success('Cartão enviado! Assim que o Mercado Pago autorizar, a assinatura fica ativa.')
    if (!simulate && result !== 'recusado') setWaitingUntil(Date.now() + 90_000)
    const next = new URLSearchParams(params)
    next.delete('pagamento')
    next.delete('cartao')
    next.delete('simular')
    next.delete('collection_id')
    next.delete('collection_status')
    next.delete('payment_id')
    next.delete('status')
    next.delete('external_reference')
    next.delete('payment_type')
    next.delete('merchant_order_id')
    next.delete('preference_id')
    next.delete('site_id')
    next.delete('processing_mode')
    next.delete('merchant_account_id')
    next.delete('preapproval_id')
    setParams(next, { replace: true })
    refresh()
  }, [params, setParams, refresh])

  const after = { invalidate: [['billing']], onSuccess: () => refresh() }
  const subscribe = useApiMutation(
    (vars: { plan: PlanId; billingType: string; newCard?: boolean }) =>
      api<{ checkoutUrl: string | null }>('/billing/subscribe', { body: vars }),
    {
      ...after,
      success: 'Assinatura atualizada!',
      onSuccess: (res, vars) => {
        setChoosing(null)
        setMethodOpen(false)
        refresh()
        // Cartão: a pessoa autoriza a cobrança automática na página segura do Mercado Pago
        if (vars.billingType === 'CREDIT_CARD' && res.checkoutUrl)
          window.location.assign(res.checkoutUrl)
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
  const pay = useApiMutation(
    (id: string) =>
      api<{ checkoutUrl: string }>(`/billing/invoices/${id}/checkout`, { method: 'POST' }),
    { onSuccess: (res) => window.location.assign(res.checkoutUrl) },
  )
  const payOnce = useApiMutation(() => api('/billing/pay-once', { body: { billingType: 'PIX' } }), {
    ...after,
    success: 'Fatura PIX gerada. Clique em "Pagar" para abrir o PIX.',
  })
  const fakePay = useApiMutation(
    (id: string) => api(`/billing/fake/pay/${id}`, { method: 'POST' }),
    { ...after, success: 'Pagamento simulado com sucesso' },
  )

  if (error) return <QueryError error={error} onRetry={() => refetch()} />
  if (isLoading || !data) return <Skeleton className="h-96" />
  const sub = data.subscription
  const st = STATUS[sub?.status ?? 'trial']!
  // Já escolheu plano e forma de pagamento (mesmo durante o teste)
  const hasPaid = !!sub?.billingType && sub.status !== 'canceled'
  const pending = data.invoices.find((i) => i.status === 'pending' || i.status === 'overdue')
  const isCard = sub?.billingType === 'CREDIT_CARD'
  const date = (d: string) => fmt(d, 'UTC', 'dd/MM/yyyy')
  const methodLabel = METHODS.find((m) => m.id === sub?.billingType)?.label
  const statusText = (() => {
    if (!sub) return ''
    if (sub.status === 'trial') {
      const left = tenant.subscription?.trialDaysLeft ?? 0
      if (left <= 0) return 'Seu teste grátis terminou. Escolha um plano para continuar.'
      const base = `Faltam ${left} ${left === 1 ? 'dia' : 'dias'} de teste grátis (até ${date(sub.trialEndsAt!)}). Durante o teste, tudo do Pro fica liberado.`
      return sub.billingType
        ? `${base} Nada é cobrado antes disso: a primeira cobrança é em ${date(sub.trialEndsAt!)}${methodLabel ? `, no ${methodLabel}` : ''}.`
        : base
    }
    if (sub.status === 'canceled')
      return sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()
        ? `Cancelada. Você continua com acesso até ${date(sub.currentPeriodEnd)}.`
        : 'Cancelada. Escolha um plano abaixo para voltar a receber agendamentos.'
    if (sub.status === 'past_due' && sub.currentPeriodEnd) {
      const limit = new Date(new Date(sub.currentPeriodEnd).getTime() + GRACE_DAYS * DAY_MS)
      return `Venceu em ${date(sub.currentPeriodEnd)}. Pague até ${date(limit.toISOString())} para sua página de agendamento não sair do ar.`
    }
    if (sub.currentPeriodEnd)
      return `Ativa até ${date(sub.currentPeriodEnd)}.${isCard ? ' A renovação é cobrada automaticamente no cartão.' : methodLabel ? ` A próxima fatura (${methodLabel}) aparece aqui ${5} dias antes.` : ''}`
    return ''
  })()

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
            <p className="text-muted-foreground mt-1 text-sm">{statusText}</p>
          </div>
          {pending && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => pay.mutate(pending.id)} loading={pay.isPending}>
                <ExternalLink />{' '}
                {pending.processingSince
                  ? 'Abrir pagamento'
                  : `Pagar ${formatBRL(pending.amountCents)}`}
              </Button>
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
          {isCard && data.cardCheckoutUrl && (
            <Button asChild>
              <a href={data.cardCheckoutUrl}>
                <CreditCard /> Autorizar cartão
              </a>
            </Button>
          )}
          {isCard && sub?.status === 'past_due' && !pending && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  subscribe.mutate({ plan: sub.plan, billingType: 'CREDIT_CARD', newCard: true })
                }
                loading={subscribe.isPending}
              >
                <CreditCard /> Cadastrar outro cartão
              </Button>
              <Button
                variant="outline"
                onClick={() => payOnce.mutate()}
                loading={payOnce.isPending}
              >
                <QrCode /> Pagar este mês por PIX
              </Button>
            </div>
          )}
        </CardContent>
        {hasPaid && (
          <div className="flex flex-wrap gap-2 border-t px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMethod(
                  sub?.billingType && sub.billingType !== 'UNDEFINED' ? sub.billingType : 'PIX',
                )
                setMethodOpen(true)
              }}
            >
              Trocar forma de pagamento
            </Button>
          </div>
        )}
      </Card>

      {isCard && data.cardCheckoutUrl && (
        <p className="border-warning/40 bg-warning/10 rounded-xl border p-4 text-sm">
          Falta autorizar o cartão no Mercado Pago. Sem isso, a cobrança automática não acontece.
        </p>
      )}

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
        </CardHeader>
        <CardContent>
          {!data.invoices.length ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma fatura ainda. A primeira cobrança acontece no fim do teste grátis.
            </p>
          ) : (
            <div className="divide-y">
              {data.invoices.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">{i.description ?? 'Mensalidade'}</p>
                    <p className="text-muted-foreground">
                      {i.paidAt
                        ? `Paga em ${date(i.paidAt)}`
                        : i.status === 'pending'
                          ? `Vence em ${date(i.dueDate)} · pode pagar agora ou até o vencimento`
                          : `Venceu em ${date(i.dueDate)}`}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBRL(i.amountCents)}</span>
                  {i.processingSince && (i.status === 'pending' || i.status === 'overdue') ? (
                    <Badge variant="default">Pagamento em análise</Badge>
                  ) : (
                    <Badge variant={INVOICE[i.status]?.variant ?? 'muted'}>
                      {INVOICE[i.status]?.label ?? i.status}
                    </Badge>
                  )}
                  {(i.status === 'pending' || i.status === 'overdue') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pay.mutate(i.id)}
                      loading={pay.isPending && pay.variables === i.id}
                    >
                      Pagar
                    </Button>
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
                ? `O teste grátis continua até ${date(sub.trialEndsAt!)}. Com PIX ou boleto, a fatura já aparece aqui e você pode pagar quando quiser até essa data; no cartão, a primeira cobrança é nesse dia.`
                : 'A cobrança é mensal e você pode cancelar quando quiser.'}
            </DialogDescription>
          </DialogHeader>
          <MethodPicker value={method} onChange={setMethod} />
          <MethodHint method={method} />
          <SwitchWarning from={sub?.billingType ?? null} to={method} hasOpenInvoice={!!pending} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChoosing(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => choosing && subscribe.mutate({ plan: choosing, billingType: method })}
              loading={subscribe.isPending}
            >
              {method === 'CREDIT_CARD' ? 'Continuar no Mercado Pago' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
            <DialogDescription>Vale a partir da próxima cobrança.</DialogDescription>
          </DialogHeader>
          <MethodPicker value={method} onChange={setMethod} />
          <MethodHint method={method} />
          <SwitchWarning from={sub?.billingType ?? null} to={method} hasOpenInvoice={!!pending} />
          <DialogFooter>
            <Button
              onClick={() => sub && subscribe.mutate({ plan: sub.plan, billingType: method })}
              loading={subscribe.isPending}
            >
              {method === 'CREDIT_CARD' && !isCard ? 'Continuar no Mercado Pago' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar a assinatura?"
        description={
          sub?.status === 'trial'
            ? `Nada mais será cobrado. Você continua usando até o fim do teste grátis (${sub.trialEndsAt ? date(sub.trialEndsAt) : ''}); depois disso, sua página de agendamento sai do ar.`
            : `Nada mais será cobrado. Você continua com acesso até ${sub?.currentPeriodEnd ? date(sub.currentPeriodEnd) : 'o fim do período pago'}; depois disso, sua página de agendamento sai do ar.`
        }
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

function MethodHint({ method }: { method: string }) {
  const text =
    method === 'CREDIT_CARD'
      ? 'Você autoriza uma vez no Mercado Pago e a mensalidade é cobrada automaticamente todo mês.'
      : method === 'BOLETO'
        ? 'Todo mês geramos a fatura alguns dias antes do vencimento e avisamos por e-mail. O boleto compensa em até 3 dias úteis.'
        : 'Todo mês geramos a fatura alguns dias antes do vencimento e avisamos por e-mail. O PIX é confirmado na hora.'
  return (
    <p className="text-muted-foreground flex gap-2 text-sm">
      <ShieldCheck className="text-success mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {text} Pagamento processado pelo Mercado Pago: seus dados de cartão não passam pelo nosso
        sistema.
      </span>
    </p>
  )
}

/** Avisos ao trocar a forma de pagamento (evita pagar duas vezes). */
function SwitchWarning({
  from,
  to,
  hasOpenInvoice,
}: {
  from: string | null
  to: string
  hasOpenInvoice: boolean
}) {
  let text: string | null = null
  if (from === 'CREDIT_CARD' && to !== 'CREDIT_CARD')
    text =
      'A cobrança automática no cartão será cancelada no Mercado Pago. Daqui em diante, você paga cada mês pela fatura.'
  else if (to === 'CREDIT_CARD' && from !== 'CREDIT_CARD' && hasOpenInvoice)
    text =
      'A fatura em aberto será cancelada e o cartão passa a pagar. Se você já abriu o PIX ou o boleto dessa fatura, não pague mais por lá.'
  if (!text) return null
  return (
    <p className="border-warning/40 bg-warning/10 rounded-lg border p-3 text-sm" role="note">
      {text}
    </p>
  )
}
