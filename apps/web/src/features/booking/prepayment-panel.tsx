import { useMutation } from '@tanstack/react-query'
import { Check, Clock, Copy, ExternalLink, FileUp, Hourglass, XCircle } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatBRL } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { fmt } from '@/lib/dates'
import type { PrepaymentView } from './types'

/** Tempo restante para pagar, atualizado a cada 30 s. */
function useRemaining(expiresAt: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return null
  const min = Math.ceil(ms / 60_000)
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`
}

/**
 * Sinal antecipado pela cliente: pagar no Mercado Pago (confirma sozinho) ou pagar o PIX e
 * anexar o comprovante (o estabelecimento confere e aprova).
 */
export function PrepaymentPanel({
  token,
  payment,
  timezone,
  tenantName,
  onChange,
}: {
  token: string
  payment: PrepaymentView
  timezone: string
  tenantName: string
  onChange: (p: PrepaymentView) => void
}) {
  const remaining = useRemaining(payment.expiresAt)
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api<{ payment: PrepaymentView }>(`/public/bookings/${token}/payment/proof`, { body })
    },
    onSuccess: (r) => {
      toast.success(`Comprovante enviado. ${tenantName} vai conferir e confirmar seu horário.`)
      onChange(r.payment)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const amount = formatBRL(payment.amountCents)
  const label = payment.percent === 100 ? 'Pagamento antecipado' : `Sinal de ${payment.percent}%`

  if (payment.status === 'paid')
    return (
      <Notice icon={<Check />} tone="ok" title={`${label} pago · ${amount}`}>
        Pagamento recebido.
      </Notice>
    )
  if (payment.status === 'refunded')
    return (
      <Notice icon={<XCircle />} tone="muted" title="Pagamento devolvido">
        O valor de {amount} foi devolvido.
      </Notice>
    )
  if (payment.status === 'rejected')
    return (
      <Notice icon={<XCircle />} tone="bad" title="Pagamento não aprovado">
        {payment.rejectReason ?? `${tenantName} não aprovou o comprovante.`} O horário foi liberado.
      </Notice>
    )
  if (payment.status === 'expired' || (!remaining && payment.status === 'awaiting_payment'))
    return (
      <Notice icon={<Clock />} tone="bad" title="Prazo para pagar acabou">
        Sem o pagamento, o horário foi liberado. Faça um novo agendamento.
      </Notice>
    )

  return (
    <div className="bg-card shadow-soft space-y-4 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums">{amount}</p>
        </div>
        {payment.status === 'awaiting_payment' && remaining && (
          <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums">
            <Hourglass className="size-3.5" /> {remaining}
          </span>
        )}
      </div>

      {payment.status === 'under_review' ? (
        <Notice icon={<Hourglass />} tone="muted" title="Comprovante em análise">
          {tenantName} vai conferir o pagamento e confirmar seu horário. Você recebe uma mensagem.
        </Notice>
      ) : (
        <p className="text-muted-foreground text-sm">
          Seu horário fica reservado até{' '}
          <strong className="text-foreground">{fmt(payment.expiresAt, timezone, 'HH:mm')}</strong>.
          Sem o pagamento até lá, ele é liberado.
        </p>
      )}

      {payment.method === 'mercadopago' && payment.checkoutUrl && (
        <Button size="lg" className="w-full" asChild>
          <a href={payment.checkoutUrl}>
            <ExternalLink /> Pagar {amount} com PIX no Mercado Pago
          </a>
        </Button>
      )}

      {payment.method === 'pix_manual' && payment.pix && (
        <div className="space-y-3">
          <img
            src={payment.pix.qrDataUrl}
            alt="QR Code do PIX"
            className="mx-auto size-48 rounded-lg border bg-white p-2"
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              navigator.clipboard
                .writeText(payment.pix!.copyPaste)
                .then(() => toast.success('PIX copia e cola copiado'))
                .catch(() => toast.error('Não deu para copiar. Use a chave abaixo.'))
            }
          >
            <Copy /> Copiar PIX copia e cola
          </Button>
          <div className="bg-muted rounded-lg p-3 text-sm">
            <p className="text-muted-foreground text-xs">Chave PIX</p>
            <p className="break-all font-medium">{payment.pix.key}</p>
            {payment.pix.holder && (
              <p className="text-muted-foreground mt-1 text-xs">Em nome de {payment.pix.holder}</p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ''
            }}
          />
          <Button
            size="lg"
            className="w-full"
            variant={payment.proofSent ? 'outline' : 'default'}
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp /> {payment.proofSent ? 'Trocar comprovante' : 'Anexar comprovante'}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Depois de pagar, tire um print do comprovante e anexe aqui.
          </p>
        </div>
      )}
    </div>
  )
}

function Notice({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode
  tone: 'ok' | 'bad' | 'muted'
  title: string
  children: ReactNode
}) {
  const cls =
    tone === 'ok'
      ? 'border-green/30 bg-green/10'
      : tone === 'bad'
        ? 'border-terra/30 bg-terra/10'
        : 'bg-muted'
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 ${cls}`}
    >
      {icon}
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}
