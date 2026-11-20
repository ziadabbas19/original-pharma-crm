import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { formatDay, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** A single headline number. */
export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-card border bg-card p-4 shadow-card">
      <span className="truncate text-label font-semibold text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="truncate text-2xl font-bold tabular-nums xl:text-[28px]" title={value}>
        {value}
      </span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export interface BarItem {
  key: string
  label: string
  value: number
  /** Text at the tip of the bar. */
  display: string
  /** Extra detail on hover, e.g. the number of orders behind a value. */
  detail?: string
}

/** Ranked horizontal bars: reads well at phone width and in both languages. */
export function BarList({ items, className }: { items: BarItem[]; className?: string }) {
  const max = Math.max(...items.map((i) => i.value), 0)
  return (
    <ul className={cn('grid gap-2.5', className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="group grid gap-1"
          title={item.detail ?? `${item.label}: ${item.display}`}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{item.display}</span>
          </div>
          <div className="h-2 rounded-e bg-muted">
            <div
              className="h-full rounded-e bg-primary transition-opacity group-hover:opacity-80"
              style={{
                width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 1 : 0) : 0}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export interface TrendDatum {
  date: string
  value: number
}

const HEIGHT = 190
const PAD = { top: 12, right: 12, bottom: 24, left: 52 }

function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10
  return step * power
}

function compact(value: number): string {
  return value >= 10_000 ? `${formatNumber(value / 1000, 1)}K` : formatNumber(value, value < 10 ? 1 : 0)
}

/**
 * One series over time: a 2px line with a light wash, hairline grid and a crosshair that snaps to the
 * nearest day (pointer, or arrow keys when focused). Time always runs left to right, in Arabic too.
 */
export function TrendChart({
  data,
  label,
  tooltip,
  tone = 'planned',
}: {
  data: TrendDatum[]
  label: string
  /** Planned or general series in the brand blue, actual (done) series in green. */
  tone?: 'planned' | 'actual'
  /** Lines shown for the day under the crosshair. */
  tooltip: (index: number) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const gradient = useId()
  const stroke = tone === 'actual' ? 'var(--chart-actual)' : 'var(--chart-planned)'
  const fill = tone === 'actual' ? 'var(--chart-actual-fill)' : 'var(--chart-planned)'
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data])
  const innerW = Math.max(width - PAD.left - PAD.right, 1)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const line = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join('')
  const area = `${line}L${x(data.length - 1).toFixed(1)},${PAD.top + innerH}L${x(0).toFixed(1)},${PAD.top + innerH}Z`
  const ticks = [0, 0.5, 1].map((f) => f * max)
  const dateTicks =
    data.length > 2 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : data.map((_, i) => i)

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left
    const ratio = (e.clientX - left - PAD.left) / innerW
    setActive(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))))
  }
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + step)))
  }

  const shown = active ?? data.length - 1
  const flip = data.length > 0 && x(shown) > width / 2

  return (
    <div ref={box} dir="ltr" className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 && data.length > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setActive(null)}
          onKeyDown={keys}
          onBlur={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={fill} stopOpacity="0.16" />
              <stop offset="1" stopColor={fill} stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--chart-grid)"
              />
              <text
                x={PAD.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {compact(tick)}
              </text>
            </g>
          ))}
          {dateTicks.map((i, position) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={position === 0 ? 'start' : position === dateTicks.length - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[11px]"
            >
              {formatDay(data[i].date)}
            </text>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--muted-foreground)"
            />
          )}
          <circle
            cx={x(shown)}
            cy={y(data[shown].value)}
            r={4}
            fill={stroke}
            stroke="var(--card)"
            strokeWidth={2}
          />
        </svg>
      )}
      {active !== null && data[active] && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-10 grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={flip ? { right: width - x(active) + 8 } : { left: x(active) + 8 }}
        >
          <span className="text-muted-foreground">{formatDay(data[active].date)}</span>
          {tooltip(active)}
        </div>
      )}
    </div>
  )
}
