import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queries'
import { Download, Plus, Search, Upload, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { formatBRL, formatPhone } from '@marcai/shared'
import { Avatar } from '@/components/ui/avatar'
import { Meta } from '@/components/meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { ListSkeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { fmt } from '@/lib/dates'
import { useTenant } from '@/lib/session'
import type { CustomerDTO, Paginated } from '@/lib/types'
import { downloadBlob } from '@/lib/utils'
import { CustomerDialog } from './customer-dialog'

export default function CustomersPage() {
  const { tenant } = useTenant()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setPage(1), [debounced, tag, sort])
  const query = `?page=${page}&pageSize=30&sort=${sort}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`
  const { data, isLoading } = useQuery({
    queryKey: ['customers', query],
    queryFn: () => api<Paginated<CustomerDTO> & { allTags: string[] }>(`/customers${query}`),
  })

  async function exportCsv() {
    try {
      const csv = await api<string>('/customers/export.csv', { raw: true })
      downloadBlob(csv, `clientes-${tenant.slug}.csv`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  async function importCsv(file: File) {
    try {
      const csv = await file.text()
      const r = await api<{ created: number; updated: number; skipped: number; errors: string[] }>(
        '/customers/import',
        { body: { csv } },
      )
      toast.success(
        `Importação concluída: ${r.created} nova(s), ${r.updated} atualizada(s)${r.skipped ? `, ${r.skipped} ignorada(s)` : ''}.`,
        {
          description: r.errors.slice(0, 3).join(' · ') || undefined,
        },
      )
      qc.invalidateQueries({ queryKey: qk.customers })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cadastrados automaticamente a cada agendamento, sem duplicar pelo WhatsApp."
        actions={
          // Importar, exportar e cadastrar é só da gestão (a API também bloqueia)
          tenant.role === 'owner' && (
            <>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload /> Importar
              </Button>
              <Button variant="outline" onClick={exportCsv}>
                <Download /> Exportar
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus /> Novo cliente
              </Button>
            </>
          )
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importCsv(f)
          e.target.value = ''
        }}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar por nome ou telefone"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
        <NativeSelect
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="Filtrar por tag"
          className="sm:w-40"
        >
          <option value="">Todas as tags</option>
          {data?.allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Ordenar"
          className="sm:w-44"
        >
          <option value="name">Nome (A–Z)</option>
          <option value="recent">Mais recentes</option>
          <option value="spent">Quem mais gastou</option>
        </NativeSelect>
      </div>
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Users}
          title={debounced || tag ? 'Ninguém encontrado' : 'Suas clientes aparecem aqui'}
          description={
            debounced || tag
              ? 'Tente outra busca.'
              : 'Assim que alguém agendar pelo seu link, ela é cadastrada automaticamente. Você também pode importar uma planilha.'
          }
        />
      ) : (
        <>
          <Card className="divide-y overflow-hidden">
            {data.items.map((c) => (
              <Link
                key={c.id}
                to={`/painel/clientes/${c.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 p-3 transition sm:p-4"
              >
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    {c.name}
                    {c.tags.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </p>
                  <Meta
                    items={[
                      formatPhone(c.phone),
                      c.stats?.lastVisit &&
                        `última visita ${fmt(c.stats.lastVisit, tenant.timezone, 'dd/MM/yy')}`,
                    ]}
                  />
                </div>
                <div className="hidden text-right text-sm sm:block">
                  <p className="font-semibold">{formatBRL(c.stats?.totalSpentCents ?? 0)}</p>
                  <Meta
                    className="justify-end"
                    items={[
                      `${c.stats?.visits ?? 0} visita(s)`,
                      !!c.stats?.noShows && `${c.stats.noShows} falta(s)`,
                    ]}
                  />
                </div>
              </Link>
            ))}
          </Card>
          {data.total > data.pageSize && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground text-sm">
                {page} de {Math.ceil(data.total / data.pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
      <p className="text-muted-foreground mt-6 text-xs">
        Importação: planilha CSV com as colunas Nome; WhatsApp; E-mail; Tags; Observações.
      </p>
      {creating && <CustomerDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
