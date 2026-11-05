import { askConfirm } from '@/components/confirm-host'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderPlus, MoreVertical, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { z } from 'zod'
import { formatPrice, serviceSchema } from '@marcai/shared'
import { ImageUpload } from '@/components/image-upload'
import { MoneyInput } from '@/components/money-input'
import { SortableList } from '@/components/sortable-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ConfirmDialog,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useApiMutation, useCategories, useProfessionals, useServices } from '@/lib/queries'
import type { Service } from '@/lib/types'
import { useQueryClient } from '@tanstack/react-query'

type FormValues = z.input<typeof serviceSchema>

function duration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`
}

export default function ServicesPage() {
  const { data: services, isLoading } = useServices()
  const { data: categories = [] } = useCategories()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const [catDialog, setCatDialog] = useState<{ id?: string; name: string } | null>(null)
  const [order, setOrder] = useState<Service[]>([])
  useEffect(() => setOrder(services ?? []), [services])

  const grouped = useMemo(() => {
    const groups = categories.map((c) => ({
      category: c,
      items: order.filter((s) => s.categoryId === c.id),
    }))
    const loose = order.filter(
      (s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId),
    )
    if (loose.length)
      groups.push({ category: { id: '', name: 'Sem categoria', sortOrder: 999 }, items: loose })
    return groups
  }, [order, categories])

  const toggle = useApiMutation(
    (s: Service) =>
      api(`/services/${s.id}/active`, { method: 'PATCH', body: { active: !s.active } }),
    {
      invalidate: [qk.services],
    },
  )
  const remove = useApiMutation((s: Service) => api(`/services/${s.id}`, { method: 'DELETE' }), {
    success: 'Serviço removido',
    invalidate: [qk.services],
    onSuccess: () => setDeleting(null),
  })
  const saveCat = useApiMutation(
    (c: { id?: string; name: string }) =>
      c.id
        ? api(`/services/categories/${c.id}`, { method: 'PUT', body: { name: c.name } })
        : api('/services/categories', { body: { name: c.name } }),
    {
      success: 'Categoria salva',
      invalidate: [qk.categories],
      onSuccess: () => setCatDialog(null),
    },
  )
  const removeCat = useApiMutation(
    (id: string) => api(`/services/categories/${id}`, { method: 'DELETE' }),
    {
      success: 'Categoria removida',
      invalidate: [qk.categories, qk.services],
    },
  )

  async function reorder(groupItems: Service[], categoryId: string) {
    const others = order.filter((s) => (s.categoryId ?? '') !== categoryId)
    const next = [...others, ...groupItems]
    setOrder(next)
    const ids = grouped
      .flatMap((g) => (g.category.id === categoryId ? groupItems : g.items))
      .map((s) => s.id)
    await api('/services/order', { method: 'PUT', body: { ids } })
    qc.invalidateQueries({ queryKey: qk.services })
  }

  return (
    <div>
      <PageHeader
        title="Serviços"
        description="O que suas clientes podem agendar. Arraste para mudar a ordem."
        actions={
          <>
            <Button variant="outline" onClick={() => setCatDialog({ name: '' })}>
              <FolderPlus /> Categoria
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Novo serviço
            </Button>
          </>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : !services?.length ? (
        <EmptyState
          icon={Scissors}
          title="Nenhum serviço ainda"
          description="Cadastre o primeiro serviço para suas clientes começarem a agendar."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus /> Cadastrar serviço
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <section key={category.id || 'none'}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
                  {category.name}
                </h2>
                {category.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Opções da categoria ${category.name}`}
                      >
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setCatDialog({ id: category.id, name: category.name })}
                      >
                        <Pencil /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          if (
                            await askConfirm({
                              title: `Remover a categoria ${category.name}?`,
                              description:
                                'Os serviços dela continuam existindo, só ficam sem categoria.',
                            })
                          )
                            removeCat.mutate(category.id)
                        }}
                      >
                        <Trash2 /> Remover categoria
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                  Nenhum serviço nessa categoria.
                </p>
              ) : (
                <Card className="divide-y overflow-hidden">
                  <SortableList
                    items={items}
                    onReorder={(list) => reorder(list, category.id)}
                    renderItem={(s, handle) => (
                      <div className="bg-card flex items-center gap-3 p-3 sm:p-4">
                        {handle}
                        {s.photoUrl ? (
                          <img
                            src={s.photoUrl}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-lg">
                            <Scissors className="h-5 w-5" />
                          </div>
                        )}
                        <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
                          <p className="flex items-center gap-2 truncate font-semibold">
                            {s.name}
                            {!s.active && <Badge variant="muted">Inativo</Badge>}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {duration(s.durationMinutes)} · {formatPrice(s.priceCents, s.priceFrom)}
                            {s.bufferMinutes > 0 && ` · +${s.bufferMinutes} min de intervalo`}
                          </p>
                        </button>
                        <Switch
                          checked={s.active}
                          onCheckedChange={() => toggle.mutate(s)}
                          aria-label={s.active ? 'Desativar serviço' : 'Ativar serviço'}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Opções de ${s.name}`}
                            >
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(s)}>
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleting(s)}>
                              <Trash2 /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  />
                </Card>
              )}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ServiceDialog
          service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Remover "${deleting?.name}"?`}
        description="O serviço some da sua página, mas o histórico de agendamentos continua salvo."
        confirmLabel="Remover"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
      <Dialog open={!!catDialog} onOpenChange={(v) => !v && setCatDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catDialog?.id ? 'Renomear categoria' : 'Nova categoria'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (catDialog) saveCat.mutate(catDialog)
            }}
            className="space-y-4"
          >
            <Field label="Nome" htmlFor="cat-name">
              <Input
                id="cat-name"
                autoFocus
                placeholder="Ex.: Mãos, Pés, Alongamento"
                value={catDialog?.name ?? ''}
                onChange={(e) => setCatDialog((c) => c && { ...c, name: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button
                type="submit"
                loading={saveCat.isPending}
                disabled={(catDialog?.name.trim().length ?? 0) < 2}
              >
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const { data: categories = [] } = useCategories()
  const { data: professionals = [] } = useProfessionals()
  const { register, handleSubmit, control, formState, watch } = useForm<FormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: service
      ? { ...service, professionalIds: service.professionalIds }
      : {
          name: '',
          description: '',
          durationMinutes: 60,
          priceCents: 0,
          priceFrom: false,
          bufferMinutes: 0,
          active: true,
          categoryId: categories[0]?.id ?? null,
          professionalIds: professionals.map((p) => p.id),
        },
  })
  const save = useApiMutation(
    (v: FormValues) =>
      service
        ? api(`/services/${service.id}`, { method: 'PUT', body: v })
        : api('/services', { body: v }),
    {
      success: service ? 'Serviço atualizado' : 'Serviço criado',
      invalidate: [qk.services, qk.professionals],
      onSuccess: onClose,
    },
  )
  const e = formState.errors
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{service ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((v) => save.mutate({ ...v, categoryId: v.categoryId || null }))}
          className="space-y-4"
          noValidate
        >
          <div className="flex gap-4">
            <Controller
              control={control}
              name="photoUrl"
              render={({ field }) => (
                <ImageUpload value={field.value} onChange={field.onChange} label="Foto" />
              )}
            />
            <div className="flex-1 space-y-4">
              <Field label="Nome do serviço" htmlFor="name" error={e.name?.message} required>
                <Input id="name" placeholder="Ex.: Alongamento em gel" {...register('name')} />
              </Field>
              <Field label="Categoria" htmlFor="categoryId">
                <NativeSelect id="categoryId" {...register('categoryId')}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </div>
          <Field
            label="Descrição"
            htmlFor="description"
            hint="Conte o que está incluso. Aparece na sua página."
          >
            <Textarea id="description" rows={2} {...register('description')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Duração (min)"
              htmlFor="durationMinutes"
              error={e.durationMinutes?.message}
              required
            >
              <Input
                id="durationMinutes"
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                {...register('durationMinutes', { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Intervalo após (min)"
              htmlFor="bufferMinutes"
              hint="Limpeza/organização entre clientes."
              error={e.bufferMinutes?.message}
            >
              <Input
                id="bufferMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                {...register('bufferMinutes', { valueAsNumber: true })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 items-end gap-4">
            <Field label="Preço" htmlFor="price" error={e.priceCents?.message}>
              <Controller
                control={control}
                name="priceCents"
                render={({ field }) => (
                  <MoneyInput id="price" value={field.value ?? 0} onChange={field.onChange} />
                )}
              />
            </Field>
            <label className="flex h-11 items-center gap-2 text-sm">
              <Controller
                control={control}
                name="priceFrom"
                render={({ field }) => (
                  <Checkbox
                    checked={!!field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              Mostrar “a partir de”
            </label>
          </div>
          {professionals.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Quem faz esse serviço?</legend>
              <Controller
                control={control}
                name="professionalIds"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {professionals.map((p) => {
                      const checked = field.value?.includes(p.id) ?? false
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v
                                  ? [...(field.value ?? []), p.id]
                                  : (field.value ?? []).filter((x) => x !== p.id),
                              )
                            }
                          />
                          {p.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              />
            </fieldset>
          )}
          <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">
            Disponível para agendamento online
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              )}
            />
          </label>
          {watch('durationMinutes') > 240 && (
            <p className="text-warning text-xs">
              Serviço longo: confira se cabe no seu expediente.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              Salvar serviço
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
