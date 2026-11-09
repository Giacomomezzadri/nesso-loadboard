import { Users } from 'lucide-react'
import { useState } from 'react'
import { DateRangePicker } from '../components/ui/DateRangePicker'
import { EmptyState } from '../components/ui/EmptyState'
import {
  accHighCount,
  decHighCount,
  distanceAbove19_8,
  distanceAbove25_2,
  mechanicalWork,
  sprintCount,
} from '../lib/metrics/metricsCatalog'
import { matchAvailableSeconds } from '../lib/metrics/attendance'
import { median } from '../lib/metrics/heatmap'
import { useCurrentSession } from '../state/CurrentSessionContext'
import { useAllSegmentsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'
import { matchDayLabels, type DrillSegment, type SessionType } from '../types/domain'

const PLAYER_COLORS = ['var(--color-series-blue)', 'var(--color-series-orange)', 'var(--color-series-aqua)']
const MAX_PLAYERS = 3

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
  aggregate: (segs: DrillSegment[]) => number
  format?: (v: number) => string
  /** Computed on the period's matches only, whatever the type filter says. */
  matchOnly?: boolean
}

const sumBy =
  (getValue: (s: DrillSegment) => number) =>
  (segs: DrillSegment[]): number =>
    segs.reduce((acc, s) => acc + getValue(s), 0)

const maxBy =
  (getValue: (s: DrillSegment) => number) =>
  (segs: DrillSegment[]): number =>
    Math.max(...segs.map(getValue))

// Rates (m/min, mechanical work/min) are recomputed from the summed totals rather than summed
// themselves — summing a per-minute rate across days would inflate it, not aggregate it.
const ratePerMin =
  (numerator: (s: DrillSegment) => number) =>
  (segs: DrillSegment[]): number => {
    const totalMin = sumBy((s) => s.durationSec)(segs) / 60
    return totalMin > 0 ? sumBy(numerator)(segs) / totalMin : 0
  }

/** 1-based rank of `value` within `allValues`, higher is better — ties share the same rank. */
function teamRank(value: number, allValues: number[]): number {
  return 1 + allValues.filter((v) => v > value).length
}

