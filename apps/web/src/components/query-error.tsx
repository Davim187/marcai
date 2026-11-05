import { AlertTriangle } from 'lucide-react'
import { errorMessage } from '@/lib/api'
import { Button } from './ui/button'

/** Estado de erro de carregamento: nunca deixar a tela num "carregando" eterno. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center"
      role="alert"
    >
      <AlertTriangle className="text-warning h-6 w-6" />
      <p className="text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}
