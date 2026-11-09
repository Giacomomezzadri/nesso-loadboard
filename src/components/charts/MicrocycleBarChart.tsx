import { formatFraction } from '../../lib/utils'
import type { Player } from '../../types/domain'

export interface MicrocycleMetricRow {
  key: string
  label: string
  pct: number | null
  /** The player's load so far and the textbook microcycle's — the two figures behind `pct`. */
  numerator: number
  denominator: number | null
  unit: string
  lowSample: boolean
}

export interface PlayerMicrocycleData {
  player: Player
  sessionsSinceLastMatch: number
  metrics: MicrocycleMetricRow[]
}

export interface MicrocycleBarChartGroup {
  label: string
  players: PlayerMicrocycleData[]
}

/** Bars beyond this are visually clamped (the number label always shows the true value) — keeps one overloaded metric from squashing every other bar's scale. */
const SCALE_MAX = 180
const REFERENCE_PCT = 100
const REFERENCE_POSITION = `${(REFERENCE_PCT / SCALE_MAX) * 100}%`

function fillWidth(pct: number) {
  return `${(Math.min(pct, SCALE_MAX) / SCALE_MAX) * 100}%`
}

/**
 * One panel per player, one spaced-out row per metric — a single-hue bar
 * against a fixed 100% reference tick (the historical "textbook" microcycle),
 * so the load is a length and a number, never a color judgement.
 */
export function MicrocycleBarChart({ groups }: { groups: MicrocycleBarChartGroup[] }) {
  const anyLowSample = groups.some((g) => g.players.some((p) => p.metrics.some((m) => m.lowSample)))

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-4">
          {groups.length > 1 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.label}</p>
          )}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {group.players.map((data) => (
              <PlayerMicrocyclePanel key={data.player.id} data={data} />
            ))}
          </div>
        </div>
      ))}
      {anyLowSample && (
        <p className="text-xs text-ink-muted">
          * poche sessioni finora in questo microciclo: percentuale poco affidabile.
        </p>
      )}
    </div>
  )
}

function PlayerMicrocyclePanel({ data }: { data: PlayerMicrocycleData }) {
  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="font-medium text-ink">{data.player.displayName}</p>
        <span className="shrink-0 text-xs text-ink-muted">{data.sessionsSinceLastMatch} sedute da ultima gara</span>
      </div>
      <div className="flex flex-col gap-4">
        {data.metrics.map((row) => (
          <MicrocycleBarRow key={row.key} row={row} />
        ))}
      </div>
    </div>
  )
}

function MicrocycleBarRow({ row }: { row: MicrocycleMetricRow }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-32 shrink-0 truncate text-ink-secondary" title={row.label}>
        {row.label}
      </span>
      <div className="relative h-3 flex-1 rounded-full bg-ink/5">
        {row.pct !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: fillWidth(row.pct), backgroundColor: 'var(--color-series-blue)' }}
          />
        )}
        <div
          className="absolute inset-y-0 w-px bg-ink-muted/60"
          style={{ left: REFERENCE_POSITION }}
          title="100% del microciclo tipo storico"
        />
      </div>
      <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-ink">
        {row.pct !== null ? `${row.pct.toFixed(0)}%` : '—'}
        {row.lowSample && <span className="text-status-warning">*</span>}
      </span>
      <span className="w-28 shrink-0 text-right tabular-nums text-ink-muted">
        {row.denominator !== null ? formatFraction(row.numerator, row.denominator, row.unit) : '—'}
      </span>
    </div>
  )
}
