import { useQuery } from '@tanstack/react-query'
import {
  KeyRound,
  Laptop,
  LogOut,
  MonitorSmartphone,
  MoreVertical,
  Pencil,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { askConfirm } from '@/components/confirm-host'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { deviceName, fmtLocal } from './admin-shared'

interface UserRow {
  id: string
  name: string
  email: string
  createdAt: string
  isSuperAdmin: boolean
  adminFromConfig: boolean
  disabledAt: string | null
  hasPassword: boolean
  hasGoogle: boolean
  activeSessions: number
  lastSeenAt: string | null
  online: boolean
  memberships: Array<{
    tenant: { id: string; name: string; slug: string }
    role: 'owner' | 'professional'
    pending: boolean
  }>
}
interface SessionRow {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  lastSeenAt: string
  impersonatorId: string | null
  current: boolean
}

const FILTERS = {
  all: 'Todos',
  online: 'Online agora',
  admins: 'Administradores',
  no_business: 'Sem negócio',
  disabled: 'Desativados',
} as const
type Filter = keyof typeof FILTERS

const ROLE = { owner: 'Dona', professional: 'Profissional' } as const
const INVALIDATE = [['admin-users'], ['admin-overview'], ['admin-sessions'], ['admin-audit']]

function lastSeen(u: UserRow) {
  if (u.online) return 'Agora'
  if (!u.lastSeenAt) return 'Sem sessão ativa'
  return fmtLocal(u.lastSeenAt)
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const meId = session?.authenticated ? session.user.id : null
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filtro') as Filter | null) ?? 'all'
  const [q, setQ] = useState('')
  const [sessionsOf, setSessionsOf] = useState<UserRow | null>(null)
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null)
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', q, filter],
    queryFn: () => api<UserRow[]>(`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}`),
  })

  const setAdmin = useApiMutation(
    (v: { id: string; value: boolean }) =>
      api(`/admin/users/${v.id}/super-admin`, { body: { value: v.value } }),
    { success: 'Acesso atualizado', invalidate: INVALIDATE },
  )
  const disable = useApiMutation(
    (v: { id: string; disabled: boolean }) =>
      api(`/admin/users/${v.id}/disable`, { body: { disabled: v.disabled } }),
    { success: 'Conta atualizada', invalidate: INVALIDATE },
  )
  const logoutAll = useApiMutation(
    (id: string) => api<{ count: number }>(`/admin/users/${id}/logout-all`, { method: 'POST' }),
    {
      success: (r) => (r.count ? `${r.count} sessão(ões) encerrada(s)` : 'Nenhuma sessão aberta'),
      invalidate: INVALIDATE,
    },
  )
  const resetLink = useApiMutation(
    (id: string) =>
      api<{ emailTransport: string }>(`/admin/users/${id}/password-reset`, { method: 'POST' }),
    {
      success: (r) =>
        r.emailTransport === 'log'
          ? 'Link gerado, mas o envio de e-mail não está configurado (veja Saúde do sistema)'
          : 'Link para criar nova senha enviado por e-mail',
      invalidate: [['admin-audit']],
    },
  )
  const remove = useApiMutation((id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }), {
    success: 'Conta excluída',
    invalidate: INVALIDATE,
  })

  async function confirmThen(opts: Parameters<typeof askConfirm>[0], run: () => void) {
    if (await askConfirm(opts)) run()
  }

  return (
    <div>
      <PageHeader
        title="Usuários e acessos"
        description="Todas as contas do sistema: quem está online, quem administra e quem tem acesso."
        actions={
          <Button onClick={() => setEditing('new')}>
            <UserPlus /> Novo usuário
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                className="h-10 pl-9"
                placeholder="Buscar por nome ou e-mail"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar usuário"
              />
            </div>
            <NativeSelect
              className="h-10 sm:w-48"
              value={filter}
              onChange={(e) =>
                setParams(e.target.value === 'all' ? {} : { filtro: e.target.value })
              }
              aria-label="Filtro"
            >
              {Object.entries(FILTERS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : !users?.length ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Nenhum usuário encontrado.
              </p>
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-2">Usuário</th>
                    <th>Negócios</th>
                    <th>Acesso</th>
                    <th>Último acesso</th>
                    <th>Criado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => {
                    const isMe = u.id === meId
                    return (
                      <tr key={u.id} className={u.disabledAt ? 'opacity-60' : undefined}>
                        <td className="py-2.5">
                          <p className="flex items-center gap-1.5 font-semibold">
                            {u.online && (
                              <span
                                className="bg-green inline-block h-2 w-2 rounded-full"
                                title="Online agora"
                                aria-label="Online agora"
                              />
                            )}
                            {u.name}
                            {isMe && (
                              <span className="text-muted-foreground font-normal">(você)</span>
                            )}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {u.email}
                            {u.hasGoogle && ' · Google'}
                          </p>
                        </td>
                        <td className="text-xs">
                          {u.memberships.length ? (
                            u.memberships.map((m) => (
                              <p key={m.tenant.id}>
                                {m.tenant.name}{' '}
                                <span className="text-muted-foreground">
                                  · {ROLE[m.role]}
                                  {m.pending && ' (convite pendente)'}
                                </span>
                              </p>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="space-x-1">
                          {u.disabledAt ? (
                            <Badge variant="destructive">Desativado</Badge>
                          ) : (
                            <Badge variant="success">Ativo</Badge>
                          )}
                          {u.isSuperAdmin && (
                            <Badge variant="secondary" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </Badge>
                          )}
                        </td>
                        <td className="text-xs">
                          <p>{lastSeen(u)}</p>
                          {u.activeSessions > 0 && (
                            <p className="text-muted-foreground">
                              {u.activeSessions}{' '}
                              {u.activeSessions > 1 ? 'sessões ativas' : 'sessão ativa'}
                            </p>
                          )}
                        </td>
                        <td className="text-xs">{fmtLocal(u.createdAt, 'dd/MM/yy')}</td>
                        <td className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Ações">
                                <MoreVertical />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(u)}>
                                <Pencil /> Editar dados
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setSessionsOf(u)}>
                                <MonitorSmartphone /> Ver sessões
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  confirmThen(
                                    {
                                      title: `Enviar a ${u.name} um link para criar nova senha?`,
                                      description: `O e-mail vai para ${u.email}. O link vale por 1 hora.`,
                                      confirmLabel: 'Enviar link',
                                    },
                                    () => resetLink.mutate(u.id),
                                  )
                                }
                              >
                                <KeyRound /> Enviar link de nova senha
                              </DropdownMenuItem>
                              {!isMe && (
                                <>
                                  <DropdownMenuItem
                                    disabled={!u.activeSessions}
                                    onSelect={() =>
                                      confirmThen(
                                        {
                                          title: `Desconectar ${u.name} de todos os aparelhos?`,
                                          description: 'A pessoa vai precisar entrar de novo.',
                                          confirmLabel: 'Desconectar',
                                        },
                                        () => logoutAll.mutate(u.id),
                                      )
                                    }
                                  >
                                    <LogOut /> Desconectar de tudo
                                  </DropdownMenuItem>
                                  {!u.adminFromConfig && (
                                    <DropdownMenuItem
                                      disabled={!!u.disabledAt && !u.isSuperAdmin}
                                      onSelect={() =>
                                        confirmThen(
                                          u.isSuperAdmin
                                            ? {
                                                title: `Remover o acesso de administrador de ${u.name}?`,
                                                confirmLabel: 'Remover acesso',
                                              }
                                            : {
                                                title: `Tornar ${u.name} administrador do sistema?`,
                                                description:
                                                  'Administradores veem todos os estabelecimentos e usuários, podem bloquear contas e entrar como qualquer negócio.',
                                                confirmLabel: 'Tornar admin',
                                              },
                                          () =>
                                            setAdmin.mutate({ id: u.id, value: !u.isSuperAdmin }),
                                        )
                                      }
                                    >
                                      {u.isSuperAdmin ? <ShieldOff /> : <ShieldCheck />}
                                      {u.isSuperAdmin ? 'Remover admin' : 'Tornar admin'}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      confirmThen(
                                        u.disabledAt
                                          ? {
                                              title: `Reativar a conta de ${u.name}?`,
                                              confirmLabel: 'Reativar',
                                            }
                                          : {
                                              title: `Desativar a conta de ${u.name}?`,
                                              description:
                                                'A pessoa é desconectada na hora e não consegue mais entrar até você reativar. Nada é apagado.',
                                              confirmLabel: 'Desativar conta',
                                            },
                                        () => disable.mutate({ id: u.id, disabled: !u.disabledAt }),
                                      )
                                    }
                                  >
                                    {u.disabledAt ? <UserCheck /> : <UserX />}
                                    {u.disabledAt ? 'Reativar conta' : 'Desativar conta'}
                                  </DropdownMenuItem>
                                  {!u.adminFromConfig && (
                                    <DropdownMenuItem
                                      destructive
                                      onSelect={() =>
                                        confirmThen(
                                          {
                                            title: `Excluir a conta de ${u.name} para sempre?`,
                                            description:
                                              'A conta, as sessões e os vínculos com equipes são apagados. Não dá para desfazer. Se ela for a única dona de um estabelecimento, exclua o estabelecimento antes.',
                                            confirmLabel: 'Excluir conta',
                                          },
                                          () => remove.mutate(u.id),
                                        )
                                      }
                                    >
                                      <Trash2 /> Excluir conta
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            “Online agora” = usou o sistema nos últimos 15 minutos. Desativar desconecta na hora e
            impede novos logins sem apagar nada. Toda ação fica na Auditoria.
          </p>
        </CardContent>
      </Card>
      <SessionsDialog user={sessionsOf} onClose={() => setSessionsOf(null)} />
      {editing && <UserFormDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function UserFormDialog({ user, onClose }: { user: UserRow | 'new'; onClose: () => void }) {
  const isNew = user === 'new'
  const [name, setName] = useState(isNew ? '' : user.name)
  const [email, setEmail] = useState(isNew ? '' : user.email)
  const [password, setPassword] = useState('')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const save = useApiMutation(
    () =>
      isNew
        ? api('/admin/users', { body: { name, email, password, isSuperAdmin: makeAdmin } })
        : api(`/admin/users/${user.id}`, { method: 'PATCH', body: { name, email } }),
    {
      success: isNew ? 'Usuário criado' : 'Dados atualizados',
      invalidate: INVALIDATE,
      onSuccess: onClose,
    },
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo usuário' : `Editar ${user.name}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Nome" htmlFor="u-name">
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </Field>
          <Field label="E-mail" htmlFor="u-email">
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {isNew && (
            <>
              <Field label="Senha inicial (mínimo 8 caracteres)" htmlFor="u-pw">
                <Input
                  id="u-pw"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={makeAdmin} onCheckedChange={(v) => setMakeAdmin(v === true)} />
                Administrador do sistema
              </label>
              <p className="text-muted-foreground text-xs">
                Passe a senha para a pessoa por um canal seguro e peça para trocar no primeiro
                acesso. Sem negócio, ela entra direto no cadastro do negócio (ou aqui, se for
                admin).
              </p>
            </>
          )}
          <DialogFooter>
            <Button type="submit" loading={save.isPending}>
              {isNew ? 'Criar usuário' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SessionsDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['admin-sessions', user?.id],
    queryFn: () => api<SessionRow[]>(`/admin/users/${user!.id}/sessions`),
    enabled: !!user,
  })
  const revoke = useApiMutation(
    (id: string) => api(`/admin/sessions/${id}`, { method: 'DELETE' }),
    { success: 'Sessão encerrada', invalidate: INVALIDATE },
  )
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sessões de {user?.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !sessions?.length ? (
          <p className="text-muted-foreground py-4 text-sm">Nenhuma sessão aberta.</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Laptop className="text-muted-foreground h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {deviceName(s.userAgent)}
                    {s.current && <span className="text-primary"> · esta sessão</span>}
                    {s.impersonatorId && (
                      <span className="text-muted-foreground"> · suporte (entrar como)</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Último uso {fmtLocal(s.lastSeenAt)}
                    {s.ip && ` · IP ${s.ip}`}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(s.id)}
                    loading={revoke.isPending && revoke.variables === s.id}
                  >
                    Encerrar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
