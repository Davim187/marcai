import { useQuery } from '@tanstack/react-query'
import { MoreVertical, Pencil, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { ImageUpload } from '@/components/image-upload'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { SwitchRow } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useApiMutation, useProfessionals, useServices } from '@/lib/queries'
import type { Professional } from '@/lib/types'

interface Member {
  id: string
  role: 'owner' | 'professional'
  user: { id: string; name: string; email: string }
  professional: { id: string; name: string } | null
}

export default function TeamPage() {
  const { data: professionals = [] } = useProfessionals()
  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<Member[]>('/team/members'),
  })
  const [editing, setEditing] = useState<Professional | 'new' | null>(null)
  const [inviting, setInviting] = useState(false)
  const removePro = useApiMutation(
    (id: string) => api(`/team/professionals/${id}`, { method: 'DELETE' }),
    { success: 'Profissional removida', invalidate: [qk.professionals] },
  )
  const removeMember = useApiMutation(
    (id: string) => api(`/team/members/${id}`, { method: 'DELETE' }),
    { success: 'Acesso removido', invalidate: [['members']] },
  )
  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Cada profissional tem a própria agenda, serviços e expediente."
        actions={
          <>
            <Button variant="outline" onClick={() => setInviting(true)}>
              <UserPlus /> Dar acesso ao painel
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Profissional
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Profissionais</CardTitle>
          <CardDescription>
            Com mais de uma, a cliente escolhe com quem quer agendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {professionals.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <Avatar name={p.name} src={p.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {p.name}
                  {!p.active && <Badge variant="muted">Inativa</Badge>}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {p.serviceIds?.length ?? 0} serviço(s){p.member && ` · acesso: ${p.member.email}`}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Opções de ${p.name}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(p)}>
                    <Pencil /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => removePro.mutate(p.id)}>
                    <Trash2 /> Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="text-primary h-4 w-4" /> Acesso ao painel
          </CardTitle>
          <CardDescription>
            <strong>Dona:</strong> acesso total. <strong>Profissional:</strong> vê e gerencia só a
            própria agenda.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="flex-1">
                <p className="font-semibold">{m.user.name}</p>
                <p className="text-muted-foreground">{m.user.email}</p>
              </div>
              <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>
                {m.role === 'owner' ? 'Dona' : 'Profissional'}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover acesso de ${m.user.name}`}
                onClick={() => removeMember.mutate(m.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {editing && (
        <ProfessionalDialog
          professional={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  )
}

function ProfessionalDialog({
  professional,
  onClose,
}: {
  professional: Professional | null
  onClose: () => void
}) {
  const { data: services = [] } = useServices()
  const [v, setV] = useState({
    name: professional?.name ?? '',
    bio: professional?.bio ?? '',
    photoUrl: professional?.photoUrl ?? null,
    active: professional?.active ?? true,
    serviceIds: professional?.serviceIds ?? services.map((s) => s.id),
  })
  const save = useApiMutation(
    () =>
      professional
        ? api(`/team/professionals/${professional.id}`, { method: 'PUT', body: v })
        : api('/team/professionals', { body: v }),
    {
      success: 'Profissional salva',
      invalidate: [qk.professionals, qk.services],
      onSuccess: onClose,
    },
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{professional ? 'Editar profissional' : 'Nova profissional'}</DialogTitle>
          <DialogDescription>
            Novas profissionais começam com o mesmo expediente da primeira. Ajuste em Horários.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4">
          <ImageUpload
            value={v.photoUrl}
            onChange={(u) => setV({ ...v, photoUrl: u })}
            shape="round"
            label="Foto"
          />
          <div className="flex-1 space-y-3">
            <Field label="Nome" htmlFor="p-name">
              <Input
                id="p-name"
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
              />
            </Field>
            <Field label="Bio curta" htmlFor="p-bio">
              <Textarea
                id="p-bio"
                rows={2}
                value={v.bio}
                onChange={(e) => setV({ ...v, bio: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Serviços que ela faz</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={v.serviceIds.includes(s.id)}
                  onCheckedChange={(c) =>
                    setV({
                      ...v,
                      serviceIds: c
                        ? [...v.serviceIds, s.id]
                        : v.serviceIds.filter((x) => x !== s.id),
                    })
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <SwitchRow
          id="p-active"
          label="Aceitando agendamentos"
          checked={v.active}
          onCheckedChange={(active) => setV({ ...v, active })}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={v.name.trim().length < 2}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({
    name: '',
    email: '',
    role: 'professional',
    createProfessional: true,
  })
  const save = useApiMutation(() => api('/team/members', { body: v }), {
    success: 'Convite enviado por e-mail',
    invalidate: [['members'], qk.professionals],
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar acesso ao painel</DialogTitle>
          <DialogDescription>Ela recebe um e-mail para criar a senha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nome" htmlFor="i-name">
            <Input
              id="i-name"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="E-mail" htmlFor="i-email">
            <Input
              id="i-email"
              type="email"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </Field>
          <Field label="Permissão" htmlFor="i-role">
            <NativeSelect
              id="i-role"
              value={v.role}
              onChange={(e) => setV({ ...v, role: e.target.value })}
            >
              <option value="professional">Profissional (só a própria agenda)</option>
              <option value="owner">Dona (acesso total)</option>
            </NativeSelect>
          </Field>
          <SwitchRow
            id="i-pro"
            label="Criar uma agenda para ela"
            checked={v.createProfessional}
            onCheckedChange={(createProfessional) => setV({ ...v, createProfessional })}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!v.email.includes('@') || v.name.length < 2}
          >
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
