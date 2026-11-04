import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { BookingRulesInput } from '@marcai/shared'
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
                {[
                  [0, 'Sem mínimo'],
                  [30, '30 minutos'],
                  [60, '1 hora'],
                  [120, '2 horas'],
                  [180, '3 horas'],
                  [360, '6 horas'],
                  [720, '12 horas'],
                  [1440, '1 dia'],
                  [2880, '2 dias'],
                ].map(([m, l]) => (
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
                {[7, 14, 21, 30, 45, 60, 90, 180].map((d) => (
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
                {[10, 15, 20, 30, 45, 60].map((m) => (
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
                {[2, 3, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} horas antes
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
