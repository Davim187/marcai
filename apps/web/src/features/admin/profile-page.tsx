import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Field } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { useRefreshSession, useSession } from '@/lib/session'

/** Perfil do administrador do sistema: dados e senha, sem depender de ter um negócio. */
export default function AdminProfilePage() {
  const { data: session } = useSession()
  const refresh = useRefreshSession()
  const user = session?.authenticated ? session.user : null
  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const saveName = useApiMutation(
    () => api('/account/profile', { method: 'PUT', body: { name, phone: user?.phone ?? '' } }),
    { success: 'Perfil atualizado', onSuccess: () => refresh() },
  )
  const changePassword = useApiMutation(
    () =>
      api('/auth/change-password', {
        body: { currentPassword: currentPassword || undefined, newPassword },
      }),
    {
      success: 'Senha alterada. As outras sessões foram encerradas.',
      onSuccess: () => {
        setCurrentPassword('')
        setNewPassword('')
      },
    },
  )

  if (!user) return null
  return (
    <div>
      <PageHeader title="Meu perfil" description="Seus dados de acesso como administrador." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Meu perfil
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Administrador do sistema
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                saveName.mutate()
              }}
            >
              <Field label="Nome" htmlFor="admin-name">
                <Input
                  id="admin-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="E-mail" htmlFor="admin-email">
                <Input id="admin-email" value={user.email} disabled />
              </Field>
              <Button type="submit" loading={saveName.isPending}>
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Alterar senha</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                changePassword.mutate()
              }}
            >
              {user.hasPassword && (
                <Field label="Senha atual" htmlFor="admin-current-pw">
                  <Input
                    id="admin-current-pw"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Field label="Nova senha (mínimo 8 caracteres)" htmlFor="admin-new-pw">
                <Input
                  id="admin-new-pw"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Button type="submit" loading={changePassword.isPending}>
                Alterar senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
