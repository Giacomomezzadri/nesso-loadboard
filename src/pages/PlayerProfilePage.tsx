import { useMutation } from '@tanstack/react-query'
import { Link2, ShieldCheck, UserCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TrendBars } from '../components/charts/TrendBars'
import { TrendLine } from '../components/charts/TrendLine'
import { ComparisonBar } from '../components/ui/ComparisonBar'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import { computeSessionAlerts, type AlertSeverity, type DatedFullSession } from '../lib/metrics/alerts'
import {
  distanceAbove19_8,
  distanceAbove25_2,
  MICROCYCLE_METRICS,
  mechanicalWork,
  sprintCount,
} from '../lib/metrics/metricsCatalog'
import { computePlayerAttendance } from '../lib/metrics/attendance'
import { computeMicrocycleCompletion } from '../lib/metrics/microcycle'
import { median } from '../lib/metrics/heatmap'
import { formatNumber, formatPercent, isoWeek, mean } from '../lib/utils'
import { computeWeeklyPerformanceModel } from '../lib/metrics/weeklyPerformanceModel'
import { deletePlayerLink, proposePlayerLink, respondToPlayerLink } from '../lib/db/repo'
import { useAuth } from '../state/AuthContext'
import { useCurrentSession } from '../state/CurrentSessionContext'
import {
  useAllSegmentsQuery,
  useInvalidatePlayerLinks,
  useLinkedPlayerDataQuery,
  usePlayerLinksQuery,
  usePlayersQuery,
  useRpeBySessionQuery,
  useSegmentsByPlayerQuery,
  useSettingsQuery,
} from '../state/queries'
import { TRAINING_TYPE_LABEL, type DrillSegment, type Session } from '../types/domain'

const DENOMINATOR_CAPTION: Record<string, string> = {
  'valid-cycles': 'vs media dei microcicli storici completi (Ripresa+Forza+Metabolico+Rifinitura)',
  'per-type-fallback': 'vs media per tipologia — nessun microciclo storico completo ancora disponibile',
  'insufficient-data': 'dati storici insufficienti per un confronto',
}

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: 'bg-status-critical/15 text-status-critical',
  serious: 'bg-status-serious/20 text-status-serious',
  warning: 'bg-status-warning/20 text-ink',
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Critico',
  serious: 'Serio',
  warning: 'Attenzione',
}

interface TrendMetricSpec {
  key: string
  label: string
  unit: string
  getValue: (s: DrillSegment) => number
}

/** Training rows show date + training type (the generic import label isn't useful on its own); matches keep their opponent-based label. */
function sessionHistoryLabel(session: Session): string {
  if (session.type !== 'training') return session.label
  const typeLabel = session.trainingType ? TRAINING_TYPE_LABEL[session.trainingType] : 'Non classificato'
  return `${session.date} — ${typeLabel}`
}

