import { motion } from 'framer-motion'
import { CalendarPlus, Check, Download, Link2, Repeat } from 'lucide-react'
import { everyWeekAt, formatPrice } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { capitalize, fmt } from '@/lib/dates'
import { useState } from 'react'
import { PrepaymentPanel } from './prepayment-panel'
import type { BookingResult, PrepaymentView, PublicTenant } from './types'

export function BookingSuccess({
  result,
  tenant,
}: {
  result: BookingResult
  tenant: PublicTenant
}) {
  const pending = result.status === 'pending'
  const [payment, setPayment] = useState<PrepaymentView | null>(result.payment ?? null)
  const awaitingPayment = payment?.status === 'awaiting_payment'
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="bg-primary text-primary-foreground shadow-lift mx-auto flex h-20 w-20 items-center justify-center rounded-full"
        >
          <motion.span
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <Check className="h-10 w-10" strokeWidth={3} />
          </motion.span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 text-2xl font-bold"
        >
          {awaitingPayment
            ? 'Falta o pagamento'
            : pending
              ? 'Pedido enviado'
              : result.series
                ? 'Horário fixo confirmado'
                : 'Horário confirmado'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground mt-1.5"
        >
          {awaitingPayment
            ? 'Seu horário está reservado. Pague abaixo para garantir.'
            : pending
              ? `${tenant.name} vai confirmar seu horário em breve.`
              : `Te esperamos, ${result.customerName.split(' ')[0]}!`}
        </motion.p>
      </div>
      {payment && (
        <div className="mt-8">
          <PrepaymentPanel
            token={result.token}
            payment={payment}
            timezone={tenant.timezone}
            tenantName={tenant.name}
            onChange={setPayment}
          />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-card shadow-soft mt-8 divide-y rounded-2xl border"
      >
        {[
          ['Serviço', result.serviceName],
          ['Data', capitalize(fmt(result.startsAt, tenant.timezone, "EEEE, dd 'de' MMMM"))],
          [
            'Horário',
            `${fmt(result.startsAt, tenant.timezone, 'HH:mm')} às ${fmt(result.endsAt, tenant.timezone, 'HH:mm')}`,
          ],
          ['Profissional', result.professionalName],
          ['Valor', formatPrice(result.priceCents, result.priceFrom)],
          ...(tenant.address
            ? [['Endereço', [tenant.address, tenant.city].filter(Boolean).join(' - ')]]
            : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      </motion.div>
      {result.series && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-primary-soft mt-4 rounded-2xl p-4 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <Repeat className="text-primary h-4 w-4" aria-hidden />
            Horário fixo: {everyWeekAt(new Date(result.startsAt), tenant.timezone)}
          </p>
          <p className="text-muted-foreground mt-1">
            {pending ? 'Pedido para as datas' : 'Reservado para'}{' '}
            {result.series.created.map((d) => fmt(d, tenant.timezone, 'dd/MM')).join(', ')}. As
            próximas semanas são reservadas sozinhas.
          </p>
          {result.series.skipped.length > 0 && (
            <p className="mt-2">
              <span className="font-medium">Não deu para reservar:</span>{' '}
              {result.series.skipped.map((d) => fmt(d, tenant.timezone, 'dd/MM')).join(', ')}{' '}
              <span className="text-muted-foreground">
                (folga, feriado ou horário ocupado). Combine essas datas direto com {tenant.name}.
              </span>
            </p>
          )}
        </motion.div>
      )}
      <div className="mt-6 grid gap-2">
        <Button size="lg" asChild>
          <a href={result.googleCalendarUrl} target="_blank" rel="noreferrer">
            <CalendarPlus /> Adicionar ao Google Agenda
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={result.icsUrl}>
            <Download /> Baixar arquivo .ics (iPhone/Outlook)
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a href={result.manageUrl}>
            <Link2 /> Cancelar ou remarcar
          </a>
        </Button>
      </div>
      {result.cancellationPolicy && (
        <p className="bg-muted text-muted-foreground mt-6 rounded-xl p-4 text-xs">
          {result.cancellationPolicy}
        </p>
      )}
      <p className="text-muted-foreground mt-6 text-center text-xs">
        Guarde o link “Cancelar ou remarcar”. Ele também foi enviado no seu WhatsApp, se disponível.
      </p>
    </div>
  )
}
