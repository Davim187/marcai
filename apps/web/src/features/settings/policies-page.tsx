import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  type BookingRulesInput,
  PREPAYMENT_METHOD_LABELS,
  type PrepaymentMethod,
} from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { SwitchRow } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useApiMutation } from '@/lib/queries'

export interface TenantFull extends BookingRulesInput {
  id: string
  slug: string
  name: string
  bio: string | null
  address: string | null
  city: string | null
  instagram: string | null
  whatsapp: string | null
  primaryColor: string
  logoUrl: string | null
  coverUrl: string | null
  faviconUrl: string | null
  timezone: string
  publicUrl: string
  notifyInApp: boolean
  notifyPush: boolean
  notifyEmail: boolean
  notifyWhatsappProfessional: boolean
  notifyWhatsappCustomer: boolean
  notifySound: boolean
  notifyPhone: string | null
  requirePrepayment: boolean
  prepaymentPercent: number
  prepaymentMethod: PrepaymentMethod
  prepaymentHoldMinutes: number
  pixKey: string | null
  pixKeyHolder: string | null
  mpConnected: boolean
  mpAccountLabel: string | null
}

export const useTenantFull = () =>
  useQuery({ queryKey: qk.tenant, queryFn: () => api<TenantFull>('/tenant') })

export default function PoliciesPage() {
  const { data } = useTenantFull()
  const [v, setV] = useState<BookingRulesInput | null>(null)
  useEffect(() => {
    if (data)
      setV({
        minAdvanceMinutes: data.minAdvanceMinutes,
        maxAdvanceDays: data.maxAdvanceDays,
        slotIntervalMinutes: data.slotIntervalMinutes,
        cancelMinHours: data.cancelMinHours,
        cancellationPolicy: data.cancellationPolicy ?? '',
        requireConfirmation: data.requireConfirmation,
        reminderHours: data.reminderHours,
        dailySummaryEnabled: data.dailySummaryEnabled,
        loadHolidays: data.loadHolidays,
        requirePrepayment: data.requirePrepayment,
        prepaymentPercent: data.prepaymentPercent,
        prepaymentMethod: data.prepaymentMethod,
        prepaymentHoldMinutes: data.prepaymentHoldMinutes,
        pixKey: data.pixKey ?? '',
        pixKeyHolder: data.pixKeyHolder ?? '',
      })
  }, [data])
  // Texto digitado no campo de horas (campo vazio ou "e" não pode virar 0 em silêncio)
  const [cancelText, setCancelText] = useState<string | null>(null)
  const cancelValue = cancelText ?? String(v?.cancelMinHours ?? '')
  const cancelError = !/^\d+$/.test(cancelValue)
    ? 'Informe um número inteiro de horas (0 = até o horário)'
    : Number(cancelValue) > 336
      ? 'O máximo é 336 horas (14 dias)'
      : undefined
  const save = useApiMutation(() => api('/tenant/booking-rules', { method: 'PUT', body: v }), {
    success: 'Regras salvas',
    invalidate: [qk.tenant, ['schedule']],
  })
  if (!v) return <Skeleton className="h-96" />
  const set = <K extends keyof BookingRulesInput>(k: K, val: BookingRulesInput[K]) =>
    setV({ ...v, [k]: val })

  return (
    <div>
      <PageHeader
        title="Regras e políticas"
        description="Como e quando suas clientes podem agendar, cancelar e remarcar."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agendamento online</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Antecedência mínima"
              htmlFor="min"
              hint="Evita marcações em cima da hora."
            >
              <NativeSelect
                id="min"
                value={v.minAdvanceMinutes}
                onChange={(e) => set('minAdvanceMinutes', Number(e.target.value))}
              >
                {withCurrentLabeled(
                  [
                    [0, 'Sem mínimo'],
                    [30, '30 minutos'],
                    [60, '1 hora'],
                    [120, '2 horas'],
                    [180, '3 horas'],
                    [360, '6 horas'],
                    [720, '12 horas'],
                    [1440, '1 dia'],
                    [2880, '2 dias'],
                  ],
                  v.minAdvanceMinutes,
                ).map(([m, l]) => (
                  <option key={m} value={m}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Até quantos dias à frente" htmlFor="max">
              <NativeSelect
                id="max"
                value={v.maxAdvanceDays}
                onChange={(e) => set('maxAdvanceDays', Number(e.target.value))}
              >
                {withCurrent([7, 14, 21, 30, 45, 60, 90, 180], v.maxAdvanceDays).map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Intervalo entre opções de horário"
              htmlFor="slot"
              hint="De quanto em quanto tempo os horários aparecem para a cliente."
            >
              <NativeSelect
                id="slot"
                value={v.slotIntervalMinutes}
                onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}
              >
                {withCurrent([10, 15, 20, 30, 45, 60], v.slotIntervalMinutes).map((m) => (
                  <option key={m} value={m}>
                    A cada {m} minutos
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <SwitchRow
              id="confirm"
              label="Confirmar manualmente cada agendamento"
              description="Os agendamentos chegam como “pendente” até você confirmar. O horário fica reservado mesmo assim."
              checked={v.requireConfirmation}
              onCheckedChange={(c) => set('requireConfirmation', c)}
            />
            <SwitchRow
              id="prepay"
              label="Recebe antecipado"
              description="A cliente paga um sinal para reservar. O horário só é confirmado depois do pagamento."
              checked={!!v.requirePrepayment}
              onCheckedChange={(c) => set('requirePrepayment', c)}
            />
            {v.requirePrepayment && (
              <PrepaymentFields
                v={v}
                set={set}
                mpConnected={!!data?.mpConnected}
                mpAccountLabel={data?.mpAccountLabel ?? null}
              />
            )}
            <SwitchRow
              id="hol"
              label="Fechar nos feriados nacionais"
              checked={v.loadHolidays}
              onCheckedChange={(c) => set('loadHolidays', c)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cancelamento e remarcação</CardTitle>
            <CardDescription>
              A cliente cancela ou remarca sozinha pelo link da confirmação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              error={cancelError}
              label="Até quantas horas antes"
              htmlFor="cancel"
              hint="Depois disso, só falando com você."
            >
              <Input
                id="cancel"
                type="number"
                min={0}
                max={336}
                inputMode="numeric"
                aria-invalid={!!cancelError}
                value={cancelValue}
                onChange={(e) => {
                  setCancelText(e.target.value)
                  if (/^\d+$/.test(e.target.value)) set('cancelMinHours', Number(e.target.value))
                }}
              />
            </Field>
            <Field
              label="Texto da política"
              htmlFor="policy"
              hint="Aparece na confirmação do agendamento."
            >
              <Textarea
                id="policy"
                rows={5}
                value={v.cancellationPolicy ?? ''}
                onChange={(e) => set('cancellationPolicy', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lembretes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Enviar lembrete para a cliente"
              htmlFor="rem"
              hint="Pelo WhatsApp (plano Pro), com botões para confirmar ou remarcar."
            >
              <NativeSelect
                id="rem"
                value={v.reminderHours}
                onChange={(e) => set('reminderHours', Number(e.target.value))}
              >
                {withCurrent([2, 3, 6, 12, 24, 48], v.reminderHours).map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? 'hora' : 'horas'} antes
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <SwitchRow
              id="daily"
              label="Resumo diário às 07:00"
              description="Receba a agenda do dia logo cedo."
              checked={v.dailySummaryEnabled}
              onCheckedChange={(c) => set('dailySummaryEnabled', c)}
            />
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-20 mt-6 flex justify-end lg:bottom-4">
        <Button
          size="lg"
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!!cancelError}
          className="shadow-lift"
        >
          Salvar regras
        </Button>
      </div>
    </div>
  )
}

type SetRule = <K extends keyof BookingRulesInput>(k: K, val: BookingRulesInput[K]) => void

/** Sinal antecipado: quanto (50% ou 100%), como recebe e por quanto tempo segura o horário. */
function PrepaymentFields({
  v,
  set,
  mpConnected,
  mpAccountLabel,
}: {
  v: BookingRulesInput
  set: SetRule
  mpConnected: boolean
  mpAccountLabel: string | null
}) {
  return (
    <div className="border-border bg-muted/40 space-y-4 rounded-lg border p-4">
      <Field label="Quanto a cliente paga antes" htmlFor="prepay-percent">
        <div id="prepay-percent" role="radiogroup" className="grid grid-cols-2 gap-2">
          {[50, 100].map((p) => (
            <Button
              key={p}
              type="button"
              role="radio"
              aria-checked={v.prepaymentPercent === p}
              variant={v.prepaymentPercent === p ? 'default' : 'outline'}
              onClick={() => set('prepaymentPercent', p)}
            >
              {p}% {p === 50 ? 'de sinal' : '(valor total)'}
            </Button>
          ))}
        </div>
      </Field>
      <Field label="Como você recebe" htmlFor="prepay-method">
        <NativeSelect
          id="prepay-method"
          value={v.prepaymentMethod}
          onChange={(e) => set('prepaymentMethod', e.target.value as PrepaymentMethod)}
        >
          {(Object.keys(PREPAYMENT_METHOD_LABELS) as PrepaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {PREPAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {v.prepaymentMethod === 'pix_manual' ? (
        <>
          <Field
            label="Chave PIX"
            htmlFor="pix-key"
            hint="CPF, CNPJ, e-mail, chave aleatória ou celular com +55 (ex.: +5585999998888)."
          >
            <Input
              id="pix-key"
              value={v.pixKey ?? ''}
              maxLength={120}
              onChange={(e) => set('pixKey', e.target.value)}
            />
          </Field>
          <Field
            label="Nome de quem recebe"
            htmlFor="pix-holder"
            hint="A cliente confere esse nome no app do banco antes de pagar."
          >
            <Input
              id="pix-holder"
              value={v.pixKeyHolder ?? ''}
              maxLength={80}
              onChange={(e) => set('pixKeyHolder', e.target.value)}
            />
          </Field>
          <p className="text-muted-foreground text-sm">
            A cliente paga pelo PIX e anexa o comprovante. Você recebe o aviso, abre o comprovante
            no agendamento e aprova ou recusa.
          </p>
        </>
      ) : (
        <MercadoPagoConnect connected={mpConnected} label={mpAccountLabel} />
      )}
      <Field
        label="Tempo para pagar"
        htmlFor="prepay-hold"
        hint="O horário fica reservado esse tempo. Sem pagamento (ou comprovante), é liberado sozinho."
      >
        <NativeSelect
          id="prepay-hold"
          value={v.prepaymentHoldMinutes}
          onChange={(e) => set('prepaymentHoldMinutes', Number(e.target.value))}
        >
          {withCurrentLabeled(
            [
              [15, '15 minutos'],
              [30, '30 minutos'],
              [60, '1 hora'],
              [120, '2 horas'],
              [360, '6 horas'],
              [720, '12 horas'],
              [1440, '24 horas'],
            ],
            v.prepaymentHoldMinutes ?? 30,
          ).map(([m, l]) => (
            <option key={m} value={m}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}

/** Conecta a conta do Mercado Pago do estabelecimento colando o Access Token de produção. */
function MercadoPagoConnect({ connected, label }: { connected: boolean; label: string | null }) {
  const [token, setToken] = useState('')
  const connect = useApiMutation(
    () => api('/tenant/mercadopago', { method: 'PUT', body: { accessToken: token.trim() } }),
    { success: 'Mercado Pago conectado', invalidate: [qk.tenant], onSuccess: () => setToken('') },
  )
  const disconnect = useApiMutation(() => api('/tenant/mercadopago', { method: 'DELETE' }), {
    success: 'Mercado Pago desconectado',
    invalidate: [qk.tenant],
  })
  if (connected)
    return (
      <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <p className="font-medium">Mercado Pago conectado</p>
          <p className="text-muted-foreground">
            {label ?? 'Conta conectada'} · o sinal cai direto na sua conta e o horário confirma
            sozinho quando a cliente paga.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          Desconectar
        </Button>
      </div>
    )
  return (
    <Field
      label="Access Token do Mercado Pago"
      htmlFor="mp-token"
      hint="No Mercado Pago: Seu negócio → Configurações → Credenciais de produção → Access Token (começa com APP_USR-)."
    >
      <div className="flex gap-2">
        <Input
          id="mp-token"
          type="password"
          autoComplete="off"
          placeholder="APP_USR-..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Button
          type="button"
          loading={connect.isPending}
          disabled={token.trim().length < 20}
          onClick={() => connect.mutate()}
        >
          Conectar
        </Button>
      </div>
    </Field>
  )
}

/** Opções do select incluindo o valor salvo (mesmo que fora da lista padrão). */
function withCurrent(options: number[], current: number) {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b)
}

function withCurrentLabeled(options: Array<[number, string]>, current: number) {
  return options.some(([m]) => m === current)
    ? options
    : [...options, [current, `${current} minutos`] as [number, string]].sort((a, b) => a[0] - b[0])
}