/** Pending link requests aimed at one of MY players, from another workspace — shown regardless of which player is currently selected, so they're never missed. */
function PendingLinkRequestsBanner() {
  const { data: links = [] } = usePlayerLinksQuery()
  const invalidate = useInvalidatePlayerLinks()
  const respond = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) => respondToPlayerLink(id, status),
    onSuccess: invalidate,
  })

  const incoming = links.filter((l) => l.status === 'pending' && !l.proposedByMe)
  if (incoming.length === 0) return null

  return (
    <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
      <p className="mb-2 font-medium text-ink">Richieste di collegamento in sospeso</p>
      <ul className="flex flex-col gap-2">
        {incoming.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-ink-secondary">
              <strong className="text-ink">{l.otherEditorEmail}</strong> vuole collegare "{l.otherPlayerName}" al tuo
              giocatore <strong className="text-ink">{l.myPlayerName}</strong>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: l.id, status: 'accepted' })}
                className="rounded-md bg-accent px-2 py-1 font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
              >
                Accetta
              </button>
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: l.id, status: 'rejected' })}
                className="rounded-md border border-border px-2 py-1 text-ink-secondary hover:bg-ink/5 disabled:opacity-60"
              >
                Rifiuta
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Link status + management for the currently selected player, specifically. */
function PlayerLinkPanel({ playerId, canEdit }: { playerId: string; canEdit: boolean }) {
  const { data: links = [] } = usePlayerLinksQuery()
  const invalidate = useInvalidatePlayerLinks()
  const [formOpen, setFormOpen] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [targetName, setTargetName] = useState('')

  const propose = useMutation({
    mutationFn: () => proposePlayerLink({ myPlayerId: playerId, targetEditorEmail: targetEmail, targetPlayerName: targetName }),
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setTargetEmail('')
      setTargetName('')
    },
  })
  const remove = useMutation({ mutationFn: (id: string) => deletePlayerLink(id), onSuccess: invalidate })

  const link = links.find((l) => l.myPlayerId === playerId)

  if (link?.status === 'accepted') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary">
        <Link2 className="size-3.5 text-status-good" />
        Collegato con <strong className="text-ink">{link.otherPlayerName}</strong> ({link.otherEditorEmail})
        {canEdit && (
          <button type="button" onClick={() => remove.mutate(link.id)} className="ml-1 font-medium text-status-critical hover:underline">
            Scollega
          </button>
        )}
      </div>
    )
  }

  if (link?.status === 'pending' && link.proposedByMe) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary">
        <Link2 className="size-3.5 text-status-warning" />
        In attesa che {link.otherEditorEmail} confermi il collegamento con "{link.otherPlayerName}"
        {canEdit && (
          <button type="button" onClick={() => remove.mutate(link.id)} className="ml-1 font-medium text-ink-secondary hover:underline">
            Annulla
          </button>
        )}
      </div>
    )
  }

  if (!canEdit) return null

  if (!formOpen) {
    return (
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5"
      >
        <Link2 className="size-3.5" /> Collega a un giocatore di un'altra squadra
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        propose.mutate()
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-3 text-xs"
    >
      <label className="flex flex-col gap-1">
        <span className="text-ink-secondary">Email dell'altro allenatore (Editor/Admin)</span>
        <input
          type="email"
          required
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          className="w-56 rounded-md border border-border bg-page px-2 py-1.5 text-ink"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-secondary">Nome esatto del giocatore nel suo roster</span>
        <input
          type="text"
          required
          value={targetName}
          onChange={(e) => setTargetName(e.target.value)}
          className="w-48 rounded-md border border-border bg-page px-2 py-1.5 text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={propose.isPending}
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {propose.isPending ? 'Invio…' : 'Proponi collegamento'}
      </button>
      <button type="button" onClick={() => setFormOpen(false)} className="rounded-md px-3 py-1.5 text-ink-secondary hover:bg-ink/5">
        Annulla
      </button>
      {propose.isError && <p className="w-full text-status-critical">{(propose.error as Error).message}</p>}
      <p className="w-full text-[11px] text-ink-muted">
        L'altro allenatore vedrà le date delle vostre sessioni (per calcolare correttamente i suoi modelli) e dovrà
        confermare prima che i dati vengano condivisi.
      </p>
    </form>
  )
}

function AttendanceRow({ label, detail, pct }: { label: string; detail: string; pct: number | null }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink-secondary">{detail}</dd>
      <dd className="text-right font-medium tabular-nums text-ink">{pct === null ? '—' : formatPercent(pct)}</dd>
    </>
  )
}

