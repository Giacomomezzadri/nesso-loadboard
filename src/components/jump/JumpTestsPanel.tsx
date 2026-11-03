import { Activity } from 'lucide-react'
import {
  ASYMMETRY_CRITICAL_PCT,
  ASYMMETRY_WARNING_PCT,
  JUMP_TESTS,
  asymmetryLevel,
  latestTestByPlayer,
  playerTestsOfType,
  type AsymmetryLevel,
  type JumpMetricDef,
  type JumpTestDef,
} from '../../lib/metrics/jumpTests'
import { median } from '../../lib/metrics/heatmap'
import { cn, formatNumber } from '../../lib/utils'
import type { Asymmetry, JumpTest } from '../../types/domain'
import { TrendLine } from '../charts/TrendLine'

const LEVEL_STYLE: Record<AsymmetryLevel, { bar: string; text: string }> = {
  ok: { bar: 'bg-status-good', text: 'text-ink' },
  warning: { bar: 'bg-status-serious', text: 'text-status-serious' },
  critical: { bar: 'bg-status-critical', text: 'text-status-critical' },
}
/** Bars are drawn on a 0–30% scale (or wider when a value exceeds it), so 15/20% sit at a fixed spot. */
const ASYMMETRY_SCALE_PCT = 30
const SIDE_LABEL = { L: 'SX', R: 'DX' } as const

const TEST_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const SHORT_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (f: Intl.DateTimeFormat, iso: string) => f.format(new Date(iso + 'T00:00:00Z'))

function MetricTile({ def, latest, previous, teamMedian }: { def: JumpMetricDef; latest: JumpTest; previous?: JumpTest; teamMedian: number | null }) {
  const value = latest.metrics[def.column]
  const prev = previous?.metrics[def.column]
  const delta = value !== undefined && prev !== undefined ? value - prev : undefined
  const improved = delta !== undefined && delta !== 0 ? (delta > 0) === def.higherIsBetter : undefined

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-page px-3 py-2.5">
      <span className="text-xs text-ink-secondary">{def.label}</span>
      <span className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold tabular-nums leading-none text-ink">
          {value === undefined ? '—' : formatNumber(value, def.decimals)}
        </span>
        {def.unit && <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{def.unit}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-ink-muted">
        {delta !== undefined && (
          <span className={cn('font-medium', improved === undefined ? 'text-ink-muted' : improved ? 'text-status-good' : 'text-status-critical')}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {formatNumber(Math.abs(delta), def.decimals)}
          </span>
        )}
        {teamMedian !== null && <span>Mediana {formatNumber(teamMedian, def.decimals)}</span>}
      </span>
    </div>
  )
}

/** A left|right bar from the centre line: the filled half is the dominant side, its length the %. */
function AsymmetryRow({ label, asym }: { label: string; asym?: Asymmetry }) {
  if (!asym) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4.5rem] items-center gap-3 text-sm">
        <span className="truncate text-ink-secondary">{label}</span>
        <span className="h-2 rounded-full bg-ink/5" />
        <span className="text-right text-ink-muted">—</span>
      </div>
    )
  }
  const level = asymmetryLevel(asym.pct)
  const scale = Math.max(ASYMMETRY_SCALE_PCT, asym.pct)
  const width = `${(asym.pct / scale) * 100}%`
  const markers = [ASYMMETRY_WARNING_PCT, ASYMMETRY_CRITICAL_PCT].map((t) => `${(t / scale) * 100}%`)

  const half = (side: 'L' | 'R') => (
    <span className={cn('relative h-2 overflow-hidden bg-ink/6', side === 'L' ? 'rounded-l-full' : 'rounded-r-full')}>
      {markers.map((m) => (
        <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-ink/15" style={side === 'L' ? { right: m } : { left: m }} />
      ))}
      {asym.side === side && (
        <span className={cn('absolute inset-y-0', LEVEL_STYLE[level].bar, side === 'L' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full')} style={{ width }} />
      )}
    </span>
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4.5rem] items-center gap-3 text-sm">
      <span className="truncate text-ink-secondary">{label}</span>
      <span className="grid grid-cols-2 gap-px" title={`${formatNumber(asym.pct, 1)}%${asym.side ? ` ${SIDE_LABEL[asym.side]}` : ''}`}>
        {half('L')}
        {half('R')}
      </span>
      <span className={cn('text-right font-semibold tabular-nums', LEVEL_STYLE[level].text)}>
        {formatNumber(asym.pct, 1)}%
        {asym.side && <span className="ml-1 text-[11px] font-medium text-ink-muted">{SIDE_LABEL[asym.side]}</span>}
      </span>
    </div>
  )
}

