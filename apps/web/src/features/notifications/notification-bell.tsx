import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api, apiUrl } from '@/lib/api'
import { useTenant } from '@/lib/session'
import { cn } from '@/lib/utils'

interface NotificationDTO {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
}

/** Som curto e discreto gerado na hora (sem arquivo de áudio). */
function playChime() {
  try {
    const ctx = new AudioContext()
    const notes = [880, 1318.5]
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      const t = ctx.currentTime + i * 0.12
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.4)
    })
  } catch {
    /* sem áudio disponível */
  }
}

export function NotificationBell() {
  const { tenant } = useTenant()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sseOk, setSseOk] = useState(false)
  const lastSeen = useRef<string | null>(null)
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationDTO[]; unread: number }>('/notifications'),
    // Polling de 15s como fallback quando o SSE não está conectado
    refetchInterval: sseOk ? 120_000 : 15_000,
  })

  // Detecta avisos novos (SSE ou polling) → toast + som opcional
  useEffect(() => {
    const newest = data?.items[0]
    if (!newest) return
    if (lastSeen.current && newest.id !== lastSeen.current && !newest.readAt) {
      toast(newest.title, {
        description: newest.body,
        action: newest.link ? { label: 'Ver', onClick: () => navigate(newest.link!) } : undefined,
      })
      if (tenant.notifySound) playChime()
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
    }
    lastSeen.current = newest.id
  }, [data, tenant.notifySound, navigate, qc])

  // Tempo real via SSE
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(apiUrl('/notifications/stream'), { withCredentials: true })
    es.onopen = () => setSseOk(true)
    es.addEventListener('notification', () => qc.invalidateQueries({ queryKey: ['notifications'] }))
    es.onerror = () => setSseOk(false)
    return () => es.close()
  }, [qc])

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function openItem(n: NotificationDTO) {
    if (!n.readAt)
      api(`/notifications/read/${n.id}`, { method: 'POST' }).then(() =>
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      )
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const unread = data?.unread ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}
        >
          <Bell />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Avisos</p>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todos como lidos
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!data?.items.length ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              Nenhum aviso por enquanto. Quando alguém agendar, aparece aqui na hora.
            </p>
          ) : (
            data.items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={cn(
                  'hover:bg-muted/60 flex w-full gap-3 border-b px-4 py-3 text-left last:border-0',
                  !n.readAt && 'bg-primary-soft/50',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : 'bg-primary',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  <span className="text-muted-foreground block text-sm">{n.body}</span>
                  <span className="text-muted-foreground/80 mt-0.5 block text-xs">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
