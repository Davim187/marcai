import { useQuery } from '@tanstack/react-query'
import { Download, Table2 } from 'lucide-react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDaysToDate, formatBRL } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { todayIn } from '@/lib/dates'
import { useTenant } from '@/lib/session'
import { cn, downloadBlob } from '@/lib/utils'

interface Report {
  totals: {
    realizedCents: number
    forecastCents: number
    bookings: number
    completed: number
    canceled: number
    noShow: number
    cancelRate: number
    noShowRate: number
    avgTicketCents: number
  }
  byDay: Array<{ date: string; realized: number; forecast: number; count: number }>
  topServices: Array<{ name: string; count: number; revenue: number }>
  peakHours: Array<{ hour: string; count: number }>
  peakWeekdays: Array<{ weekday: string; count: number }>
  topCustomers: Array<{ id: string; name: string; visits: number; spent: number }>
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const axis = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }
const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    color: 'hsl(var(--foreground))',
  },
  cursor: { fill: 'hsl(var(--muted))', opacity: 0.6 },
}

export default function ReportsPage() {
  const { tenant } = useTenant()
  const today = todayIn(tenant.timezone)
  const presets = [
    { id: '7', label: '7 dias', from: addDaysToDate(today, -6), to: today },
    { id: '30', label: '30 dias', from: addDaysToDate(today, -29), to: today },
    { id: 'mes', label: 'Este mês', from: `${today.slice(0, 8)}01`, to: today },
    { id: '90', label: '3 meses', from: addDaysToDate(today, -89), to: today },
    { id: 'prox', label: 'Próximos 30 dias', from: today, to: addDaysToDate(today, 29) },
  ]
  const [range, setRange] = useState({ id: '30', from: presets[1]!.from, to: presets[1]!.to })
  const [showTable, setShowTable] = useState(false)
  const qs = `from=${range.from}&to=${range.to}`
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', qs],
    queryFn: () => api<Report>(`/reports?${qs}`),
  })
  const days = (data?.byDay ?? []).map((d) => ({
    ...d,
    label: `${d.date.slice(8)}/${d.date.slice(5, 7)}`,
    Faturado: d.realized / 100,
    Previsto: d.forecast / 100,
  }))

  if (error) return <QueryError error={error} onRetry={() => refetch()} />
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Faturamento, serviços, horários e clientes do período."
        actions={
          <Button
            variant="outline"
            onClick={async () =>
              downloadBlob(
                await api<string>(`/reports/export.csv?${qs}`, { raw: true }),
                `relatorio-${range.from}-a-${range.to}.csv`,
              )
            }
          >
            <Download /> Exportar CSV
          </Button>
        }
      />
      {/* Filtros: uma única linha acima dos gráficos */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setRange({ id: p.id, from: p.from, to: p.to })}
            aria-pressed={range.id === p.id}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              range.id === p.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-muted',
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="h-9 w-36"
            value={range.from}
            onChange={(e) => setRange({ id: 'custom', from: e.target.value, to: range.to })}
            aria-label="De"
          />
          <span className="text-muted-foreground text-sm">a</span>
          <Input
            type="date"
            className="h-9 w-36"
            value={range.to}
            onChange={(e) => setRange({ id: 'custom', from: range.from, to: e.target.value })}
            aria-label="Até"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Faturado"
          value={data && formatBRL(data.totals.realizedCents)}
          sub={data && `${data.totals.completed} atendimentos concluídos`}
        />
        <Tile
          label="Previsto"
          value={data && formatBRL(data.totals.forecastCents)}
          sub="pendentes e confirmados"
        />
        <Tile
          label="Ticket médio"
          value={data && formatBRL(data.totals.avgTicketCents)}
          sub={data && `${data.totals.bookings} agendamentos`}
        />
        <Tile
          label="Faltas · cancelamentos"
          value={data && `${pct(data.totals.noShowRate)} · ${pct(data.totals.cancelRate)}`}
          sub={data && `${data.totals.noShow} faltas, ${data.totals.canceled} cancelados`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Faturamento por dia</CardTitle>
            <CardDescription>Concluídos (faturado) e agendados (previsto).</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable(!showTable)}
            aria-pressed={showTable}
          >
            <Table2 /> {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72" />
          ) : showTable ? (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-card text-muted-foreground sticky top-0 text-left">
                  <tr>
                    <th className="py-2">Data</th>
                    <th>Agendamentos</th>
                    <th className="text-right">Faturado</th>
                    <th className="text-right">Previsto</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td className="py-1.5">{d.label}</td>
                      <td>{d.count}</td>
                      <td className="text-right tabular-nums">{formatBRL(d.realized)}</td>
                      <td className="text-right tabular-nums">{formatBRL(d.forecast)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-72" role="img" aria-label="Gráfico de faturamento por dia">
              <ResponsiveContainer>
                <BarChart data={days} margin={{ left: -8, right: 8, top: 8 }} barCategoryGap="18%">
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="label"
                    tick={axis}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tick={axis}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      `R$${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`
                    }
                    width={56}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number, name: string) => [formatBRL(Math.round(v * 100)), name]}
                    labelFormatter={(l) => `Dia ${l}`}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value: string) => <span className="text-foreground">{value}</span>}
                  />
                  <Bar
                    dataKey="Faturado"
                    stackId="a"
                    fill="var(--chart-1)"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="Previsto"
                    stackId="a"
                    fill="var(--chart-2)"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Serviços mais vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : !data?.topServices.length ? (
              <Empty />
            ) : (
              <div
                style={{ height: Math.max(160, data.topServices.length * 40) }}
                role="img"
                aria-label="Serviços mais vendidos"
              >
                <ResponsiveContainer>
                  <BarChart
                    data={data.topServices}
                    layout="vertical"
                    margin={{ left: 0, right: 32 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      width={150}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number, _n, p) => [
                        `${v} agendamento(s) · ${formatBRL((p.payload as { revenue: number }).revenue)}`,
                        'Total',
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--chart-1)"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                      label={{
                        position: 'right',
                        fontSize: 11,
                        fill: 'hsl(var(--muted-foreground))',
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Horários mais procurados</CardTitle>
            <CardDescription>Agendamentos por hora de início.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : !data?.peakHours.length ? (
              <Empty />
            ) : (
              <div className="h-64" role="img" aria-label="Horários mais procurados">
                <ResponsiveContainer>
                  <BarChart data={data.peakHours} margin={{ left: -24, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="hour" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => [`${v} agendamento(s)`, 'Total']}
                    />
                    <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dias da semana</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56" />
            ) : (
              <div className="h-56" role="img" aria-label="Agendamentos por dia da semana">
                <ResponsiveContainer>
                  <BarChart data={data?.peakWeekdays} margin={{ left: -24, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="weekday" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => [`${v} agendamento(s)`, 'Total']}
                    />
                    <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes que mais voltam</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.topCustomers.length ? (
              <Empty />
            ) : (
              <ol className="space-y-2">
                {data.topCustomers.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-5 text-right font-semibold">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.visits} visita(s)</span>
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatBRL(c.spent)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs font-medium sm:text-sm">{label}</p>
      {value ? (
        <p className="mt-1.5 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      ) : (
        <Skeleton className="mt-2 h-7 w-24" />
      )}
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </Card>
  )
}

function Empty() {
  return <p className="text-muted-foreground py-10 text-center text-sm">Sem dados no período.</p>
}
