import { Move, RotateCcw, ZoomIn } from 'lucide-react'
import { useRef, useState } from 'react'
import { COVER_ZOOM_MAX, COVER_ZOOM_MIN } from '@marcai/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CoverFraming {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_COVER_FRAMING: CoverFraming = { x: 50, y: 50, zoom: 100 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Foto de capa com o enquadramento escolhido: o ponto focal (x/y em %) fica sempre visível,
 * em qualquer largura de tela, e o zoom aproxima a partir dele.
 */
export function CoverImage({
  src,
  framing,
  className,
}: {
  src: string
  framing: CoverFraming
  className?: string
}) {
  const origin = `${framing.x}% ${framing.y}%`
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn('h-full w-full select-none object-cover', className)}
      style={{
        objectPosition: origin,
        transform: framing.zoom > 100 ? `scale(${framing.zoom / 100})` : undefined,
        transformOrigin: origin,
      }}
    />
  )
}

/**
 * Editor do enquadramento: arrastar a foto (ou usar as setas do teclado) escolhe a parte que
 * aparece; o controle deslizante aproxima.
 */
export function CoverFramer({
  src,
  value,
  onChange,
}: {
  src: string
  value: CoverFraming
  onChange: (v: CoverFraming) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  /** Quantos px da foto sobram para fora da área (por eixo), para o arraste andar junto com o dedo. */
  function overflow() {
    const box = boxRef.current
    if (!box || !natural) return { ox: 0, oy: 0 }
    const W = box.clientWidth
    const H = box.clientHeight
    const s = Math.max(W / natural.w, H / natural.h) * (value.zoom / 100)
    return { ox: natural.w * s - W, oy: natural.h * s - H }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: value.x, y: value.y }
    setDragging(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const box = boxRef.current
    if (!d || !box) return
    const { ox, oy } = overflow()
    // Sem sobra num eixo, o arraste ainda funciona, só que mais devagar (vale para o zoom)
    const kx = 100 / Math.max(ox, box.clientWidth)
    const ky = 100 / Math.max(oy, box.clientHeight)
    onChange({
      ...value,
      x: Math.round(clamp(d.x - (e.clientX - d.px) * kx, 0, 100)),
      y: Math.round(clamp(d.y - (e.clientY - d.py) * ky, 0, 100)),
    })
  }
  function endDrag() {
    drag.current = null
    setDragging(false)
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    onChange({
      ...value,
      x: clamp(value.x + m[0], 0, 100),
      y: clamp(value.y + m[1], 0, 100),
    })
  }

  const isDefault =
    value.x === DEFAULT_COVER_FRAMING.x &&
    value.y === DEFAULT_COVER_FRAMING.y &&
    value.zoom === DEFAULT_COVER_FRAMING.zoom

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        role="slider"
        tabIndex={0}
        aria-label="Enquadramento da capa. Use as setas para mover a foto."
        aria-valuetext={`Horizontal ${value.x}%, vertical ${value.y}%`}
        aria-valuenow={value.x}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'bg-muted focus-visible:ring-primary relative aspect-[3/1] touch-none overflow-hidden rounded-lg border outline-none focus-visible:ring-2',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={(e) =>
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
        <CoverImage src={src} framing={value} className="pointer-events-none" />
        {/* Ponto focal: é o que sempre aparece, no celular e no computador */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${value.x}%`, top: `${value.y}%` }}
        />
        {!dragging && (
          <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
            <Move className="h-3.5 w-3.5" aria-hidden /> Arraste para ajustar
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ZoomIn className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
        <input
          type="range"
          min={COVER_ZOOM_MIN}
          max={COVER_ZOOM_MAX}
          step={5}
          value={value.zoom}
          onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })}
          aria-label="Zoom da capa"
          aria-valuetext={`${value.zoom}%`}
          className="accent-primary h-2 flex-1 cursor-pointer"
        />
        <span className="text-muted-foreground w-12 text-right text-xs tabular-nums">
          {value.zoom}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isDefault}
          onClick={() => onChange(DEFAULT_COVER_FRAMING)}
        >
          <RotateCcw /> Centralizar
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        No celular e no computador a capa corta um pouco diferente. O ponto marcado aparece sempre.
      </p>
    </div>
  )
}
