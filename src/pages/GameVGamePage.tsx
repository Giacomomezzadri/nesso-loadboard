import { Flag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useReportSection } from '../components/report/ReportSection'
import { ComparisonBar } from '../components/ui/ComparisonBar'
import { EmptyState } from '../components/ui/EmptyState'
import { distanceAbove19_8, distanceAbove25_2, mechanicalWork } from '../lib/metrics/metricsCatalog'
import { cn, formatNumber, mean } from '../lib/utils'
import { useAllSegmentsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'
import {
  MATCH_LOCATION_LABEL,
  MATCH_RESULT_LABEL,
  type DrillSegment,
  type MatchLocation,
  type MatchResult,
  type Session,
} from '../types/domain'

type GroupBy = 'location' | 'result'
const UNCLASSIFIED = '__unclassified__'

interface MetricSpec {
  key: string
  label: string
  unit: string
  volume: (s: DrillSegment) => number
}

const METRICS: MetricSpec[] = [
  { key: 'td', label: 'Distanza totale', unit: 'm', volume: (s) => s.totalDistanceM },
  { key: 'd198', label: 'Distanza > 19.8 km/h', unit: 'm', volume: distanceAbove19_8 },
  { key: 'd252', label: 'Distanza > 25.2 km/h', unit: 'm', volume: distanceAbove25_2 },
]

function MatchBadge({ session }: { session: Session }) {
  return (
    <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink-secondary">
      {session.label} <span className="text-ink-muted">({session.date})</span>
      {session.matchResult && <> · {MATCH_RESULT_LABEL[session.matchResult]}</>}
      {session.matchLocation && <> · {MATCH_LOCATION_LABEL[session.matchLocation]}</>}
    </span>
  )
}

export function GameVGamePage() {
  const { data: sessions = [] } = useSessionsQuery()
  const { data: rawSegments = [], isLoading } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { data: settings } = useSettingsQuery()
  const [matchAId, setMatchAId] = useState<string | undefined>(undefined)
  const [matchBId, setMatchBId] = useState<string | undefined>(undefined)
  const [groupBy, setGroupBy] = useState<GroupBy>('location')
  const { inReport, show } = useReportSection()

  const matchSessions = useMemo(
    () => sessions.filter((s) => s.type === 'match').sort((a, b) => b.date.localeCompare(a.date)),
    [sessions],
  )

  if (isLoading || !settings) return null

  // Deactivated players never show up again, anywhere on this page, until reactivated in Roster & Positions.
  const activePlayerIds = new Set(players.filter((p) => p.active).map((p) => p.id))
  const segments = rawSegments.filter((s) => activePlayerIds.has(s.playerId))

  if (matchSessions.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="Nessuna partita importata"
        description="Importa almeno una sessione di tipo Partita per usare questa vista."
      />
    )
  }

  const activeAId = matchAId && matchSessions.some((s) => s.id === matchAId) ? matchAId : matchSessions[0].id
  const defaultBId = matchSessions.find((s) => s.id !== activeAId)?.id ?? matchSessions[0].id
  const activeBId = matchBId && matchSessions.some((s) => s.id === matchBId) ? matchBId : defaultBId

  const matchA = matchSessions.find((s) => s.id === activeAId)
  const matchB = matchSessions.find((s) => s.id === activeBId)

  const mechWorkSpec: MetricSpec = {
    key: 'mechw',
    label: 'Mechanical Work',
    unit: '#',
    volume: (s) => mechanicalWork(s, settings),
  }
  const allMetrics = [...METRICS, mechWorkSpec]

  // Rehab (injured) players are excluded from every match average on this page.
  const fullSegsForSession = (sessionId: string | undefined) =>
    segments.filter((s) => s.sessionId === sessionId && s.segmentKind === 'full_session' && !s.isRehab)
  const segsA = fullSegsForSession(matchA?.id)
  const segsB = fullSegsForSession(matchB?.id)

  // Minutes per player in each match — team averages above mix full games and substitutes, so
  // this is what tells a fitness drop apart from a 60th-minute substitution.
  const playerNameById = new Map(players.map((p) => [p.id, p.displayName]))
  const minutesIn = (sessionId: string | undefined) => {
    const byPlayer = new Map<string, number>()
    for (const s of segments) {
      if (s.sessionId === sessionId && s.segmentKind === 'full_session' && !byPlayer.has(s.playerId)) {
        byPlayer.set(s.playerId, s.durationSec / 60)
      }
    }
    return { byPlayer, available: Math.max(0, ...byPlayer.values()) }
  }
  const minutesA = minutesIn(matchA?.id)
  const minutesB = minutesIn(matchB?.id)
  const minutesRows = [...new Set([...minutesA.byPlayer.keys(), ...minutesB.byPlayer.keys()])]
    .map((id) => ({ id, name: playerNameById.get(id) ?? id, a: minutesA.byPlayer.get(id), b: minutesB.byPlayer.get(id) }))
    .sort((x, y) => (y.a ?? -1) - (x.a ?? -1) || (y.b ?? -1) - (x.b ?? -1) || x.name.localeCompare(y.name))
  const minutesCell = (min: number | undefined, available: number) => (
    <td className={cn('px-3 py-1.5 text-right tabular-nums', min === undefined || min < available / 2 ? 'text-ink-muted' : 'text-ink')}>
      {min === undefined ? '—' : `${formatNumber(min)}′`}
      {min !== undefined && available > 0 && (
        <span className="ml-1 text-xs text-ink-muted">{formatNumber((min / available) * 100)}%</span>
      )}
    </td>
  )

  const groupKeyFor = (s: Session): string =>
    (groupBy === 'location' ? s.matchLocation : s.matchResult) ?? UNCLASSIFIED
  const groupLabelFor = (key: string): string => {
    if (key === UNCLASSIFIED) return 'Non specificato'
    return groupBy === 'location' ? MATCH_LOCATION_LABEL[key as MatchLocation] : MATCH_RESULT_LABEL[key as MatchResult]
  }

  const sessionsByGroup = new Map<string, Session[]>()
  for (const s of matchSessions) {
    const key = groupKeyFor(s)
    const list = sessionsByGroup.get(key) ?? []
    list.push(s)
    sessionsByGroup.set(key, list)
  }

  const groupRows = [...sessionsByGroup.entries()]
    .map(([key, sessionsInGroup]) => {
      const sessionIds = new Set(sessionsInGroup.map((s) => s.id))
      const groupSegs = segments.filter((s) => s.segmentKind === 'full_session' && !s.isRehab && sessionIds.has(s.sessionId))
      return {
        key,
        label: groupLabelFor(key),
        matchCount: sessionsInGroup.length,
        values: allMetrics.map((m) => mean(groupSegs.map(m.volume))),
      }
    })
    .sort((a, b) => b.matchCount - a.matchCount)

  return (
    <div className="flex flex-col gap-6">
      <p className={inReport ? 'hidden' : 'text-sm text-ink-secondary'}>
        Confronta due partite testa a testa, oppure aggrega lo storico per sede o per esito.
      </p>

      {(show('head_to_head') || show('minutes')) && (matchSessions.length < 2 ? (
        <EmptyState
          icon={Flag}
          title="Serve almeno una seconda partita"
          description="Importa un'altra sessione di tipo Partita per poterle confrontare tra loro."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-secondary">Partita A</span>
                <select
                  value={activeAId}
                  onChange={(e) => setMatchAId(e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
                >
                  {matchSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} — {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-secondary">Partita B</span>
                <select
                  value={activeBId}
                  onChange={(e) => setMatchBId(e.target.value)}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
                >
                  {matchSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} — {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {matchA && <MatchBadge session={matchA} />}
              {matchB && <MatchBadge session={matchB} />}
            </div>
          </div>

          {show('head_to_head') && (
          <div className="grid grid-cols-1 gap-4 panel p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="mb-3 text-sm font-semibold text-ink">Partita vs Partita — media squadra</p>
            </div>
            {allMetrics.map((m) => (
              <ComparisonBar
                key={m.key}
                label={m.label}
                unit={m.unit}
                primaryLabel={matchA?.label ?? 'Partita A'}
                primaryValue={mean(segsA.map(m.volume))}
                referenceLabel={matchB?.label ?? 'Partita B'}
                referenceValue={mean(segsB.map(m.volume))}
              />
            ))}
          </div>
          )}

          {show('minutes') && (
          <div className="panel overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
              <p className="text-sm font-semibold text-ink">Minuti giocati</p>
              <p className="text-xs text-ink-muted">
                In grigio chi ha giocato meno di metà partita: le medie qui sopra mescolano partite intere e subentri.
              </p>
            </div>
            <table className="mt-2 w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2">Giocatore</th>
                  <th className="px-3 py-2 text-right normal-case">{matchA?.label ?? 'Partita A'}</th>
                  <th className="px-3 py-2 text-right normal-case">{matchB?.label ?? 'Partita B'}</th>
                </tr>
              </thead>
              <tbody>
                {minutesRows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-1.5 font-medium text-ink">{row.name}</td>
                    {minutesCell(row.a, minutesA.available)}
                    {minutesCell(row.b, minutesB.available)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ))}

      {show('by_group') && (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Confronto per tipologia — media squadra</p>
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setGroupBy('location')}
              className={`rounded px-3 py-1 ${groupBy === 'location' ? 'bg-accent text-accent-ink' : 'text-ink-secondary'}`}
            >
              Per sede
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('result')}
              className={`rounded px-3 py-1 ${groupBy === 'result' ? 'bg-accent text-accent-ink' : 'text-ink-secondary'}`}
            >
              Per esito
            </button>
          </div>
        </div>
        <div className="overflow-x-auto panel">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2">{groupBy === 'location' ? 'Sede' : 'Esito'}</th>
                <th className="px-3 py-2 text-right">Partite</th>
                {allMetrics.map((m) => (
                  <th key={m.key} className="px-3 py-2 text-right">
                    {m.label}
                    {m.unit && <span className="ml-1 normal-case text-ink-muted">({m.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupRows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{row.matchCount}</td>
                  {row.values.map((v, i) => (
                    <td key={allMetrics[i].key} className="px-3 py-2 text-right tabular-nums text-ink">
                      {v.toFixed(0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