function TestCard({ def, playerId, allTests, activePlayerIds }: { def: JumpTestDef; playerId: string; allTests: JumpTest[]; activePlayerIds: Set<string> }) {
  const history = playerTestsOfType(allTests, playerId, def.testType)
  const latest = history[history.length - 1]
  const previous = history[history.length - 2]

  if (!latest) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-4">
        <p className="font-display text-base font-medium text-ink">{def.label}</p>
        <p className="text-sm text-ink-muted">Nessun test registrato.</p>
      </div>
    )
  }

  // Team reference: each active player's own latest test of this type.
  const teamLatest = [...latestTestByPlayer(allTests, def.testType).values()].filter((t) => activePlayerIds.has(t.playerId))
  const teamMedian = (column: string) => {
    const values = teamLatest.map((t) => t.metrics[column]).filter((v): v is number => v !== undefined)
    return values.length > 1 ? median(values) : null
  }
  const trendDef = def.metrics.find((m) => m.column === def.trendColumn)
  const trend = history
    .filter((t) => t.metrics[def.trendColumn] !== undefined)
    .map((t) => ({ x: fmtDate(SHORT_DATE, t.date), value: t.metrics[def.trendColumn] }))

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-semibold text-ink">{def.label}</p>
        <p className="text-xs text-ink-muted">
          Ultimo test <span className="font-medium text-ink-secondary">{fmtDate(TEST_DATE, latest.date)}</span>
          {latest.bodyWeightKg !== undefined && ` · ${formatNumber(latest.bodyWeightKg, 1)} kg`}
          {history.length > 1 && ` · ${history.length} test`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {def.metrics.map((m) => (
          <MetricTile key={m.column} def={m} latest={latest} previous={previous} teamMedian={teamMedian(m.column)} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Asimmetrie</span>
          <span className="flex items-center gap-3 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-status-serious" />≥ {ASYMMETRY_WARNING_PCT}%
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-status-critical" />≥ {ASYMMETRY_CRITICAL_PCT}%
            </span>
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4.5rem] gap-3 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
          <span />
          <span className="flex justify-between">
            <span>Sinistra</span>
            <span>Destra</span>
          </span>
          <span />
        </div>
        {def.asymmetries.map((a) => (
          <AsymmetryRow key={a.column} label={a.label} asym={latest.asymmetries[a.column]} />
        ))}
      </div>

      {trend.length > 1 && trendDef && (
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Andamento · {trendDef.label}</span>
          <TrendLine data={trend} height={120} valueFormatter={(v) => `${formatNumber(v, trendDef.decimals)} ${trendDef.unit}`} />
        </div>
      )}
    </div>
  )
}

/** Player Profile panel: latest CMJ and Drop Jump, vs the previous test and the team median, with L/R asymmetries. */
export function JumpTestsPanel({ playerId, tests, activePlayerIds }: { playerId: string; tests: JumpTest[]; activePlayerIds: Set<string> }) {
  const hasAny = tests.some((t) => t.playerId === playerId)
  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
          <Activity className="size-4 text-primary" />
          Test di salto
        </p>
        <p className="text-xs text-ink-muted">▲▼ rispetto al test precedente · mediana dell'ultimo test dei giocatori attivi</p>
      </div>
      {hasAny ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {JUMP_TESTS.map((def) => (
            <TestCard key={def.testType} def={def} playerId={playerId} allTests={tests} activePlayerIds={activePlayerIds} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Nessun test di salto importato per questo giocatore. Si importano dalla pagina Sessioni.</p>
      )}
    </section>
  )
}
