import { formatBRL } from '@marcai/shared'
import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

export interface TrendPoint {
  date: string
  cents: number
  count: number
}

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Curva suave (Catmull-Rom → Bézier) para as minilinhas. */
function smoothPath(points: Array<[number, number]>) {
  if (points.length < 2) return ''
  let d = `M${points[0]![0]},${points[0]![1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

/** Minilinha decorativa ao lado de um número (o número é o dado; a linha só mostra a tendência). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 72
  const h = 28
  const max = Math.max(...values, 1)
  const pts = values.map(
    (v, i) =>
      [(i / Math.max(values.length - 1, 1)) * w, h - 3 - (v / max) * (h - 6)] as [number, number],
  )
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-7 w-[72px] overflow-visible', className)}
      aria-hidden
      fill="none"
    >
      <path
        d={smoothPath(pts)}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Minibarras (últimos dias) com dica no hover de cada barra. */
export function MiniBars({ data, className }: { data: TrendPoint[]; className?: string }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className={cn('flex h-9 items-end gap-[3px]', className)}>
      {data.map((d) => (
        <span
          key={d.date}
          title={`${dayLabel(d.date)}: ${d.count} agendamento(s)`}
          className="bg-cobalt hover:bg-foreground w-1.5 rounded-sm transition-colors"
          style={{ height: `${Math.max(12, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }}
        />
      ))}
    </div>
  )
}

/** Meio anel: proporção de comparecimento. */
export function Gauge({ value, label }: { value: number | null; label: string }) {
  const r = 70
  const len = Math.PI * r
  const pct = value === null ? 0 : Math.min(Math.max(value, 0), 1)
  return (
    <div className="relative mx-auto w-full max-w-[200px]" role="img" aria-label={label}>
      <svg viewBox="0 0 180 100" className="w-full" aria-hidden>
        <path
          d="M20,90 A70,70 0 0 1 160,90"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={22}
        />
        <path
          d="M20,90 A70,70 0 0 1 160,90"
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={22}
          strokeDasharray={`${len * pct} ${len}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center text-2xl font-bold tabular-nums">
        {value === null ? '—' : `${Math.round(pct * 100)}%`}
      </p>
    </div>
  )
}

/** Área de faturamento previsto por dia, com cursor e dica. */
export function RevenueArea({ data }: { data: TrendPoint[] }) {
  const id = useId().replace(/:/g, '')
  const rows = data.map((d) => ({ dia: dayLabel(d.date), valor: d.cents / 100, qtd: d.count }))
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
          <XAxis
            dataKey="dia"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis hide domain={[0, (max: number) => Math.max(max * 1.15, 1)]} />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              fontSize: 12,
              color: 'hsl(var(--foreground))',
            }}
            formatter={(v: number, _n, item) => [
              `${formatBRL(Math.round(v * 100))} · ${(item.payload as { qtd: number }).qtd} agend.`,
              'Previsto',
            ]}
            labelFormatter={(l) => `Dia ${l}`}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill={`url(#g${id})`}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
