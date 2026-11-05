import { ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, imageSrc } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Upload de imagem com pré-visualização. `endpoint` permite upload público (foto de referência). */
export function ImageUpload({
  value,
  onChange,
  label = 'Enviar imagem',
  className,
  endpoint = '/uploads',
  shape = 'square',
}: {
  value: string | null | undefined
  onChange: (url: string | null) => void
  label?: string
  className?: string
  endpoint?: string
  shape?: 'square' | 'wide' | 'round'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  // Pré-visualização local: fotos privadas (referência da cliente) não são abertas pela URL
  const [preview, setPreview] = useState<string | null>(null)
  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) return toast.error('A imagem precisa ter até 5 MB.')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { url } = await api<{ url: string }>(endpoint, { body: fd })
      setPreview(URL.createObjectURL(file))
      onChange(url)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          'border-input bg-muted/40 text-muted-foreground hover:border-primary hover:text-primary group flex items-center justify-center overflow-hidden border-2 border-dashed transition',
          shape === 'wide'
            ? 'h-32 w-full rounded-xl'
            : shape === 'round'
              ? 'h-24 w-24 rounded-full'
              : 'h-24 w-24 rounded-xl',
          value && 'border-solid',
        )}
      >
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : value ? (
          <img src={preview ?? imageSrc(value)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs font-medium">
            <ImagePlus className="h-6 w-6" />
            {label}
          </span>
        )}
      </button>
      {value && !loading && (
        <button
          type="button"
          onClick={() => {
            setPreview(null)
            onChange(null)
          }}
          className="bg-foreground text-background absolute -right-2 -top-2 rounded-full p-1 shadow"
          aria-label="Remover imagem"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
