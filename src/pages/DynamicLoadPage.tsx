import { BarChart3 } from 'lucide-react'
import { MetricTrendPanel } from '../components/charts/MetricTrendPanel'
import { MicrocycleBarChart, type MicrocycleBarChartGroup } from '../components/charts/MicrocycleBarChart'
import { useReportSection } from '../components/report/ReportSection'
import { EmptyState } from '../components/ui/EmptyState'
import { distanceAbove19_8, distanceAbove25_2, mechanicalWork, MICROCYCLE_METRICS } from '../lib/metrics/metricsCatalog'
import { computeMicrocycleCompletion } from '../lib/metrics/microcycle'
import { rollingAverageByDateWindow } from '../lib/metrics/timeSeries'
import {
  ACWR_MIN_HISTORY_DAYS,
  ACWR_MIN_RATED_SHARE,
  TRAINING_LOAD_LABEL,
  TRAINING_LOAD_UNIT,
  computeAcwr,
  indexRpe,
  trainingLoadOf,
  type AcwrZone,
} from '../lib/metrics/trainingLoad'
import { cn, formatNumber, mean } from '../lib/utils'
import { useAllRpeQuery, useAllSegmentsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'
import type { Player, Position } from '../types/domain'

const POSITION_ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD', 'UNSPECIFIED']
const ACWR_STYLE: Record<AcwrZone, { label: string; className: string }> = {
  low: { label: 'Sottocarico', className: 'bg-series-blue/15 text-series-blue' },
  optimal: { label: 'Ottimale', className: 'bg-status-good/15 text-status-good' },
  high: { label: 'Alto', className: 'bg-status-warning/25 text-ink' },
  very_high: { label: 'Picco', className: 'bg-status-critical/15 text-status-critical' },
}
const POSITION_LABEL: Record<Position, string> = {
  GK: 'Portieri',
  DEF: 'Difensori',
  MID: 'Centrocampisti',
  FWD: 'Attaccanti',
  UNSPECIFIED: 'Non assegnati',
}

interface MicrocycleRow {
  player: Player
  sessionsSinceLastMatch: number
  metrics: MicrocycleBarChartGroup['players'][number]['metrics']
}

export function DynamicLoadPage() {
  const { data: sessions = [], isLoading: loadingSessions } = useSessionsQuery()
  const { data: rawSegments = [], isLoading: loadingSegments } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { data: settings } = useSettingsQuery()
  const { data: rpeEntries = [] } = useAllRpeQuery()
  const { inReport, show } = useReportSection()

  if (loadingSessions || loadingSegments || !settings) return null

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nessuna sessione ancora importata"
        description="Importa almeno una sessione per iniziare a vedere i trend di carico."
      />
    )
  }

  // Deactivated players never show up again, anywhere on this page, until reactivated in Roster & Positions.
  const activePlayerIds = new Set(players.filter((p) => p.active).map((p) => p.id))
  const segments = rawSegments.filter((s) => activePlayerIds.has(s.playerId))

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const fullSessionByDate = sorted.map((session) => {
    const allSegs = segments.filter((s) => s.sessionId === session.id && s.segmentKind === 'full_session')
    // Rehab (injured) players are excluded from every team-wide average on this page — their
    // reduced load isn't representative of the squad's.
    const segs = allSegs.filter((s) => !s.isRehab)
    return { session, segs }
  })

  const buildPoints = (getValue: (s: (typeof segments)[number]) => number) =>
    fullSessionByDate.map(({ session, segs }) => ({
      date: session.date,
      label: session.date.slice(5),
      value: mean(segs.map(getValue)),
      type: session.type,
    }))

  // Training Load: only sessions where at least one active, non-Rehab player has an RPE — a
  // session nobody rated isn't a zero-load day.
  const rpeIndex = indexRpe(rpeEntries)
  const trainingLoadPoints = fullSessionByDate.flatMap(({ session, segs }) => {
    const values = segs.map((s) => trainingLoadOf(rpeIndex, s)).filter((v): v is number => v !== undefined)
    return values.length > 0 ? [{ date: session.date, label: session.date.slice(5), value: mean(values), type: session.type }] : []
  })

  const panels = [
    { key: 'td', title: 'Distanza totale', unit: 'm', points: buildPoints((s) => s.totalDistanceM) },
    { key: 'hsr', title: 'Distanza > 19.8 km/h', unit: 'm', points: buildPoints(distanceAbove19_8) },
    { key: 'sprint', title: 'Distanza > 25.2 km/h', unit: 'm', points: buildPoints(distanceAbove25_2) },
    { key: 'mechw', title: 'Mechanical Work', unit: '#', points: buildPoints((s) => mechanicalWork(s, settings)) },
    { key: 'tl', title: `${TRAINING_LOAD_LABEL} (RPE × minuti)`, unit: TRAINING_LOAD_UNIT, points: trainingLoadPoints },
  ].filter((panel) => show(panel.key) && (panel.key !== 'tl' || panel.points.length > 0))

  // ACWR as of today (rest days since the last session count), from EWMAs of the daily Training Load.
  const now = new Date()
  const acwrRefDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
  const acwrRows = sorted.length > 0
    ? computeAcwr(
        rpeEntries,
        sessions,
        segments,
        players.filter((p) => p.active).map((p) => p.id),
        acwrRefDate,
      )
        .filter((r) => r.acute > 0 || r.chronic > 0)
        .map((r) => ({ ...r, player: players.find((p) => p.id === r.playerId)! }))
        .sort(
          (a, b) =>
            POSITION_ORDER.indexOf(a.player.position) - POSITION_ORDER.indexOf(b.player.position) ||
            a.player.displayName.localeCompare(b.player.displayName),
        )
    : []

  const singleSession = sessions.length === 1

  const trackedMicrocycleMetrics = MICROCYCLE_METRICS.filter((m) => m.key !== 'duration')
  const shortMetricLabel: Record<string, string> = {
    totalDistance: 'Dist. tot.',
    hsr: 'HSR (>19.8)',
    sprintDistance: 'Dist. sprint',
    sprintCount: 'N. sprint',
    mechanicalWork: 'MechW',
    accHigh: 'Acc. alte',
    decHigh: 'Dec. alte',
  }

  const activePlayers = players.filter((p) => p.active)
  const microcycleRows: MicrocycleRow[] = activePlayers.map((player) => {
    const playerSegments = segments.filter((s) => s.playerId === player.id)
    let sessionsSinceLastMatch = 0
    const metrics = trackedMicrocycleMetrics.map((def, i) => {
      const result = computeMicrocycleCompletion(player.id, sessions, playerSegments, (s) => def.metric(s, settings))
      if (i === 0) sessionsSinceLastMatch = result.sessionsSinceLastMatch
      return {
        key: def.key,
        label: shortMetricLabel[def.key] ?? def.label,
        pct: result.pct,
        numerator: result.numerator,
        denominator: result.denominator,
        unit: def.unit,
        lowSample: result.lowSample,
      }
    })
    return { player, sessionsSinceLastMatch, metrics }
  })

  const microcycleGroupsByPosition = new Map<Position, MicrocycleRow[]>()
  for (const row of microcycleRows) {
    const list = microcycleGroupsByPosition.get(row.player.position) ?? []
    list.push(row)
    microcycleGroupsByPosition.set(row.player.position, list)
  }
  const microcycleGroups: MicrocycleBarChartGroup[] = POSITION_ORDER.filter((pos) =>
    microcycleGroupsByPosition.has(pos),
  ).map((pos) => ({
    label: POSITION_LABEL[pos],
    players: microcycleGroupsByPosition
      .get(pos)!
      .sort((a, b) => a.player.displayName.localeCompare(b.player.displayName)),
  }))

  return (
    <div className="flex flex-col gap-4">
      <p className={inReport && panels.length === 0 ? 'hidden' : 'text-sm text-ink-secondary'}>
        Media squadra per sessione ({sorted.length} {sorted.length === 1 ? 'sessione' : 'sessioni'} in archivio) — linea:
        media mobile su finestra di {settings.rollingWindowDays} giorni.
      </p>

      {singleSession && !inReport && (
        <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-ink-secondary">
          Con una sola sessione la media mobile coincide con il singolo valore — importa più sessioni nel tempo per
          vedere un vero trend.
        </div>
      )}

      <div className={inReport ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {panels.map((panel) => {
          const rolling = rollingAverageByDateWindow(panel.points, settings.rollingWindowDays)
          const last = panel.points[panel.points.length - 1]
          return (
            <MetricTrendPanel
              key={panel.title}
              title={panel.title}
              unit={panel.unit}
              points={panel.points}
              rolling={rolling}
              latestValue={last?.value}
            />
          )
        })}
      </div>

      {show('acwr') && acwrRows.length > 0 && (
        <div className="panel overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{TRAINING_LOAD_LABEL} — carico acuto / cronico (ACWR)</p>
            <p className="max-w-xl text-xs text-ink-muted">
              Al {acwrRefDate}. Medie esponenziali (EWMA) del Training Load giornaliero: acuto su 7 giorni, cronico su 28.
              I giorni di riposo contano 0; le sedute senza RPE vengono saltate. Ottimale tra 0,8 e 1,3.
            </p>
          </div>
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-4">Giocatore</th>
                <th className="px-3 py-2 text-right">Acuto ({TRAINING_LOAD_UNIT}/giorno)</th>
                <th className="px-3 py-2 text-right">Cronico ({TRAINING_LOAD_UNIT}/giorno)</th>
                <th className="px-3 py-2 text-right">ACWR</th>
                <th className="px-3 py-2 text-right" title="Sedute con dati GPS negli ultimi 28 giorni che hanno l'RPE">
                  RPE inseriti
                </th>
              </tr>
            </thead>
            <tbody>
              {acwrRows.map((r) => (
                <tr key={r.playerId} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-4 font-medium text-ink">{r.player.displayName}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{formatNumber(r.acute)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{formatNumber(r.chronic)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {r.building ? (
                      <span className="text-xs text-ink-muted" title={`Servono almeno ${ACWR_MIN_HISTORY_DAYS} giorni di storico`}>
                        in costruzione
                      </span>
                    ) : r.ratio === null || r.zone === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <span
                        className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', ACWR_STYLE[r.zone].className)}
                        title={ACWR_STYLE[r.zone].label}
                      >
                        {formatNumber(r.ratio, 2)}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-right tabular-nums',
                      r.sessionsWithData > 0 && r.ratedSessions / r.sessionsWithData < ACWR_MIN_RATED_SHARE
                        ? 'font-semibold text-status-serious'
                        : 'text-ink-secondary',
                    )}
                    title={
                      r.sessionsWithData > 0 && r.ratedSessions / r.sessionsWithData < ACWR_MIN_RATED_SHARE
                        ? 'Troppi RPE mancanti: ACWR poco affidabile'
                        : undefined
                    }
                  >
                    {r.ratedSessions}/{r.sessionsWithData}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show('microcycle') && microcycleRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-secondary">
            Per giocatore: allenamenti svolti dall'ultima partita a oggi, e ogni metrica di carico come % rispetto a
            un microciclo tipo storico (Ripresa + Forza + Metabolico + Rifinitura).
          </p>
          <MicrocycleBarChart groups={microcycleGroups} />
        </div>
      )}
    </div>
  )
}

