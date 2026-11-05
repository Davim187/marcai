import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateBookingViews, qk } from '@/lib/queries'
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
import { installSoundUnlock, onSoundReady, playChime, soundReady } from '@/lib/sound'
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

export function NotificationBell() {
  const { tenant } = useTenant()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sseOk, setSseOk] = useState(false)
  // Ids já vistos: o primeiro carregamento não toca nada; depois, cada aviso novo toca uma vez
  const seen = useRef<Set<string> | null>(null)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const { data } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<{ items: NotificationDTO[]; unread: number }>('/notifications'),
    // Polling como rede de segurança: 15s sem SSE, 60s com SSE (caso um evento se perca)
    refetchInterval: sseOk ? 60_000 : 15_000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    installSoundUnlock()
    return onSoundReady(() => setSoundBlocked(false))
  }, [])

  // Detecta avisos novos (SSE ou polling) → toast + som
  useEffect(() => {
    if (!data) return
    if (!seen.current) {
      seen.current = new Set(data.items.map((n) => n.id))
      return
    }
    const fresh = data.items.filter((n) => !seen.current!.has(n.id) && !n.readAt)
    data.items.forEach((n) => seen.current!.add(n.id))
    if (!fresh.length) return
    const newest = fresh[0]!
    toast(fresh.length > 1 ? `${fresh.length} novos avisos` : newest.title, {
      description: fresh.length > 1 ? newest.title : newest.body,
      action: newest.link ? { label: 'Ver', onClick: () => navigate(newest.link!) } : undefined,
    })
    if (tenant.notifySound && !playChime()) setSoundBlocked(true)
    invalidateBookingViews(qc)
  }, [data, tenant.notifySound, navigate, qc])

  // Contador na aba do navegador: dá para ver de longe que chegou algo
  const unreadCount = data?.unread ?? 0
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = unreadCount ? `(${unreadCount > 9 ? '9+' : unreadCount}) ${base}` : base
  }, [unreadCount])
  useEffect(
    () => () => {
      document.title = document.title.replace(/^\(\d+\+?\) /, '')
    },
    [],
  )

  // Tempo real via SSE
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(apiUrl('/notifications/stream'), { withCredentials: true })
    es.onopen = () => setSseOk(true)
    es.addEventListener('notification', () => qc.invalidateQueries({ queryKey: qk.notifications }))
    // Ao reconectar, busca o que chegou enquanto estava fora
    es.addEventListener('open', () => qc.invalidateQueries({ queryKey: qk.notifications }))
    es.onerror = () => setSseOk(false)
    return () => es.close()
  }, [qc])

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' })
    qc.invalidateQueries({ queryKey: qk.notifications })
  }
  async function openItem(n: NotificationDTO) {
    if (!n.readAt)
      api(`/notifications/read/${n.id}`, { method: 'POST' }).then(() =>
        qc.invalidateQueries({ queryKey: qk.notifications }),
      )
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const unread = data?.unread ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="round"
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
        {tenant.notifySound && soundBlocked && !soundReady() && (
          <p className="bg-warning/10 border-b px-4 py-2 text-xs">
            O navegador bloqueou o som. Clique em qualquer lugar do painel para ativar.
          </p>
        )}
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