export function ComparePage() {
  const { currentSession } = useCurrentSession()
  const { data: sessions = [] } = useSessionsQuery()
  const { data: segments = [], isLoading } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { data: settings } = useSettingsQuery()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Empty means "not touched by the user yet" — falls back to the current session's own date,
  // so the default view still shows a single day rather than the whole history.
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const playerById = new Map(players.map((p) => [p.id, p]))
  const activePlayerIds = new Set(players.filter((p) => p.active).map((p) => p.id))

  if (!currentSession || isLoading || !settings) return null

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

  const periodMatches = sessions.filter((s) => s.type === 'match' && s.date >= effectiveStart && s.date <= effectiveEnd)
  const periodMatchIds = new Set(periodMatches.map((s) => s.id))
  const matchSegs = segments.filter((s) => s.segmentKind === 'full_session' && periodMatchIds.has(s.sessionId))
  const availableMatchMin = matchAvailableSeconds(periodMatches, matchSegs) / 60

  if (scopedSegs.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nessun dato per questo periodo"
        description="Nessuna riga 'Full Session' trovata tra le date selezionate."
      />
    )
  }

  const segsByPlayer = new Map<string, DrillSegment[]>()
  for (const seg of scopedSegs) {
    const list = segsByPlayer.get(seg.playerId) ?? []
    list.push(seg)
    segsByPlayer.set(seg.playerId, list)
  }
  const playersInScope = [...segsByPlayer.keys()]
  const matchSegsByPlayer = new Map<string, DrillSegment[]>()
  for (const seg of matchSegs) {
    if (!activePlayerIds.has(seg.playerId)) continue
    const list = matchSegsByPlayer.get(seg.playerId) ?? []
    list.push(seg)
    matchSegsByPlayer.set(seg.playerId, list)
  }
  const segsOf = (metric: MetricSpec, playerId: string) =>
    (metric.matchOnly ? matchSegsByPlayer : segsByPlayer).get(playerId) ?? []

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id)
      if (prev.length >= MAX_PLAYERS) return prev
      return [...prev, id]
    })
  }

  const selectedPlayerIds = selectedIds.filter((id) => segsByPlayer.has(id))

  const sections: { title: string; metrics: MetricSpec[] }[] = [
    {
      title: 'Volume',
      metrics: [
        { key: 'td', label: 'Distanza totale', unit: 'm', aggregate: sumBy((s) => s.totalDistanceM) },
        { key: 'tdmin', label: 'Distanza / min', unit: 'm/min', aggregate: ratePerMin((s) => s.totalDistanceM), format: (v) => v.toFixed(1) },
        { key: 'dur', label: 'Durata', unit: 'min', aggregate: sumBy((s) => s.durationSec / 60) },
        {
          key: 'matchmin',
          label: 'Minuti in partita',
          unit: 'min',
          aggregate: sumBy((s) => s.durationSec / 60),
          matchOnly: true,
          format: (v) => (availableMatchMin > 0 ? `${v.toFixed(0)} · ${((v / availableMatchMin) * 100).toFixed(0)}%` : v.toFixed(0)),
        },
      ],
    },
    {
      title: 'Alta velocità',
      metrics: [
        { key: 'hsr', label: 'HSR (>19.8 km/h)', unit: 'm', aggregate: sumBy(distanceAbove19_8) },
        { key: 'sprintd', label: 'Sprint (>25.2 km/h)', unit: 'm', aggregate: sumBy(distanceAbove25_2) },
        { key: 'nsprint', label: '# Sprint', unit: '', aggregate: sumBy((s) => sprintCount(s, settings)) },
        { key: 'vmax', label: 'Velocità massima', unit: 'km/h', aggregate: maxBy((s) => s.maxSpeedKmh), format: (v) => v.toFixed(1) },
      ],
    },
    {
      title: 'Meccanico',
      metrics: [
        { key: 'mechw', label: 'Mechanical Work', unit: '#', aggregate: sumBy((s) => mechanicalWork(s, settings)) },
        { key: 'mechwmin', label: 'MechW / min', unit: '#/min', aggregate: ratePerMin((s) => mechanicalWork(s, settings)), format: (v) => v.toFixed(2) },
        { key: 'acchigh', label: 'Acc. alta', unit: '#', aggregate: sumBy((s) => accHighCount(s, settings)) },
        { key: 'dechigh', label: 'Dec. alta', unit: '#', aggregate: sumBy((s) => decHighCount(s, settings)) },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-secondary">Periodo</span>
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
        <span className="text-xs text-ink-muted">
          I dati dei giorni selezionati vengono sommati (o presi al massimo/ricalcolati per le metriche al minuto).
          «Minuti in partita» conta sempre solo le partite del periodo, con la % sui minuti disponibili.
        </span>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-secondary">Scegli fino a {MAX_PLAYERS} giocatori</p>
        <div className="flex flex-wrap gap-2">
          {playersInScope.map((playerId) => {
            const idx = selectedIds.indexOf(playerId)
            const isSelected = idx >= 0
            return (
              <button
                key={playerId}
                type="button"
                onClick={() => toggle(playerId)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isSelected ? 'border-transparent text-white' : 'border-border text-ink-secondary hover:bg-ink/5'
                }`}
                style={isSelected ? { backgroundColor: PLAYER_COLORS[idx] } : undefined}
              >
                {playerById.get(playerId)?.displayName ?? playerId}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Il confronto si ferma a tre giocatori per scelta: sono i colori che restano distinguibili anche con
          daltonismo.
        </p>
      </div>

      {selectedPlayerIds.length === 0 ? (
        <EmptyState icon={Users} title="Seleziona almeno un giocatore" description="Scegli fino a 3 giocatori sopra per confrontarli." />
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs">
            {selectedPlayerIds.map((playerId, i) => (
              <div key={playerId} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                <span className="font-medium text-ink">{playerById.get(playerId)?.displayName}</span>
              </div>
            ))}
            <span className="text-ink-muted">La riga grigia sulle barre è la mediana squadra (n={playersInScope.length})</span>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="panel p-4">
              <p className="font-display mb-3 text-base font-medium text-ink">{section.title}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {section.metrics.map((metric) => {
                  const allValues = playersInScope.map((playerId) => metric.aggregate(segsOf(metric, playerId)))
                  const teamMedian = median(allValues)
                  const format = metric.format ?? ((v: number) => v.toFixed(0))
                  const maxScale = Math.max(...allValues, 1)
                  return (
                    <div key={metric.key} className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-ink-secondary">
                        {metric.label} {metric.unit && <span className="text-ink-muted">({metric.unit})</span>}
                      </p>
                      {selectedPlayerIds.map((playerId, i) => {
                        const value = metric.aggregate(segsOf(metric, playerId))
                        const rank = teamRank(value, allValues)
                        return (
                          <div key={playerId} className="flex items-center gap-2 text-xs">
                            <div className="relative h-4 flex-1 rounded bg-ink/5">
                              <div
                                className="h-4 rounded"
                                style={{ width: `${Math.min(100, (value / maxScale) * 100)}%`, backgroundColor: PLAYER_COLORS[i] }}
                              />
                              <div
                                className="absolute top-0 h-4 w-px bg-ink-muted"
                                style={{ left: `${Math.min(100, (teamMedian / maxScale) * 100)}%` }}
                              />
                            </div>
                            <span className="w-32 shrink-0 text-right tabular-nums text-ink">
                              {format(value)} <span className="text-ink-muted">({rank}°)</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
