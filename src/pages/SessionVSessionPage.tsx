import { CalendarRange } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { SimilarWeeksPanel } from '../components/charts/SimilarWeeksPanel'
import { useReportSection } from '../components/report/ReportSection'
import { EmptyState } from '../components/ui/EmptyState'
import { median } from '../lib/metrics/heatmap'
import { distanceAbove19_8, distanceAbove25_2, mechanicalWork } from '../lib/metrics/metricsCatalog'
import { TRAINING_LOAD_LABEL, indexRpe, trainingLoadOf } from '../lib/metrics/trainingLoad'
import { useCurrentSession } from '../state/CurrentSessionContext'
import { useAllRpeQuery, useAllSegmentsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'
import { TRAINING_TYPE_LABEL, type DrillSegment, type Position } from '../types/domain'

// Counted as "sessions of this type" INCLUDING the one currently open — a
// coach counting "I have 3 Forza sessions" naturally counts the one they're
// looking at too, so the historical (non-current) threshold is one less.
const MIN_COMPARABLE_TOTAL_SESSIONS = 3
const MIN_COMPARABLE_HISTORY = MIN_COMPARABLE_TOTAL_SESSIONS - 1
const POSITION_ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD', 'UNSPECIFIED']

interface MetricSpec {
  key: string
  label: string
  /** undefined = no value (Training Load without an RPE): shown as "—" and left out of the median. */
  getValue: (s: DrillSegment) => number | undefined
}

export function SessionVSessionPage() {
  const { currentSession } = useCurrentSession()
  const { data: sessions = [] } = useSessionsQuery()
  const { data: rawSegments = [], isLoading } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { data: settings } = useSettingsQuery()
  const { data: rpeEntries = [] } = useAllRpeQuery()

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const activePlayerIds = useMemo(() => new Set(players.filter((p) => p.active).map((p) => p.id)), [players])
  // Deactivated players never show up again, anywhere on this page, until reactivated in Roster & Positions.
  const segments = useMemo(() => rawSegments.filter((s) => activePlayerIds.has(s.playerId)), [rawSegments, activePlayerIds])
  const [includeAllTrainingTypes, setIncludeAllTrainingTypes] = useState(false)
  const { inReport, show } = useReportSection()

  if (!currentSession || isLoading || !settings) return null

  const rpeIndex = indexRpe(rpeEntries)
  const metrics: MetricSpec[] = [
    { key: 'td', label: 'Distanza tot. (m)', getValue: (s) => s.totalDistanceM },
    { key: 'hsr', label: 'D>19.8 (m)', getValue: distanceAbove19_8 },
    { key: 'sprint', label: 'D>25.2 (m)', getValue: distanceAbove25_2 },
    { key: 'mechw', label: 'MechW (#)', getValue: (s) => mechanicalWork(s, settings) },
    { key: 'tl', label: `${TRAINING_LOAD_LABEL} (UA)`, getValue: (s) => trainingLoadOf(rpeIndex, s) },
  ]

  const strictByTrainingType = currentSession.type === 'training' && !!currentSession.trainingType && !includeAllTrainingTypes

  const sameTypeSessionIds = new Set(
    sessions
      .filter((s) => {
        if (s.id === currentSession.id || s.type !== currentSession.type) return false
        if (strictByTrainingType) return s.trainingType === currentSession.trainingType
        return true
      })
      .map((s) => s.id),
  )
  const currentSegs = segments.filter((s) => s.sessionId === currentSession.id && s.segmentKind === 'full_session')

  const similarWeeks = show('similar_weeks') ? (
    <SimilarWeeksPanel sessions={sessions} segments={segments} players={players} settings={settings} />
  ) : null
  if (inReport && !show('table')) return similarWeeks

  if (currentSegs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {similarWeeks}
        <EmptyState
          icon={CalendarRange}
          title="Nessun dato per questa sessione"
          description="Serve almeno una riga 'Full Session' in questa sessione."
        />
      </div>
    )
  }

  // The personal median only uses complete sessions: a Rehab day isn't representative of the player's normal load.
  const historyByPlayer = new Map<string, DrillSegment[]>()
  for (const seg of segments) {
    if (seg.segmentKind === 'full_session' && !seg.isRehab && sameTypeSessionIds.has(seg.sessionId)) {
      const list = historyByPlayer.get(seg.playerId) ?? []
      list.push(seg)
      historyByPlayer.set(seg.playerId, list)
    }
  }

  const rows = currentSegs.map((seg) => ({
    seg,
    position: playerById.get(seg.playerId)?.position ?? 'UNSPECIFIED',
    name: playerById.get(seg.playerId)?.displayName ?? seg.playerId,
    history: historyByPlayer.get(seg.playerId) ?? [],
    rehab: !!seg.isRehab,
  }))

  const byPosition = new Map<Position, typeof rows>()
  for (const row of rows) {
    const list = byPosition.get(row.position) ?? []
    list.push(row)
    byPosition.set(row.position, list)
  }

  return (
    <div className="flex flex-col gap-4">
      {similarWeeks}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          {currentSession.type === 'training' && (
            <p className="text-sm text-ink-secondary">
              Tipo di allenamento:{' '}
              <span className="font-medium text-ink">
                {currentSession.trainingType ? TRAINING_TYPE_LABEL[currentSession.trainingType] : 'Non classificato'}
              </span>
            </p>
          )}
          <p className="text-sm text-ink-secondary">
            Confronto tra questa sessione e lo storico dello stesso giocatore
            {currentSession.type === 'training' && currentSession.trainingType
              ? ` su allenamenti dello stesso tipo (${TRAINING_TYPE_LABEL[currentSession.trainingType]})`
              : ` su sessioni dello stesso tipo (${currentSession.type === 'match' ? 'partita' : 'allenamento'})`}
            . Servono almeno {MIN_COMPARABLE_TOTAL_SESSIONS} sessioni dello stesso tipo per giocatore (questa inclusa)
            per un confronto affidabile.
          </p>
        </div>
        {currentSession.type === 'training' && currentSession.trainingType && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={includeAllTrainingTypes}
              onChange={(e) => setIncludeAllTrainingTypes(e.target.checked)}
              className="accent-accent"
            />
            Confronta con tutte le tipologie di allenamento
          </label>
        )}
      </div>

      <div className="overflow-x-auto panel">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Giocatore</th>
              {metrics.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITION_ORDER.filter((pos) => byPosition.has(pos)).map((pos) => (
              <Fragment key={pos}>
                <tr key={`${pos}-header`}>
                  <td colSpan={metrics.length + 1} className="bg-page/40 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {pos}
                  </td>
                </tr>
                {byPosition
                  .get(pos)!
                  .sort((a, b) => Number(a.rehab) - Number(b.rehab) || a.name.localeCompare(b.name))
                  .map((row) => (
                    <tr key={row.seg.id} className={`border-b border-border last:border-0 ${row.rehab ? 'bg-status-critical/10' : ''}`}>
                      <td className={`px-4 py-2 font-medium ${row.rehab ? 'text-status-critical' : 'text-ink'}`}>
                        {row.name}
                        {row.rehab && (
                          <span className="ml-1.5 rounded-full bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-status-critical">
                            Rehab
                          </span>
                        )}
                      </td>
                      {metrics.map((m) => {
                        const current = m.getValue(row.seg)
                        if (current === undefined) {
                          return (
                            <td key={m.key} className="px-3 py-2 text-right text-ink-muted" title="RPE non inserito">
                              —
                            </td>
                          )
                        }
                        if (row.rehab) {
                          return (
                            <td key={m.key} className="px-3 py-2 text-right tabular-nums text-status-critical">
                              {current.toFixed(0)}
                              <span className="ml-1 text-xs text-ink-muted">non confrontabile</span>
                            </td>
                          )
                        }
                        const historyValues = row.history.map(m.getValue).filter((v): v is number => v !== undefined)
                        const totalSessions = historyValues.length + 1 // history + the one currently open
                        const enoughHistory = historyValues.length >= MIN_COMPARABLE_HISTORY
                        const historyMedian = enoughHistory ? median(historyValues) : null
                        return (
                          <td key={m.key} className="px-3 py-2 text-right tabular-nums text-ink">
                            {current.toFixed(0)}
                            {historyMedian !== null ? (
                              <span className="ml-1 text-xs text-ink-muted">
                                vs {historyMedian.toFixed(0)} (n={totalSessions})
                              </span>
                            ) : (
                              <span className="ml-1 text-xs text-ink-muted">(n={totalSessions}, insuff.)</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.rehab) && (
        <p className="text-xs text-status-critical">
          Le righe in rosso sono giocatori in Rehab in questa sessione: il loro carico non viene confrontato con lo
          storico. Le sessioni di Rehab sono sempre escluse dalle mediane personali.
        </p>
      )}
    </div>
  )
}
