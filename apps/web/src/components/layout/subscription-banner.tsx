import { AlertTriangle, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { DAY_MS, GRACE_DAYS } from '@marcai/shared'
import { useTenant } from '@/lib/session'

export function SubscriptionBanner() {
  const { tenant, appMode } = useTenant()
  if (appMode !== 'saas') return null
  const sub = tenant.subscription
  const blockInDays = sub?.currentPeriodEnd
    ? Math.ceil(
        (new Date(sub.currentPeriodEnd).getTime() + GRACE_DAYS * DAY_MS - Date.now()) / DAY_MS,
      )
    : null
  if (tenant.access === 'blocked') {
    return (
      <div
        className="bg-destructive text-destructive-foreground flex flex-wrap items-center justify-center gap-2 px-4 py-2.5 text-center text-sm font-medium"
        role="alert"
      >
        <AlertTriangle className="h-4 w-4" />
        {tenant.blocked
          ? 'Sua conta está bloqueada. Fale com o suporte.'
          : 'Assinatura vencida: sua página está indisponível e o painel está em modo somente leitura.'}
        {!tenant.blocked && tenant.role === 'owner' && (
          <Link to="/painel/assinatura" className="font-bold underline">
            Regularizar agora
          </Link>
        )}
      </div>
    )
  }
  if (tenant.access === 'grace') {
    return (
      <div
        className="bg-warning text-warning-foreground flex flex-wrap items-center justify-center gap-2 px-4 py-2.5 text-center text-sm font-medium"
        role="alert"
      >
        <AlertTriangle className="h-4 w-4" />
        {blockInDays !== null && blockInDays > 0
          ? `Pagamento atrasado: sua página de agendamento sai do ar em ${blockInDays} ${blockInDays === 1 ? 'dia' : 'dias'}.`
          : 'Pagamento atrasado: regularize hoje para sua página não sair do ar.'}
        {tenant.role === 'owner' && (
          <Link to="/painel/assinatura" className="font-bold underline">
            Pagar agora
          </Link>
        )}
      </div>
    )
  }
  if (sub?.status === 'trial' && tenant.role === 'owner' && sub.billingType && sub.trialEndsAt) {
    return (
      <div className="bg-primary-soft text-primary flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm">
        <Sparkles className="h-4 w-4" />
        {`Plano ${sub.plan === 'pro' ? 'Pro' : 'Essencial'} escolhido. A primeira cobrança é em ${new Date(sub.trialEndsAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`}
        <Link to="/painel/assinatura" className="font-bold underline">
          Ver assinatura
        </Link>
      </div>
    )
  }
  if (sub?.status === 'trial' && tenant.role === 'owner') {
    return (
      <div className="bg-primary-soft text-primary flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm">
        <Sparkles className="h-4 w-4" />
        {sub.trialDaysLeft > 0
          ? `Você está no teste grátis: faltam ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'dia' : 'dias'}.`
          : 'Seu teste grátis terminou.'}
        <Link to="/painel/assinatura" className="font-bold underline">
          Escolher plano
        </Link>
      </div>
    )
  }
  return null
}
