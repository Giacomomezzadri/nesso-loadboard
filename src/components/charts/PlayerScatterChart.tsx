import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'

export interface ScatterPoint {
  playerId: string
  name: string
  initials: string
  x: number
  y: number
  /** 'player' = dark blue, 'role' = light blue; when anything is highlighted the rest turn grey. */
  highlight?: 'player' | 'role'
}

/** Two clearly different blues: a dark navy for the one player, a light sky blue for the role. */
export const HIGHLIGHT_FILL = { player: '#1e3a8a', role: '#7dd3fc' } as const
const HIGHLIGHT_INK = { player: '#ffffff', role: '#12172b' } as const

interface PlayerScatterChartProps {
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  height?: number
}

const DOT_RADIUS = 15

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/**
 * Recharts' default numeric domain is [0, dataMax] — fine for a bar chart
 * anchored to zero, but it crowds every point into a sliver of the axis for
 * a variable whose real values sit far from zero (height, weight, Vmax...).
 * Zoom to the data's own spread instead, with headroom so points don't sit
 * flush against the axis. Never dips below 0 — every variable here is a
 * physically non-negative quantity.
 */
function tightDomain(values: number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const pad = range > 0 ? range * 0.15 : Math.max(Math.abs(max) * 0.1, 1)
  return [Math.max(0, min - pad), max + pad]
}

/** One accent-colored dot per player, with initials set directly inside the
 * mark — identity is legible at a glance without a legend or hover, matching
 * the "label inside a colored fill" exception (pick ink by the fill's
 * luminance). A 2px surface ring keeps overlapping dots distinct. */
function PlayerDot(props: { cx?: number; cy?: number; payload?: ScatterPoint; dimmed?: boolean }) {
  const { cx, cy, payload, dimmed } = props
  if (cx === undefined || cy === undefined || !payload) return null
  const fill = payload.highlight ? HIGHLIGHT_FILL[payload.highlight] : dimmed ? 'var(--color-ink-muted)' : 'var(--color-accent)'
  const ink = payload.highlight ? HIGHLIGHT_INK[payload.highlight] : dimmed ? 'var(--color-surface)' : 'var(--color-accent-ink)'
  return (
    <g opacity={!payload.highlight && dimmed ? 0.45 : 1}>
      <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={fill} stroke="var(--color-surface)" strokeWidth={2} />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={700}
        fill={ink}
      >
        {payload.initials}
      </text>
    </g>
  )
}

function ScatterTooltip({
  active,
  payload,
  xLabel,
  yLabel,
}: {
  active?: boolean
  payload?: { payload: ScatterPoint }[]
  xLabel: string
  yLabel: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '6px 10px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{point.name}</div>
      <div style={{ color: 'var(--color-ink-secondary)' }}>
        {xLabel}: {formatValue(point.x)}
      </div>
      <div style={{ color: 'var(--color-ink-secondary)' }}>
        {yLabel}: {formatValue(point.y)}
      </div>
    </div>
  )
}

export function PlayerScatterChart({ points, xLabel, yLabel, height = 380 }: PlayerScatterChartProps) {
  const xDomain = tightDomain(points.map((p) => p.x))
  const yDomain = tightDomain(points.map((p) => p.y))
  const anyHighlight = points.some((p) => p.highlight)
  // SVG paints in order: highlighted dots last so they sit on top (the player above the role).
  const rank = (p: ScatterPoint) => (p.highlight === 'player' ? 2 : p.highlight === 'role' ? 1 : 0)
  const ordered = [...points].sort((a, b) => rank(a) - rank(b))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          domain={xDomain}
          padding={{ left: 24, right: 24 }}
          tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
          tickFormatter={formatValue}
          axisLine={{ stroke: 'var(--color-baseline)' }}
          tickLine={false}
          label={{ value: xLabel, position: 'insideBottom', offset: -16, fill: 'var(--color-ink-secondary)', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          domain={yDomain}
          padding={{ top: 24, bottom: 24 }}
          tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
          tickFormatter={formatValue}
          axisLine={false}
          tickLine={false}
          width={56}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-ink-secondary)', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-baseline)' }}
          content={<ScatterTooltip xLabel={xLabel} yLabel={yLabel} />}
        />
        <Scatter data={ordered} shape={(props: object) => <PlayerDot {...props} dimmed={anyHighlight} />} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
