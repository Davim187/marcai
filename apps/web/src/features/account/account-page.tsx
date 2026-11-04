import { Download, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { PhoneInput } from '@/components/phone-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
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
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { useRefreshSession, useTenant } from '@/lib/session'
import { downloadBlob } from '@/lib/utils'

export default function AccountPage() {
  const { user } = useTenant()
  const refresh = useRefreshSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [profile, setProfile] = useState({
    name: user.name,
    phone: user.phone?.replace(/^55/, '') ?? '',
  })
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' })
  const [del, setDel] = useState({ open: false, password: '', confirm: '' })
  const saveProfile = useApiMutation(
    () => api('/account/profile', { method: 'PUT', body: profile }),
    { success: 'Dados salvos', onSuccess: () => refresh() },
  )
  const savePw = useApiMutation(() => api('/auth/change-password', { body: pw }), {
    success: 'Senha alterada',
    onSuccess: () => setPw({ currentPassword: '', newPassword: '' }),
  })
  const remove = useApiMutation(
    () => api('/account/delete', { body: { password: del.password, confirm: del.confirm } }),
    {
      success: 'Conta excluída. Sentiremos sua falta 💖',
      onSuccess: () => {
        qc.clear()
        navigate('/', { replace: true })
      },
    },
  )
  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nome" htmlFor="ac-name">
              <Input
                id="ac-name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </Field>
            <Field label="Celular" htmlFor="ac-phone">
              <PhoneInput
                id="ac-phone"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </Field>
            <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>
              Salvar
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{user.hasPassword ? 'Trocar senha' : 'Criar senha'}</CardTitle>
            {user.hasGoogle && <CardDescription>Você também entra com o Google.</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {user.hasPassword && (
              <Field label="Senha atual" htmlFor="ac-cur">
                <Input
                  id="ac-cur"
                  type="password"
                  autoComplete="current-password"
                  value={pw.currentPassword}
                  onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                />
              </Field>
            )}
            <Field label="Nova senha" htmlFor="ac-new" hint="Mínimo de 8 caracteres.">
              <Input
                id="ac-new"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              />
            </Field>
            <Button
              onClick={() => savePw.mutate()}
              loading={savePw.isPending}
              disabled={pw.newPassword.length < 8}
            >
              Salvar senha
            </Button>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Seus dados (LGPD)</CardTitle>
            <CardDescription>
              Você pode baixar uma cópia de todos os seus dados ou excluir sua conta a qualquer
              momento.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () =>
                downloadBlob(
                  JSON.stringify(await api('/account/export'), null, 2),
                  'meus-dados.json',
                  'application/json',
                )
              }
            >
              <Download /> Baixar meus dados
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDel({ ...del, open: true })}
            >
              <Trash2 /> Excluir minha conta
            </Button>
          </CardContent>
        </Card>
      </div>
      <Dialog open={del.open} onOpenChange={(open) => setDel({ ...del, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta?</DialogTitle>
            <DialogDescription>
              Se você for a única dona, o estabelecimento, a agenda, as clientes e o histórico são
              apagados para sempre e a assinatura é cancelada.
            </DialogDescription>
          </DialogHeader>
          {user.hasPassword && (
            <Field label="Sua senha" htmlFor="del-pw">
              <Input
                id="del-pw"
                type="password"
                value={del.password}
                onChange={(e) => setDel({ ...del, password: e.target.value })}
              />
            </Field>
          )}
          <Field label={'Digite EXCLUIR para confirmar'} htmlFor="del-c">
            <Input
              id="del-c"
              value={del.confirm}
              onChange={(e) => setDel({ ...del, confirm: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDel({ ...del, open: false })}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              loading={remove.isPending}
              disabled={del.confirm !== 'EXCLUIR'}
            >
              Excluir para sempre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
