import { ImageUpload } from '@/components/image-upload'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import type { FormFieldDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Renderiza um campo personalizado (usado na página pública e na pré-visualização). */
export function CustomFieldInput({
  field,
  value,
  onChange,
  error,
  uploadEndpoint,
  disabledUpload,
}: {
  field: Pick<FormFieldDTO, 'id' | 'label' | 'type' | 'required' | 'helpText' | 'options'>
  value: unknown
  onChange: (v: unknown) => void
  error?: string
  uploadEndpoint?: string
  disabledUpload?: boolean
}) {
  const id = `field-${field.id}`
  const chip = (active: boolean) =>
    cn(
      'rounded-md border px-4 py-2 text-sm font-medium transition',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'bg-card hover:border-primary/50',
    )
  return (
    <Field
      label={field.label}
      htmlFor={id}
      required={field.required}
      hint={field.helpText ?? undefined}
      error={error}
    >
      {field.type === 'short_text' && (
        <Input
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      )}
      {field.type === 'long_text' && (
        <Textarea
          id={id}
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      )}
      {field.type === 'single_select' && (
        <div className="flex flex-wrap gap-2" role="radiogroup" id={id} aria-label={field.label}>
          {field.options.map((o) => (
            <button
              type="button"
              role="radio"
              aria-checked={value === o.label}
              key={o.id}
              className={chip(value === o.label)}
              onClick={() => onChange(value === o.label ? '' : o.label)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {field.type === 'multi_select' && (
        <div className="flex flex-wrap gap-2" id={id} role="group" aria-label={field.label}>
          {field.options.map((o) => {
            const list = Array.isArray(value) ? (value as string[]) : []
            const on = list.includes(o.label)
            return (
              <button
                type="button"
                aria-pressed={on}
                key={o.id}
                className={chip(on)}
                onClick={() =>
                  onChange(on ? list.filter((x) => x !== o.label) : [...list, o.label])
                }
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
      {field.type === 'yes_no' && (
        <div className="flex gap-2" role="radiogroup" id={id} aria-label={field.label}>
          {[
            { v: true, l: 'Sim' },
            { v: false, l: 'Não' },
          ].map((o) => (
            <button
              type="button"
              role="radio"
              aria-checked={value === o.v}
              key={o.l}
              className={cn(chip(value === o.v), 'min-w-20')}
              onClick={() => onChange(value === o.v ? undefined : o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}
      {field.type === 'photo' &&
        (disabledUpload ? (
          <div className="text-muted-foreground flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed text-xs">
            Foto
          </div>
        ) : (
          <ImageUpload
            value={(value as string) || null}
            onChange={(url) => onChange(url ?? '')}
            label="Enviar foto"
            endpoint={uploadEndpoint}
          />
        ))}
    </Field>
  )
}
