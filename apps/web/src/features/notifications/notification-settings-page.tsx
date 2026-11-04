import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCircle2, Lock, MessageCircle, RotateCcw, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import type { NotificationSettingsInput } from '@marcai/shared'
import { PhoneInput } from '@/components/phone-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { SwitchRow } from '@/components/ui/switch'
import { api, errorMessage } from '@/lib/api'
import { useApiMutation, qk } from '@/lib/queries'
import { useRefreshSession, useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'
import { currentPushSubscription, disablePush, enablePush, pushSupported } from './push'

interface Settings {
  inApp: boolean
  push: boolean
  email: boolean
  whatsappProfessional: boolean
  whatsappCustomer: boolean
  sound: boolean
  notifyPhone: string | null
  features: { whatsapp: boolean }
  pushConfig: { enabled: boolean; publicKey: string | null }
  whatsapp: { provider: string; perTenantNumber: boolean; status: string; phone: string | null }
}
interface Template {
  key: string
  title: string
  audience: string
  description: string
  variables: string[]
  body: string
  isDefault: boolean
  defaultBody: string
}

export default function NotificationSettingsPage() {
  const { tenant } = useTenant()
  const isOwner = tenant.role === 'owner'
  const refresh = useRefreshSession()
  const { data, isLoading } = useQuery({
    queryKey: qk.notificationSettings,
    queryFn: () => api<Settings>('/notifications/settings'),
  })
  const [v, setV] = useState<NotificationSettingsInput | null>(null)
  useEffect(() => {
    if (data)
      setV({
        inApp: data.inApp,
        push: data.push,
        email: data.email,
        whatsappProfessional: data.whatsappProfessional,
        whatsappCustomer: data.whatsappCustomer,
        sound: data.sound,
        notifyPhone: data.notifyPhone?.replace(/^55/, '') ?? '',
      })
  }, [data])
  const save = useApiMutation(() => api('/notifications/settings', { method: 'PUT', body: v }), {
    success: 'Preferências salvas',
    invalidate: [qk.notificationSettings],
    onSuccess: () => refresh(),
  })

  if (isLoading || !v || !data) return <Skeleton className="h-96" />
  const set = (k: keyof NotificationSettingsInput, val: boolean | string) =>
    setV({ ...v, [k]: val })
  const pro = data.features.whatsapp
  const proBadge = !pro && (
    <Badge variant="outline" className="gap-1">
      <Lock className="h-3 w-3" /> Pro
    </Badge>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Como você e suas clientes ficam sabendo de cada agendamento."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Avisos para você</CardTitle>
            <CardDescription>Quando uma cliente agenda, cancela ou remarca.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SwitchRow
              id="inapp"
              label="No painel (sino)"
              description="Aparece na hora, com contador de não lidos."
              checked={v.inApp}
              onCheckedChange={(c) => set('inApp', c)}
              disabled={!isOwner}
            />
            <SwitchRow
              id="sound"
              label="Tocar um som"
              description="Enquanto o painel estiver aberto."
              checked={v.sound}
              onCheckedChange={(c) => set('sound', c)}
              disabled={!isOwner}
            />
            <SwitchRow
              id="push"
              label="Notificação no celular"
              description="Mesmo com o app fechado. Ative em cada aparelho abaixo."
              checked={v.push}
              onCheckedChange={(c) => set('push', c)}
              disabled={!isOwner}
            />
            <SwitchRow
              id="wapro"
              label="No meu WhatsApp"
              description="Mensagem completa com os dados e as respostas do formulário."
              badge={proBadge}
              checked={pro && v.whatsappProfessional}
              onCheckedChange={(c) => set('whatsappProfessional', c)}
              disabled={!pro || !isOwner}
            />
            <SwitchRow
              id="email"
              label="Por e-mail"
              description="Usado quando o WhatsApp não está disponível."
              checked={v.email}
              onCheckedChange={(c) => set('email', c)}
              disabled={!isOwner}
            />
            {pro && v.whatsappProfessional && (
              <div className="pt-3">
                <Field label="WhatsApp que recebe os avisos" htmlFor="notifyPhone">
                  <PhoneInput
                    id="notifyPhone"
                    value={v.notifyPhone ?? ''}
                    onChange={(e) => set('notifyPhone', e.target.value)}
                    disabled={!isOwner}
                  />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mensagens para a cliente</CardTitle>
              <CardDescription>
                Confirmação logo após agendar e lembrete antes do horário.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              <SwitchRow
                id="wacli"
                label="Confirmação e lembrete no WhatsApp"
                description="Com links para confirmar presença ou remarcar. Diminui muito as faltas."
                badge={proBadge}
                checked={pro && v.whatsappCustomer}
                onCheckedChange={(c) => set('whatsappCustomer', c)}
                disabled={!pro || !isOwner}
              />
              {!pro && (
                <div className="pt-3">
                  <Button asChild variant="soft" className="w-full">
                    <Link to="/painel/assinatura">Liberar WhatsApp com o plano Pro</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <PushDeviceCard settings={data} />
        </div>
      </div>
      {isOwner && (
        <div className="flex justify-end">
          <Button size="lg" onClick={() => save.mutate()} loading={save.isPending}>
            Salvar preferências
          </Button>
        </div>
      )}
      {pro && isOwner && <WhatsAppCard settings={data} />}
      <TemplatesCard canEdit={isOwner} />
    </div>
  )
}

function PushDeviceCard({ settings }: { settings: Settings }) {
  const [active, setActive] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    currentPushSubscription()
      .then((s) => setActive(!!s))
      .catch(() => setActive(false))
  }, [])
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="text-primary h-4 w-4" /> Este aparelho
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!settings.pushConfig.enabled ? (
          <p className="text-muted-foreground">
            As notificações push ainda não foram configuradas no servidor (chaves VAPID).
          </p>
        ) : !pushSupported() ? (
          <p className="text-muted-foreground">
            Este navegador não suporta notificações. No iPhone, toque em Compartilhar → “Adicionar à
            Tela de Início” e abra o Marcaí por lá.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {active
                ? 'Este aparelho recebe as notificações. 🎉'
                : 'Ative para receber os avisos neste celular ou computador.'}
            </p>
            <div className="flex gap-2">
              {active ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await api('/notifications/push/test', { method: 'POST' })
                      toast.success('Enviamos uma notificação de teste')
                    }}
                  >
                    <BellRing /> Testar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await disablePush()
                      setActive(false)
                    }}
                  >
                    Desativar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await enablePush(settings.pushConfig.publicKey!)
                      setActive(true)
                      toast.success('Notificações ativadas neste aparelho')
                    } catch (err) {
                      toast.error(errorMessage(err))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <BellRing /> Ativar notificações aqui
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function WhatsAppCard({ settings }: { settings: Settings }) {
  const qc = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const status = settings.whatsapp.status
  // Enquanto o QR está aberto, verifica a conexão a cada 3s
  useEffect(() => {
    if (!qr) return
    const t = setInterval(async () => {
      const r = await api<{ status: string }>('/notifications/whatsapp/status').catch(() => null)
      if (r?.status === 'connected') {
        setQr(null)
        toast.success('WhatsApp conectado! 🎉')
        qc.invalidateQueries({ queryKey: qk.notificationSettings })
      }
    }, 3000)
    return () => clearInterval(t)
  }, [qr, qc])
  const disconnect = useApiMutation(
    () => api('/notifications/whatsapp/disconnect', { method: 'POST' }),
    { success: 'WhatsApp desconectado', invalidate: [qk.notificationSettings] },
  )
  const test = useApiMutation(() => api('/notifications/whatsapp/test', { method: 'POST' }), {
    success: 'Mensagem de teste enviada',
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="text-primary h-4 w-4" /> Conexão do WhatsApp
        </CardTitle>
        <CardDescription>
          {settings.whatsapp.perTenantNumber
            ? 'As mensagens para as clientes saem do seu número. Conecte lendo o QR Code, como no WhatsApp Web.'
            : 'As mensagens saem do número oficial verificado da plataforma.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              status === 'connected'
                ? 'bg-success'
                : status === 'connecting'
                  ? 'bg-warning'
                  : 'bg-muted-foreground/40',
            )}
          />
          {status === 'connected' ? (
            <span className="font-medium">
              Conectado {settings.whatsapp.phone && `(${settings.whatsapp.phone})`}
            </span>
          ) : status === 'connecting' ? (
            'Aguardando leitura do QR Code'
          ) : (
            'Desconectado'
          )}
          {settings.whatsapp.provider === 'console' && <Badge variant="muted">modo de teste</Badge>}
        </div>
        <div className="flex gap-2">
          {status === 'connected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => test.mutate()}
              loading={test.isPending}
            >
              Enviar teste
            </Button>
          )}
          {settings.whatsapp.perTenantNumber &&
            (status === 'connected' ? (
              <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()}>
                Desconectar
              </Button>
            ) : (
              <Button
                size="sm"
                loading={connecting}
                onClick={async () => {
                  setConnecting(true)
                  try {
                    const r = await api<{ status: string; qrCode?: string }>(
                      '/notifications/whatsapp/connect',
                      { method: 'POST' },
                    )
                    if (r.qrCode) setQr(r.qrCode)
                    else qc.invalidateQueries({ queryKey: qk.notificationSettings })
                  } catch (err) {
                    toast.error(errorMessage(err))
                  } finally {
                    setConnecting(false)
                  }
                }}
              >
                Conectar WhatsApp
              </Button>
            ))}
        </div>
      </CardContent>
      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conecte seu WhatsApp</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho, e
              aponte para o código.
            </DialogDescription>
          </DialogHeader>
          {qr && (
            <img
              src={qr}
              alt="QR Code para conectar o WhatsApp"
              className="mx-auto w-64 rounded-xl border bg-white p-2"
            />
          )}
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 animate-pulse" /> Esperando a leitura…
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TemplatesCard({ canEdit }: { canEdit: boolean }) {
  const { data: templates } = useQuery({
    queryKey: qk.templates,
    queryFn: () => api<Template[]>('/notifications/templates'),
  })
  const [selected, setSelected] = useState<string | null>(null)
  const current = templates?.find((t) => t.key === selected) ?? templates?.[0]
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (current) setBody(current.body)
  }, [current])
  useEffect(() => {
    if (!body) return
    const t = setTimeout(
      () =>
        api<{ text: string }>('/notifications/templates/preview', { body: { body } })
          .then((r) => setPreview(r.text))
          .catch(() => undefined),
      250,
    )
    return () => clearTimeout(t)
  }, [body])
  const save = useApiMutation(
    () => api('/notifications/templates', { method: 'PUT', body: { key: current!.key, body } }),
    { success: 'Mensagem salva', invalidate: [qk.templates] },
  )
  const reset = useApiMutation(
    () => api(`/notifications/templates/${current!.key}`, { method: 'DELETE' }),
    { success: 'Texto padrão restaurado', invalidate: [qk.templates] },
  )
  if (!templates || !current) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Textos das mensagens</CardTitle>
        <CardDescription>
          Use as variáveis entre chaves. A pré-visualização mostra um exemplo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[220px_1fr_1fr]">
        <nav
          className="scrollbar-none flex gap-2 overflow-x-auto lg:flex-col"
          aria-label="Mensagens"
        >
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelected(t.key)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm',
                current.key === t.key
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'hover:bg-muted',
              )}
            >
              {t.title}
              <span className="text-muted-foreground block text-xs font-normal">
                {t.audience === 'cliente' ? 'Para a cliente' : 'Para você'}
                {!t.isDefault && ' · editado'}
              </span>
            </button>
          ))}
        </nav>
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">{current.description}</p>
          <Textarea
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!canEdit}
            className="font-mono text-xs"
            aria-label="Texto da mensagem"
          />
          <div className="flex flex-wrap gap-1.5">
            {current.variables.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!canEdit}
                onClick={() => setBody((b) => `${b}{${v}}`)}
                className="bg-muted/50 hover:border-primary rounded-md border px-2 py-0.5 font-mono text-xs"
              >{`{${v}}`}</button>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                disabled={body === current.body}
              >
                Salvar
              </Button>
              {!current.isDefault && (
                <Button variant="ghost" onClick={() => reset.mutate()}>
                  <RotateCcw /> Restaurar padrão
                </Button>
              )}
            </div>
          )}
        </div>
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Pré-visualização
          </p>
          <div className="rounded-2xl bg-[#e2e8f0] p-3 dark:bg-[#1e293b]">
            <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[#dcf8c6] p-3 text-sm text-[#111] shadow-sm dark:bg-[#005c4b] dark:text-white">
              {preview}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
