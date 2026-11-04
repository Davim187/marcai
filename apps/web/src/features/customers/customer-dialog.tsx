import { X } from 'lucide-react'
import { useState } from 'react'
import { isValidBrazilianMobile } from '@marcai/shared'
import { PhoneInput } from '@/components/phone-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/queries'
import type { CustomerDTO } from '@/lib/types'

export function CustomerDialog({
  customer,
  onClose,
}: {
  customer?: CustomerDTO
  onClose: () => void
}) {
  const [v, setV] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone.replace(/^55/, '') ?? '',
    email: customer?.email ?? '',
    notes: customer?.notes ?? '',
    tags: customer?.tags ?? [],
    birthday: customer?.birthday ?? '',
  })
  const [tag, setTag] = useState('')
  const save = useApiMutation(
    () =>
      customer
        ? api(`/customers/${customer.id}`, { method: 'PUT', body: v })
        : api('/customers', { body: v }),
    {
      success: 'Cliente salva',
      invalidate: [['customers'], ['customer']],
      onSuccess: onClose,
    },
  )
  const addTag = () => {
    const t = tag.trim()
    if (t && !v.tags.includes(t)) setV({ ...v, tags: [...v.tags, t] })
    setTag('')
  }
  const valid = v.name.trim().length >= 2 && isValidBrazilianMobile(v.phone)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Nova cliente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nome" htmlFor="c-name" required>
            <Input
              id="c-name"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp" htmlFor="c-phone" required>
              <PhoneInput
                id="c-phone"
                value={v.phone}
                onChange={(e) => setV({ ...v, phone: e.target.value })}
              />
            </Field>
            <Field label="Aniversário" htmlFor="c-bday">
              <Input
                id="c-bday"
                type="date"
                value={v.birthday}
                onChange={(e) => setV({ ...v, birthday: e.target.value })}
              />
            </Field>
          </div>
          <Field label="E-mail" htmlFor="c-email">
            <Input
              id="c-email"
              type="email"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </Field>
          <Field label="Tags" htmlFor="c-tag" hint="Ex.: VIP, Alongamento, Indicação">
            <div className="flex gap-2">
              <Input
                id="c-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {v.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button
                    onClick={() => setV({ ...v, tags: v.tags.filter((x) => x !== t) })}
                    aria-label={`Remover tag ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </Field>
          <Field
            label="Observações privadas"
            htmlFor="c-notes"
            hint="Só você vê. Ex.: alergias, preferências."
          >
            <Textarea
              id="c-notes"
              rows={3}
              value={v.notes}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
