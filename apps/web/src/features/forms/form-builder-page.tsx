import { ClipboardList, MoreVertical, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FORM_FIELD_TYPE_LABELS, FORM_FIELD_TYPES, type FormFieldType } from '@marcai/shared'
import { SortableList } from '@/components/sortable-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useApiMutation, useFormFields, useServices } from '@/lib/queries'
import type { FormFieldDTO } from '@/lib/types'
import { CustomFieldInput } from './custom-field-input'

export default function FormBuilderPage() {
  const { data: fields, isLoading } = useFormFields()
  const [order, setOrder] = useState<FormFieldDTO[]>([])
  useEffect(() => setOrder(fields ?? []), [fields])
  const [editing, setEditing] = useState<FormFieldDTO | 'new' | null>(null)
  const [preview, setPreview] = useState(false)

  const remove = useApiMutation((id: string) => api(`/forms/fields/${id}`, { method: 'DELETE' }), {
    success: 'Pergunta removida',
    invalidate: [qk.formFields],
  })
  const preset = useApiMutation(
    () => api<{ created: number }>('/forms/presets/manicure', { method: 'POST' }),
    {
      success: (r) =>
        r.created
          ? `${r.created} perguntas adicionadas`
          : 'As perguntas do preset já estão no formulário',
      invalidate: [qk.formFields],
    },
  )
  const reorder = useApiMutation(
    (ids: string[]) => api('/forms/fields-order', { method: 'PUT', body: { ids } }),
    { invalidate: [qk.formFields] },
  )

  return (
    <div>
      <PageHeader
        title="Formulário de agendamento"
        description="Perguntas extras que a cliente responde ao agendar. As respostas chegam junto com o aviso."
        actions={
          <>
            <Button variant="outline" onClick={() => setPreview(true)} disabled={!order.length}>
              Pré-visualizar
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Nova pergunta
            </Button>
          </>
        }
      />
      <Card className="bg-primary-soft/60 mb-6 flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
        <Sparkles className="text-primary h-5 w-5 shrink-0" />
        <p className="flex-1 text-sm">
          <strong>Preset para manicure:</strong> tipo de unha, se é manutenção, se quer decoração e
          foto de referência.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => preset.mutate()}
          loading={preset.isPending}
        >
          Adicionar preset
        </Button>
      </Card>
      {isLoading ? (
        <ListSkeleton />
      ) : !order.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma pergunta extra"
          description="Nome, WhatsApp e observações já são pedidos sempre. Crie perguntas para chegar sabendo o que a cliente quer."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus /> Criar pergunta
            </Button>
          }
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          <SortableList
            items={order}
            onReorder={(list) => {
              setOrder(list)
              reorder.mutate(list.map((f) => f.id))
            }}
            renderItem={(f, handle) => (
              <div className="bg-card flex items-center gap-3 p-3 sm:p-4">
                {handle}
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(f)}>
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {f.label}
                    {f.required && <Badge variant="secondary">Obrigatória</Badge>}
                    {!f.appliesToAll && (
                      <Badge variant="outline">{f.serviceIds.length} serviço(s)</Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {FORM_FIELD_TYPE_LABELS[f.type]}
                    {f.options.length > 0 && ` · ${f.options.map((o) => o.label).join(', ')}`}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Opções de ${f.label}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(f)}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => remove.mutate(f.id)}>
                      <Trash2 /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />
        </Card>
      )}
      {editing && (
        <FieldDialog field={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como a cliente vê</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {order
              .filter((f) => f.active)
              .map((f) => (
                <PreviewField key={f.id} field={f} />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PreviewField({ field }: { field: FormFieldDTO }) {
  const [v, setV] = useState<unknown>(field.type === 'multi_select' ? [] : '')
  return <CustomFieldInput field={field} value={v} onChange={setV} disabledUpload />
}

function FieldDialog({ field, onClose }: { field: FormFieldDTO | null; onClose: () => void }) {
  const { data: services = [] } = useServices()
  const [v, setV] = useState({
    label: field?.label ?? '',
    type: (field?.type ?? 'short_text') as FormFieldType,
    required: field?.required ?? false,
    helpText: field?.helpText ?? '',
    options: field?.options.map((o) => o.label) ?? ['', ''],
    appliesToAll: field?.appliesToAll ?? true,
    serviceIds: field?.serviceIds ?? [],
    active: field?.active ?? true,
  })
  const hasOptions = v.type === 'single_select' || v.type === 'multi_select'
  const save = useApiMutation(
    () => {
      const body = {
        ...v,
        options: hasOptions ? v.options.map((o) => o.trim()).filter(Boolean) : [],
      }
      return field
        ? api(`/forms/fields/${field.id}`, { method: 'PUT', body })
        : api('/forms/fields', { body })
    },
    { success: 'Pergunta salva', invalidate: [qk.formFields], onSuccess: onClose },
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{field ? 'Editar pergunta' : 'Nova pergunta'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Pergunta" htmlFor="fl" required>
            <Input
              id="fl"
              placeholder="Ex.: Tipo de unha"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de resposta" htmlFor="ft">
              <NativeSelect
                id="ft"
                value={v.type}
                onChange={(e) => setV({ ...v, type: e.target.value as FormFieldType })}
              >
                {FORM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FORM_FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Texto de ajuda (opcional)" htmlFor="fh">
              <Input
                id="fh"
                value={v.helpText}
                onChange={(e) => setV({ ...v, helpText: e.target.value })}
              />
            </Field>
          </div>
          {hasOptions && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Opções</legend>
              {v.options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={o}
                    aria-label={`Opção ${i + 1}`}
                    placeholder={`Opção ${i + 1}`}
                    onChange={(e) =>
                      setV({
                        ...v,
                        options: v.options.map((x, j) => (j === i ? e.target.value : x)),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover opção"
                    onClick={() => setV({ ...v, options: v.options.filter((_, j) => j !== i) })}
                    disabled={v.options.length <= 2}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => setV({ ...v, options: [...v.options, ''] })}
              >
                <Plus /> Adicionar opção
              </Button>
            </fieldset>
          )}
          <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">
            Resposta obrigatória
            <Switch checked={v.required} onCheckedChange={(required) => setV({ ...v, required })} />
          </label>
          <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">
            Vale para todos os serviços
            <Switch
              checked={v.appliesToAll}
              onCheckedChange={(appliesToAll) => setV({ ...v, appliesToAll })}
            />
          </label>
          {!v.appliesToAll && (
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
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={v.label.trim().length < 2}
          >
            Salvar pergunta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