export function PlayerProfilePage() {
  const { data: players = [], isLoading: loadingPlayers } = usePlayersQuery()
  const { sessions, currentSession } = useCurrentSession()
  const { data: settings } = useSettingsQuery()
  const { data: allSegments = [] } = useAllSegmentsQuery()
  const { data: currentSessionRpe = [] } = useRpeBySessionQuery(currentSession?.id)
  const { data: linkedPlayerData = [] } = useLinkedPlayerDataQuery()
  const { canEdit } = useAuth()
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [trendMetricKey, setTrendMetricKey] = useState('td')
  // Session ids excluded from the trend line above — everything is included by default,
  // so this only ever grows from the "deselect a row" checkboxes in the table below.
  const [excludedSegIds, setExcludedSegIds] = useState<Set<string>>(new Set())
  // 'manual' = respect the checkboxes in the table below (existing behaviour).
  // 'last7' = auto-show the last 7 calendar days, ignoring the checkboxes.
  const [periodMode, setPeriodMode] = useState<'manual' | 'last7'>('manual')

  const activeRosterPlayers = useMemo(() => players.filter((p) => p.active), [players])
  const activePlayerIdSet = useMemo(() => new Set(activeRosterPlayers.map((p) => p.id)), [activeRosterPlayers])
  const activePlayerId = selectedId && activeRosterPlayers.some((p) => p.id === selectedId) ? selectedId : activeRosterPlayers[0]?.id
  const { data: segments = [], isLoading: loadingSegments } = useSegmentsByPlayerQuery(activePlayerId)

  // If this player has an accepted cross-workspace link, fold in the other team's sessions/segments —
  // history, trend, microcycle and weekly-model all become "complete" for a dual-registered player.
  // Team-wide pools (alerts below) deliberately keep using the un-merged `sessions`/`allSegments`.
  const linkedEntry = linkedPlayerData.find((l) => l.myPlayerId === activePlayerId)
  const mergedSessions = useMemo(
    () => (linkedEntry ? [...sessions, ...linkedEntry.sessions] : sessions),
    [sessions, linkedEntry],
  )
  const mergedSegments = useMemo(
    () => (linkedEntry ? [...segments, ...linkedEntry.segments] : segments),
    [segments, linkedEntry],
  )

  const sessionById = useMemo(() => new Map(mergedSessions.map((s) => [s.id, s])), [mergedSessions])
  const player = activeRosterPlayers.find((p) => p.id === activePlayerId)

  if (loadingPlayers) return null

  if (activeRosterPlayers.length === 0) {
    return (
      <EmptyState
        icon={UserCircle}
        title="Nessun giocatore ancora"
        description="I giocatori vengono creati automaticamente al primo import di un CSV."
      />
    )
  }

  const fullSessionSegs = mergedSegments
    .filter((s) => s.segmentKind === 'full_session')
    .map((s) => ({ segment: s, session: sessionById.get(s.sessionId) }))
    .filter((row): row is { segment: (typeof mergedSegments)[number]; session: NonNullable<(typeof row)['session']> } => !!row.session)
    .sort((a, b) => a.session.date.localeCompare(b.session.date))

  const trendMetrics: TrendMetricSpec[] = [
    { key: 'td', label: 'Distanza totale', unit: 'm', getValue: (s) => s.totalDistanceM },
    { key: 'hsr', label: 'Distanza > 19.8 km/h', unit: 'm', getValue: distanceAbove19_8 },
    { key: 'sprintd', label: 'Distanza > 25.2 km/h', unit: 'm', getValue: distanceAbove25_2 },
    { key: 'vmax', label: 'Velocità massima', unit: 'km/h', getValue: (s) => s.maxSpeedKmh },
    ...(settings
      ? [
          { key: 'sprints', label: 'Sprint', unit: '#', getValue: (s: DrillSegment) => sprintCount(s, settings) },
          { key: 'mechw', label: 'Mechanical Work', unit: '#', getValue: (s: DrillSegment) => mechanicalWork(s, settings) },
        ]
      : []),
  ]
  const trendMetric = trendMetrics.find((m) => m.key === trendMetricKey) ?? trendMetrics[0]

  const toggleSegSelection = (id: string) => {
    setExcludedSegIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const last7StartDate = (() => {
    if (fullSessionSegs.length === 0) return undefined
    const mostRecent = fullSessionSegs[fullSessionSegs.length - 1].session.date
    const d = new Date(mostRecent + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 6)
    return d.toISOString().slice(0, 10)
  })()
  const chartRows =
    periodMode === 'last7' && last7StartDate
      ? fullSessionSegs.filter((r) => r.session.date >= last7StartDate)
      : fullSessionSegs.filter((r) => !excludedSegIds.has(r.segment.id))

  // Team median per charted session/metric, sourced from the un-merged, workspace-scoped
  // allSegments (same rule as the alert pools above) — a cross-workspace linked session has
  // no team here to compare against, so it's left out (null) rather than faked as 0.
  const chartSessionIds = new Set(chartRows.map((r) => r.session.id))
  const teamValuesBySession = new Map<string, number[]>()
  for (const seg of allSegments) {
    if (seg.segmentKind !== 'full_session' || seg.isRehab || !activePlayerIdSet.has(seg.playerId)) continue
    if (!chartSessionIds.has(seg.sessionId)) continue
    const list = teamValuesBySession.get(seg.sessionId) ?? []
    list.push(trendMetric.getValue(seg))
    teamValuesBySession.set(seg.sessionId, list)
  }
  const chartData = chartRows.map((r) => {
    const teamValues = teamValuesBySession.get(r.session.id)
    return {
      x: r.session.date,
      value: trendMetric.getValue(r.segment),
      median: teamValues && teamValues.length > 0 ? median(teamValues) : null,
    }
  })
  const trendValueFormatter = (v: number) =>
    `${formatNumber(v, trendMetric.unit === 'km/h' ? 1 : 0)}${trendMetric.unit ? ` ${trendMetric.unit}` : ''}`
  // "Ultimi 7 giorni" swaps the line for per-session bars, with the player/median totals over
  // that window written out as a simple ratio, e.g. (23410/22678) — no percentage, just the sums.
  const periodPlayerTotal = chartData.reduce((sum, d) => sum + d.value, 0)
  const periodMedianTotal = chartData.reduce((sum, d) => sum + (d.median ?? 0), 0)
  const periodHasMedian = chartData.some((d) => d.median !== null)

  const sessionCount = new Set(mergedSegments.map((s) => s.sessionId)).size
  // Whole season, this workspace only — the un-merged sessions/allSegments, since the
  // denominator is this team's own calendar, not a linked club's.
  const attendance = activePlayerId ? computePlayerAttendance(activePlayerId, sessions, allSegments) : undefined
  // Weekly, not per-session: sum this player's distance within each calendar week, then
  // average those weekly totals — a session-count average would understate weeks with more
  // sessions and overstate quiet ones.
  const weeklyDistanceTotals = new Map<string, number>()
  for (const r of fullSessionSegs) {
    const week = isoWeek(r.session.date)
    weeklyDistanceTotals.set(week, (weeklyDistanceTotals.get(week) ?? 0) + r.segment.totalDistanceM)
  }
  const avgWeeklyDistance = mean([...weeklyDistanceTotals.values()])
  const maxSpeed = Math.max(0, ...mergedSegments.map((s) => s.maxSpeedKmh))
  const maxSpeedSegment = mergedSegments.find((s) => s.maxSpeedKmh === maxSpeed)
  const maxSpeedDate = maxSpeedSegment ? sessionById.get(maxSpeedSegment.sessionId)?.date : undefined
  const microcycleRows =
    activePlayerId && settings
      ? MICROCYCLE_METRICS.map((def) => ({
          def,
          result: computeMicrocycleCompletion(activePlayerId, mergedSessions, mergedSegments, (s) => def.metric(s, settings)),
        }))
      : []

  const matchSessionIds = new Set(mergedSessions.filter((s) => s.type === 'match').map((s) => s.id))
  const gameSegs = mergedSegments.filter((s) => s.segmentKind === 'full_session' && matchSessionIds.has(s.sessionId))
  const weeklyModelRows =
    activePlayerId && gameSegs.length > 0 ? computeWeeklyPerformanceModel(mergedSegments, gameSegs, mergedSessions) : []

  // Alerts are inherently a per-session concept (team median, 7-day speed-exposure window ending on a
  // specific date) — this page shows this player's slice of the currently selected session's alerts,
  // the same ones surfaced on Overview/Alerts, rather than replaying alerts for every past session.
  const sessionDateById = new Map(sessions.map((s) => [s.id, s.date]))
  const recentFullSessions: DatedFullSession[] = allSegments
    .filter(
      (s) => s.segmentKind === 'full_session' && !s.isRehab && activePlayerIdSet.has(s.playerId) && sessionDateById.has(s.sessionId),
    )
    .map((seg) => ({ seg, date: sessionDateById.get(seg.sessionId)! }))
  const currentSessionFullSegs = currentSession
    ? allSegments.filter(
        (s) =>
          s.sessionId === currentSession.id &&
          s.segmentKind === 'full_session' &&
          !s.isRehab &&
          activePlayerIdSet.has(s.playerId),
      )
    : []
  // Only CONFIRMED references — an unconfirmed or vendor-only value must never silently drive an alert.
  const personalMaxByPlayer = new Map(
    activeRosterPlayers
      .filter((p) => p.pbConfirmed && p.personalMaxSpeedKmh !== undefined)
      .map((p) => [p.id, p.personalMaxSpeedKmh as number]),
  )
  const playerAlerts =
    activePlayerId && settings && currentSession && currentSessionFullSegs.length > 0
      ? computeSessionAlerts(
          currentSessionFullSegs,
          currentSessionRpe,
          settings,
          personalMaxByPlayer,
          recentFullSessions,
          currentSession.date,
        ).filter((f) => f.playerId === activePlayerId)
      : []

  return (
    <div className="flex flex-col gap-6">
      <PendingLinkRequestsBanner />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-secondary">Giocatore</span>
          <select
            value={activePlayerId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-ink"
          >
            {activeRosterPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        {player?.position && player.position !== 'UNSPECIFIED' && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-secondary">
            {player.position}
          </span>
        )}
        {player?.heightCm !== undefined && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-secondary">
            {player.heightCm.toFixed(0)} cm
          </span>
        )}
        {player?.weightKg !== undefined && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-secondary">
            {player.weightKg.toFixed(1)} kg
          </span>
        )}
        {player?.sprint10mSec !== undefined && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-secondary">
            Sprint 10m: {player.sprint10mSec.toFixed(3)}s
          </span>
        )}
        {player?.sprint30mSec !== undefined && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-secondary">
            Sprint 30m: {player.sprint30mSec.toFixed(3)}s
          </span>
        )}
      </div>

      {activePlayerId && <PlayerLinkPanel playerId={activePlayerId} canEdit={canEdit} />}

      {loadingSegments ? null : sessionCount === 0 ? (
        <EmptyState
          icon={UserCircle}
          title="Nessun dato per questo giocatore"
          description="Questo giocatore non compare in nessuna sessione importata."
        />
      ) : (
        <>
          {linkedEntry && (
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Link2 className="size-3.5 text-status-good" />
              Include le sessioni collegate di "{linkedEntry.otherPlayerName}" nell'altro spazio.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Sessioni"
              value={String(sessionCount)}
              footer={
                attendance && (
                  <dl className="mt-1 grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1 text-xs">
                    <AttendanceRow
                      label="Allenamenti completi"
                      detail={`${attendance.training.attended}/${attendance.training.total}`}
                      pct={attendance.training.pct}
                    />
                    <AttendanceRow
                      label="Presenze partite"
                      detail={`${attendance.matches.attended}/${attendance.matches.total}`}
                      pct={attendance.matches.pct}
                    />
                    <AttendanceRow
                      label="Minutaggio"
                      detail={`${formatNumber(attendance.minutes.playedSec / 60)}/${formatNumber(attendance.minutes.availableSec / 60)}′`}
                      pct={attendance.minutes.pct}
                    />
                  </dl>
                )
              }
            />
            <StatTile label="Distanza media settimanale" value={formatNumber(avgWeeklyDistance)} unit="m" />
            <StatTile
              label="Vmax storica"
              value={formatNumber(maxSpeed, 1)}
              unit="km/h"
              accent
              hint={maxSpeedDate ? `Registrata il ${maxSpeedDate}` : undefined}
            />
            <StatTile label="Posizione" value={player?.position ?? '—'} />
          </div>

          {currentSession && (
            <div className="panel p-4">
              <p className="font-display mb-1 text-base font-medium text-ink">Alert — {currentSession.label}</p>
              <p className="mb-3 text-xs text-ink-muted">
                Deficit di velocità massima, esposizione a velocità alta negli ultimi 7 giorni e carichi anomali
                rispetto alla mediana squadra, per la sessione attualmente selezionata.
              </p>
              {playerAlerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-ink-secondary">
                  <ShieldCheck className="size-4 text-status-good" />
                  Nessun alert per {player?.displayName ?? 'questo giocatore'}.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {playerAlerts.map((flag, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[flag.severity]}`}>
                        {SEVERITY_LABEL[flag.severity]}
                      </span>
                      <span className="text-ink-secondary">{flag.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {microcycleRows.length > 0 && (
            <div className="panel p-4">
              <p className="font-display mb-1 text-base font-medium text-ink">Completamento microciclo attuale</p>
              <p className="mb-3 text-xs text-ink-muted">
                Carico dalle {microcycleRows[0].result.sessionsSinceLastMatch} sedute svolte dall'ultima partita a
                oggi
                {microcycleRows[0].result.validCycleCount > 0 &&
                  `, su ${microcycleRows[0].result.validCycleCount} microcicli storici validi`}
                . Ogni riga confronta il valore contro la media dello stesso dato in un microciclo tipo (Ripresa +
                Forza + Metabolico + Rifinitura).
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {microcycleRows.map(({ def, result }) => (
                  <div key={def.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="text-ink-secondary">{def.label}</span>
                    <span className="shrink-0 tabular-nums text-ink" title={DENOMINATOR_CAPTION[result.denominatorSource]}>
                      {result.pct !== null ? `${result.pct.toFixed(0)}%` : '—'}
                      {result.lowSample && <span className="text-status-warning">*</span>}
                    </span>
                  </div>
                ))}
              </div>
              {microcycleRows.some((r) => r.result.lowSample) && (
                <p className="mt-2 text-xs text-ink-muted">
                  * poche sessioni finora in questo microciclo: percentuale poco affidabile.
                </p>
              )}
            </div>
          )}

          {weeklyModelRows.length > 0 && (
            <div className="panel p-4">
              <p className="font-display mb-1 text-base font-medium text-ink">Modello prestativo settimanale</p>
              <p className="mb-3 text-xs text-ink-muted">
                Confronta il carico cumulato negli allenamenti svolti dall'ultima partita a oggi contro un target
                teorico: 2.5x il modello gara per il volume totale, 1.5x per le distanze ad alta velocità. Stessa
                logica di Session v Game, applicata al solo {player?.displayName ?? 'giocatore'}.
              </p>
              <div className="flex flex-col gap-4">
                {weeklyModelRows.map((row) => (
                  <ComparisonBar
                    key={row.key}
                    label={row.label}
                    unit={row.unit}
                    primaryLabel="Post-gara"
                    primaryValue={row.postMatchValue}
                    referenceLabel="Target"
                    referenceValue={row.target}
                    showRatio
                  />
                ))}
              </div>
            </div>
          )}

          {fullSessionSegs.length >= 2 ? (
            <div className="panel p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{trendMetric.label} nel tempo</p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-ink-secondary">Periodo</span>
                    <select
                      value={periodMode}
                      onChange={(e) => setPeriodMode(e.target.value as 'manual' | 'last7')}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-ink"
                    >
                      <option value="manual">Selezione manuale</option>
                      <option value="last7">Ultimi 7 giorni</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-ink-secondary">Metrica</span>
                    <select
                      value={trendMetricKey}
                      onChange={(e) => setTrendMetricKey(e.target.value)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-ink"
                    >
                      {trendMetrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {chartRows.length >= 2 ? (
                <>
                  {periodMode === 'last7' ? (
                    <>
                      <TrendBars data={chartData} valueFormatter={trendValueFormatter} />
                      {periodHasMedian && (
                        <p className="mt-1 text-center text-xs text-ink-secondary">
                          Totale periodo — giocatore/mediana squadra:{' '}
                          <span className="font-semibold tabular-nums text-ink">
                            ({formatNumber(periodPlayerTotal, trendMetric.unit === 'km/h' ? 1 : 0)}/
                            {formatNumber(periodMedianTotal, trendMetric.unit === 'km/h' ? 1 : 0)})
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <TrendLine data={chartData} valueFormatter={trendValueFormatter} />
                      <p className="mt-1 text-center text-[11px] text-ink-muted">
                        Linea continua: {player?.displayName ?? 'giocatore'}. Linea tratteggiata con ×: mediana
                        squadra per la stessa sessione.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <p className="py-10 text-center text-xs text-ink-muted">
                  {periodMode === 'last7'
                    ? "Nessuna sessione negli ultimi 7 giorni per vedere l'andamento."
                    : "Seleziona almeno 2 sessioni nella tabella qui sotto per vedere l'andamento."}
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={UserCircle}
              title="Trend non ancora disponibile"
              description="Servono almeno 2 sessioni per questo giocatore per mostrare l'andamento nel tempo."
            />
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Storico sessioni</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-ink-muted">
                  {periodMode === 'last7'
                    ? 'Periodo "Ultimi 7 giorni" attivo — la selezione qui sotto non ha effetto sul grafico'
                    : 'Seleziona le sessioni da includere nel grafico sopra'}
                </span>
                <button
                  type="button"
                  disabled={periodMode === 'last7'}
                  onClick={() => setExcludedSegIds(new Set())}
                  className="font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                >
                  Seleziona tutto
                </button>
                <button
                  type="button"
                  disabled={periodMode === 'last7'}
                  onClick={() => setExcludedSegIds(new Set(fullSessionSegs.map((r) => r.segment.id)))}
                  className="font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                >
                  Deseleziona tutto
                </button>
              </div>
            </div>
            <div className="overflow-x-auto panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2">
                      <span className="sr-only">Includi nel grafico</span>
                    </th>
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Etichetta</th>
                    <th className="px-3 py-2 text-right">TD (m)</th>
                    <th className="px-3 py-2 text-right">HSR (m)</th>
                    <th className="px-3 py-2 text-right">Vmax (km/h)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...fullSessionSegs].reverse().map((r) => {
                    const included = !excludedSegIds.has(r.segment.id)
                    const rehab = r.segment.isRehab
                    const cellText = rehab ? 'text-status-critical' : 'text-ink'
                    return (
                    <tr
                      key={r.segment.id}
                      className={`border-b border-border last:border-0 ${rehab ? 'bg-status-critical/10' : ''} ${included ? '' : 'opacity-40'}`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={included}
                          disabled={periodMode === 'last7'}
                          onChange={() => toggleSegSelection(r.segment.id)}
                          aria-label={`Includi la sessione del ${r.session.date} nel grafico`}
                          className="size-4 rounded border-border accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className={`px-4 py-2 tabular-nums ${cellText}`}>{r.session.date}</td>
                      <td className={`px-4 py-2 ${rehab ? 'text-status-critical' : 'text-ink-secondary'}`}>
                        {sessionHistoryLabel(r.session)}
                        {rehab && (
                          <span className="ml-1.5 rounded-full bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-status-critical">
                            Rehab
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${cellText}`}>
                        {r.segment.totalDistanceM.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${cellText}`}>{r.segment.hsrM.toFixed(0)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${cellText}`}>
                        {r.segment.maxSpeedKmh.toFixed(1)}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {fullSessionSegs.some((r) => r.segment.isRehab) && (
              <p className="mt-2 text-xs text-status-critical">
                Le righe in rosso sono sessioni di rehab (giocatore infortunato): contano per lo storico personale
                di {player?.displayName ?? 'questo giocatore'}, ma sono escluse da medie, mediane e classifiche di
                squadra altrove nell'app.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
