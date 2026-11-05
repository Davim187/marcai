import { useEffect, useState } from 'react'
import { ConfirmDialog } from './ui/dialog'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
}
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null

/**
 * Pergunta "tem certeza?" antes de uma ação destrutiva. Uso:
 * `if (await askConfirm({ title: 'Remover bloqueio?' })) remove.mutate(id)`
 */
export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(opts.title))
    show({ ...opts, resolve })
  })
}

/** Montado uma vez na raiz do app. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  useEffect(() => {
    show = setPending
    return () => {
      show = null
    }
  }, [])
  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  return (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(o) => !o && close(false)}
      title={pending?.title ?? ''}
      description={pending?.description ?? ''}
      confirmLabel={pending?.confirmLabel ?? 'Remover'}
      destructive
      onConfirm={() => close(true)}
    />
  )
}
