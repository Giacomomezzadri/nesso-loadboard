import { Trophy } from 'lucide-react'
import { useState } from 'react'
import { PlayerScatterChart, type ScatterPoint } from '../components/charts/PlayerScatterChart'
import { useReportSection } from '../components/report/ReportSection'
import { DateRangePicker } from '../components/ui/DateRangePicker'
import { EmptyState } from '../components/ui/EmptyState'
import { JUMP_TESTS, latestTestByPlayer } from '../lib/metrics/jumpTests'
import { distanceAbove19_8, distanceAbove25_2, mechanicalWork, sprintCount } from '../lib/metrics/metricsCatalog'
import { useCurrentSession } from '../state/CurrentSessionContext'
import { useAllSegmentsQuery, useJumpTestsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'
import { matchDayLabels, type DrillSegment, type Player, type SessionType } from '../types/domain'

type TypeFilter = SessionType | 'all'

const TYPE_FILTER_LABEL: Record<TypeFilter, string> = {
  all: 'ALL',
  training: 'Training',
  match: 'Match',
}

interface MetricSpec {
  key: string
  label: string
  unit: string
  getValue: (s: DrillSegment) => number
  aggregate: 'sum' | 'max'
  /** Computed on the period's matches only, whatever the type filter says. */
  matchOnly?: boolean
}

/** Sourced from the Roster, not from GPS sessions — same value regardless of the period/type filter, always the latest figure entered in Roster & Positions. */
interface RosterMetricSpec {
  key: string
  label: string
  unit: string
  getValue: (p: Player) => number | undefined
  sortOrder: 'asc' | 'desc'
  /** Overrides the unit-based default below. */
  decimals?: number
  /** Shown after the value, e.g. the dominant side of an asymmetry. */
  getSuffix?: (p: Player) => string | undefined
}

interface ScatterVarSpec {
  key: string
  label: string
  unit: string
  values: Map<string, number>
}

function aggregateByPlayer(segs: DrillSegment[], spec: Pick<MetricSpec, 'getValue' | 'aggregate'>): Map<string, number> {
  const byPlayer = new Map<string, number[]>()
  for (const seg of segs) {
    const list = byPlayer.get(seg.playerId) ?? []
    list.push(spec.getValue(seg))
    byPlayer.set(seg.playerId, list)
  }
  const result = new Map<string, number>()
  for (const [playerId, values] of byPlayer) {
    result.set(playerId, spec.aggregate === 'sum' ? values.reduce((a, b) => a + b, 0) : Math.max(...values))
  }
  return result
}

export function LeaderboardPage() {
  const { currentSession } = useCurrentSession()
  const { data: sessions = [] } = useSessionsQuery()
  const { data: segments = [], isLoading } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { data: settings } = useSettingsQuery()
  const { data: jumpTests = [] } = useJumpTestsQuery()
  const [metricKey, setMetricKey] = useState('td')
  // Empty means "not touched by the user yet" — falls back to the current session's own date below,
  // so the default view still shows a single day (that session) rather than the whole history.
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [xVarKey, setXVarKey] = useState('td')
  const [yVarKey, setYVarKey] = useState('vmax')
  const { inReport, show } = useReportSection()

  if (!currentSession || isLoading || !settings) return null

  const playerById = new Map(players.map((p) => [p.id, p]))
  const activePlayerIds = new Set(players.filter((p) => p.active).map((p) => p.id))
  const activePlayers = players.filter((p) => p.active)

  const metrics: MetricSpec[] = [
    { key: 'td', label: 'Distanza totale', unit: 'm', getValue: (s) => s.totalDistanceM, aggregate: 'sum' },
    { key: 'd198', label: 'Distanza > 19.8 km/h', unit: 'm', getValue: distanceAbove19_8, aggregate: 'sum' },
    { key: 'd252', label: 'Distanza > 25.2 km/h', unit: 'm', getValue: distanceAbove25_2, aggregate: 'sum' },
    { key: 'sprints', label: 'Sprint', unit: '#', getValue: (s) => sprintCount(s, settings), aggregate: 'sum' },
    { key: 'mechw', label: 'Mechanical Work', unit: '#', getValue: (s) => mechanicalWork(s, settings), aggregate: 'sum' },
    { key: 'vmax', label: 'Velocità massima', unit: 'km/h', getValue: (s) => s.maxSpeedKmh, aggregate: 'max' },
    { key: 'matchmin', label: 'Minuti giocati in partita', unit: 'min', getValue: (s) => s.durationSec / 60, aggregate: 'sum', matchOnly: true },
  ]
  // Figures from Roster & Positions — same for every player regardless of the period/type filter
  // below (always the latest value entered), unlike every GPS-derived metric above. Sprint times
  // rank ascending (fastest first); height/weight rank descending, like the GPS metrics.
  const rosterMetrics: RosterMetricSpec[] = [
    { key: 'sprint10m', label: 'Sprint 10m', unit: 's', getValue: (p) => p.sprint10mSec, sortOrder: 'asc' },
    { key: 'sprint30m', label: 'Sprint 30m', unit: 's', getValue: (p) => p.sprint30mSec, sortOrder: 'asc' },
    { key: 'height', label: 'Altezza', unit: 'cm', getValue: (p) => p.heightCm, sortOrder: 'desc' },
    { key: 'weight', label: 'Peso', unit: 'kg', getValue: (p) => p.weightKg, sortOrder: 'desc' },
  ]
  // Jump tests (ForceDecks imports): each player's LATEST test of that type, like the roster figures
  // above — independent of the period/type filter. Asymmetries rank ascending (most balanced first).
  const jumpMetrics: RosterMetricSpec[] = JUMP_TESTS.flatMap((def) => {
    const latest = latestTestByPlayer(jumpTests, def.testType)
    return [
      ...def.metrics.map(
        (m): RosterMetricSpec => ({
          key: `jump:${def.testType}:${m.column}`,
          label: `${def.label} · ${m.label}`,
          unit: m.unit,
          decimals: m.decimals,
          sortOrder: m.higherIsBetter ? 'desc' : 'asc',
          getValue: (p) => latest.get(p.id)?.metrics[m.column],
        }),
      ),
      ...def.asymmetries.map(
        (a): RosterMetricSpec => ({
          key: `jump-asym:${def.testType}:${a.column}`,
          label: `${def.label} · Asimmetria ${a.label.toLowerCase()}`,
          unit: '%',
          decimals: 1,
          sortOrder: 'asc',
          getValue: (p) => latest.get(p.id)?.asymmetries[a.column]?.pct,
          getSuffix: (p) => {
            const side = latest.get(p.id)?.asymmetries[a.column]?.side
            return side === 'L' ? 'SX' : side === 'R' ? 'DX' : undefined
          },
        }),
      ),
    ]
  })
  const rosterMetric = [...rosterMetrics, ...jumpMetrics].find((m) => m.key === metricKey)
  const isJumpMetric = jumpMetrics.some((m) => m.key === metricKey)
  const segmentMetric = metrics.find((m) => m.key === metricKey)

  const effectiveStart = startDate || currentSession.date
  const effectiveEnd = endDate || currentSession.date

  const scopeSessionIds = new Set(
    sessions
      .filter((s) => s.date >= effectiveStart && s.date <= effectiveEnd)
      .filter((s) => typeFilter === 'all' || s.type === typeFilter)
      .map((s) => s.id),
  )

  const scopedSegs = segments.filter(
    (s) => s.segmentKind === 'full_session' && scopeSessionIds.has(s.sessionId) && activePlayerIds.has(s.playerId),
  )
  const periodMatchIds = new Set(
    sessions.filter((s) => s.type === 'match' && s.date >= effectiveStart && s.date <= effectiveEnd).map((s) => s.id),
  )
  const matchScopedSegs = segments.filter(
    (s) => s.segmentKind === 'full_session' && periodMatchIds.has(s.sessionId) && activePlayerIds.has(s.playerId),
  )
  const segsFor = (m: MetricSpec) => (m.matchOnly ? matchScopedSegs : scopedSegs)

  if (!rosterMetric && segsFor(segmentMetric!).length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Nessun dato per questo periodo"
        description="Nessuna riga 'Full Session' trovata tra le date selezionate."
      />
    )
  }

  let rows: { playerId: string; name: string; value: number }[]
  let unit: string
  let higherIsBetter: boolean

  if (rosterMetric) {
    const sortSign = rosterMetric.sortOrder === 'asc' ? 1 : -1
    rows = activePlayers
      .map((p) => ({ playerId: p.id, name: p.displayName, value: rosterMetric.getValue(p) }))
      .filter((r): r is { playerId: string; name: string; value: number } => r.value !== undefined)
      .sort((a, b) => sortSign * (a.value - b.value))
    unit = rosterMetric.unit
    higherIsBetter = rosterMetric.sortOrder === 'desc'
  } else {
    const metric = segmentMetric!
    const byPlayer = new Map<string, number[]>()
    for (const seg of segsFor(metric)) {
      const list = byPlayer.get(seg.playerId) ?? []
      list.push(metric.getValue(seg))
      byPlayer.set(seg.playerId, list)
    }
    rows = [...byPlayer.entries()]
      .map(([playerId, values]) => ({
        playerId,
        name: playerById.get(playerId)?.displayName ?? playerId,
        value: metric.aggregate === 'sum' ? values.reduce((a, b) => a + b, 0) : Math.max(...values),
      }))
      .sort((a, b) => b.value - a.value)
    unit = metric.unit
    higherIsBetter = true
  }

  if (rosterMetric && rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Nessun dato registrato"
        description={
          isJumpMetric
            ? `Nessun giocatore attivo ha ancora un test con "${rosterMetric.label}". Importa i test di salto dalla pagina Sessioni.`
            : `Inserisci i dati di "${rosterMetric.label}" in Roster & Positions per vedere questa classifica.`
        }
      />
    )
  }

  const values = rows.map((r) => r.value)
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values, 0)
  const decimals = rosterMetric?.decimals ?? (unit === 'km/h' || unit === 'kg' ? 1 : unit === 's' ? 3 : 0)
  const barWidthPct = (value: number) => {
    if (higherIsBetter) return Math.min(100, (value / maxValue) * 100)
    const range = maxValue - minValue
    return range > 0 ? Math.min(100, ((maxValue - value) / range) * 100) : 100
  }

  // GPS-derived variables reuse the same period/mode-scoped segments as the leaderboard bars above;
  // anagraphic ones (height/weight) are constant per player, so the selected period doesn't apply to them.
  const scatterVariables: ScatterVarSpec[] = [
    ...metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit, values: aggregateByPlayer(segsFor(m), m) })),
    {
      key: 'height',
      label: 'Altezza',
      unit: 'cm',
      values: new Map(activePlayers.filter((p) => p.heightCm !== undefined).map((p) => [p.id, p.heightCm as number])),
    },
    {
      key: 'weight',
      label: 'Peso',
      unit: 'kg',
      values: new Map(activePlayers.filter((p) => p.weightKg !== undefined).map((p) => [p.id, p.weightKg as number])),
    },
    ...jumpMetrics.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      values: new Map(
        activePlayers.flatMap((p): [string, number][] => {
          const v = m.getValue(p)
          return v === undefined ? [] : [[p.id, v]]
        }),
      ),
    })),
  ]
  const xVar = scatterVariables.find((v) => v.key === xVarKey) ?? scatterVariables[0]
  const yVar = scatterVariables.find((v) => v.key === yVarKey) ?? scatterVariables[1]

  const scatterPoints: ScatterPoint[] = activePlayers.flatMap((p) => {
    const x = xVar.values.get(p.id)
    const y = yVar.values.get(p.id)
    if (x === undefined || y === undefined) return []
    return [{ playerId: p.id, name: p.displayName, initials: p.displayName.replace(/\s+/g, '').slice(0, 4).toUpperCase(), x, y }]
  })

  return (
    <div className="flex flex-col gap-4">
      <div className={inReport ? 'hidden' : 'rounded-md border border-border bg-surface p-3 text-sm text-ink-secondary'}>
        Classifica dei giocatori attivi in base alla metrica scelta. Le metriche GPS sono calcolate sul periodo e
        sul tipo di sessione selezionati. Le metriche contrassegnate con <strong>*</strong> (Sprint 10m, Sprint
        30m, Altezza, Peso) vengono invece da Roster &amp; Positions: sono <strong>indipendenti dal periodo
        selezionato</strong> e mostrano sempre il dato più recente inserito. Lo stesso vale per i{' '}
        <strong>test di salto</strong> (CMJ, Drop Jump), che usano l'ultimo test di ogni giocatore; le asimmetrie sono
        ordinate dalla più bassa. <strong>Minuti giocati in partita</strong> segue il periodo scelto ma conta sempre
        solo le partite, qualunque sia il filtro Training/Match. Lo scatterplot in fondo mette a
        confronto due variabili a scelta (anche altezza e peso) per individuare relazioni tra i giocatori.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary">Metrica</span>
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
          >
            <optgroup label="GPS">
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Roster">
              {rosterMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} *
                </option>
              ))}
            </optgroup>
            <optgroup label="Test di salto (ultimo test)">
              {jumpMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} *
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <DateRangePicker
          startDate={effectiveStart}
          endDate={effectiveEnd}
          onChange={(newStart, newEnd) => {
            setStartDate(newStart)
            setEndDate(newEnd)
          }}
          matchDayLabels={matchDayLabels(sessions)}
        />
        <div className="flex rounded-md border border-border p-0.5 text-sm">
          {(Object.keys(TYPE_FILTER_LABEL) as TypeFilter[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTypeFilter(tf)}
              className={`rounded px-3 py-1 ${typeFilter === tf ? 'bg-accent text-accent-ink' : 'text-ink-secondary'}`}
            >
              {TYPE_FILTER_LABEL[tf]}
            </button>
          ))}
        </div>
      </div>

      {show('ranking') && (
      <div className="panel p-4">
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={row.playerId} className="flex items-center gap-3 text-sm">
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-ink-muted">{i + 1}</span>
              <span className="w-28 shrink-0 truncate font-medium text-ink">{row.name}</span>
              <div className="h-4 flex-1 rounded bg-ink/5">
                <div
                  className={`h-4 rounded ${i < 3 ? 'bg-accent' : 'bg-ink-muted'}`}
                  style={{ width: `${barWidthPct(row.value)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-ink">
                {row.value.toFixed(decimals)}
                {rosterMetric && unit ? ` ${unit}` : ''}
                {rosterMetric?.getSuffix && playerById.get(row.playerId)
                  ? ` ${rosterMetric.getSuffix(playerById.get(row.playerId)!) ?? ''}`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
      )}

      {show('scatter') && (
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-base font-medium text-ink">Scatterplot</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-ink-secondary">Asse X</span>
              <select
                value={xVarKey}
                onChange={(e) => setXVarKey(e.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
              >
                {scatterVariables.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-ink-secondary">Asse Y</span>
              <select
                value={yVarKey}
                onChange={(e) => setYVarKey(e.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
              >
                {scatterVariables.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {scatterPoints.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            Dati insufficienti per questo confronto nel periodo e nella modalità selezionati.
          </p>
        ) : (
          <PlayerScatterChart
            points={scatterPoints}
            xLabel={`${xVar.label}${xVar.unit ? ` (${xVar.unit})` : ''}`}
            yLabel={`${yVar.label}${yVar.unit ? ` (${yVar.unit})` : ''}`}
          />
        )}
      </div>
      )}
    </div>
  )
}
