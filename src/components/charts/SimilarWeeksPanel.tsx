import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { distanceAbove19_8, distanceAbove25_2, mechanicalWork } from '../../lib/metrics/metricsCatalog'
import { buildMatchWeeks, indexFullSessions, playerWeekLoad, teamWeekMedian } from '../../lib/metrics/similarWeeks'
import { cn, formatNumber } from '../../lib/utils'
import type { AppSettings, DrillSegment, Player, Session } from '../../types/domain'

const PLAYER_COLOR = 'var(--color-series-blue)'
const MEDIAN_COLOR = 'var(--color-ink-muted)'
const SHORT_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })

interface WeekMetric {
  key: string
  label: string
  unit: string
  getValue: (s: DrillSegment) => number
}

interface WeekDatum {
  key: string
  x: string
  matchLabel: string
  current: boolean
  total: number
  value: number | null
  median: number | null
  medianPlayers: number
  attended: number
  completed: number
  rehab: number
  complete: boolean
  /** "3/4" above an incomplete player bar; undefined (no label) otherwise. */
  attendanceLabel?: string
}

function weekLabel(match: Session): string {
  return `${match.opponentName?.trim() || match.label} · ${SHORT_DATE.format(new Date(match.date + 'T00:00:00Z'))}`
}

function WeekTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: WeekDatum }[]; metric: WeekMetric }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const fmt = (v: number | null) => (v === null ? '—' : `${formatNumber(v, 0)} ${metric.unit}`)
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-ink">{d.current ? 'Settimana in corso' : d.matchLabel}</p>
      <p className="mb-1 text-ink-muted">
        {d.current ? `${d.total} allenamenti finora` : `${d.total} allenamenti prima della partita`}
      </p>
      <p className="tabular-nums text-ink">
        Giocatore: <span className="font-semibold">{fmt(d.value)}</span>
        <span className="text-ink-muted">
          {' '}
          · {d.completed}/{d.total} sedute complete{d.rehab > 0 ? ` · ${d.rehab} Rehab` : ''}
        </span>
      </p>
      <p className="tabular-nums text-ink-secondary">
        Mediana squadra: <span className="font-semibold">{fmt(d.median)}</span>
        {d.median !== null && <span className="text-ink-muted"> · {d.medianPlayers} giocatori</span>}
      </p>
    </div>
  )
}

/**
 * Compares a player's training load across "similar" weeks — match-to-match weeks with the
 * same number of training sessions — against the team median of each week. The x axis is
 * the match that closes the week; the match itself isn't counted in the load.
 */
export function SimilarWeeksPanel({
  sessions,
  segments,
  players,
  settings,
}: {
  sessions: Session[]
  /** Already limited to active players. */
  segments: DrillSegment[]
  players: Player[]
  settings: AppSettings
}) {
  const activePlayers = useMemo(
    () => players.filter((p) => p.active).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [players],
  )
  const { closed, current } = useMemo(() => buildMatchWeeks(sessions), [sessions])
  const fullByKey = useMemo(() => indexFullSessions(segments), [segments])
  const [playerId, setPlayerId] = useState('')
  const [length, setLength] = useState<number | null>(null)
  const [metricKey, setMetricKey] = useState('td')

  const metrics: WeekMetric[] = [
    { key: 'td', label: 'Distanza tot.', unit: 'm', getValue: (s) => s.totalDistanceM },
    { key: 'hsr', label: 'D>19.8', unit: 'm', getValue: distanceAbove19_8 },
    { key: 'sprint', label: 'D>25.2', unit: 'm', getValue: distanceAbove25_2 },
    { key: 'mechw', label: 'MechW', unit: '#', getValue: (s) => mechanicalWork(s, settings) },
  ]
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0]

  const weeksByLength = new Map<number, number>()
  for (const w of closed) weeksByLength.set(w.trainings.length, (weeksByLength.get(w.trainings.length) ?? 0) + 1)
  const lengths = [...weeksByLength.keys()].sort((a, b) => a - b)
  // Default: the most common week length (the longer one on a tie).
  const defaultLength = lengths.reduce<number | null>(
    (best, l) => (best === null || weeksByLength.get(l)! >= weeksByLength.get(best)! ? l : best),
    null,
  )
  const selectedLength = length !== null && weeksByLength.has(length) ? length : defaultLength
  const selectedPlayerId = activePlayers.some((p) => p.id === playerId) ? playerId : (activePlayers[0]?.id ?? '')

  const header = (
    <div className="flex flex-col gap-1">
      <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
        <CalendarDays className="size-4 text-primary" />
        Settimane simili
      </p>
      <p className="text-xs text-ink-muted">
        Carico di allenamento tra una partita e la successiva, solo nelle settimane con lo stesso numero di allenamenti.
        La partita non è inclusa nel totale.
      </p>
    </div>
  )

  if (selectedLength === null || !selectedPlayerId) {
    return (
      <section className="panel flex flex-col gap-3 p-4">
        {header}
        <p className="text-sm text-ink-muted">
          Servono almeno due partite con degli allenamenti in mezzo per confrontare le settimane.
        </p>
      </section>
    )
  }

  const playerIds = activePlayers.map((p) => p.id)
  const shownWeeks = closed.filter((w) => w.trainings.length === selectedLength)
  if (current && current.trainings.length <= selectedLength) shownWeeks.push(current)

  const data: WeekDatum[] = shownWeeks.map((w) => {
    const own = playerWeekLoad(w, selectedPlayerId, fullByKey, metric.getValue)
    const team = teamWeekMedian(w, playerIds, fullByKey, metric.getValue)
    const total = w.trainings.length
    const complete = own.completed === total
    return {
      key: w.key,
      x: w.endMatch ? weekLabel(w.endMatch) : 'In corso',
      matchLabel: w.endMatch ? weekLabel(w.endMatch) : 'In corso',
      current: !w.endMatch,
      total,
      value: own.attended > 0 ? own.value : null,
      median: team.value,
      medianPlayers: team.playerCount,
      attended: own.attended,
      completed: own.completed,
      rehab: own.rehab,
      complete,
      attendanceLabel: complete || own.attended === 0 ? undefined : `${own.completed}/${total}`,
    }
  })
  const angled = data.length > 5
  const hasIncomplete = data.some((d) => !d.complete && d.attended > 0)
  const hasCurrent = data.some((d) => d.current)

  return (
    <section className="panel flex flex-col gap-4 p-4">
      {header}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Giocatore
          <select
            value={selectedPlayerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="min-w-44 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {activePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Settimane da
          <select
            value={selectedLength}
            onChange={(e) => setLength(Number(e.target.value))}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {lengths.map((l) => (
              <option key={l} value={l}>
                {l} {l === 1 ? 'allenamento' : 'allenamenti'} ({weeksByLength.get(l)}{' '}
                {weeksByLength.get(l) === 1 ? 'settimana' : 'settimane'})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Metrica">
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium',
                m.key === metric.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-ink-secondary hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={angled ? 300 : 260}>
        <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            interval={0}
            tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
            angle={angled ? -35 : 0}
            textAnchor={angled ? 'end' : 'middle'}
            height={angled ? 70 : 30}
            axisLine={{ stroke: 'var(--color-baseline)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
            tickFormatter={(v: number) => formatNumber(v, 0)}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip cursor={{ fill: 'var(--color-ink)', fillOpacity: 0.04 }} content={<WeekTooltip metric={metric} />} />
          <Bar dataKey="value" name="Giocatore" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.key}
                fill={PLAYER_COLOR}
                fillOpacity={d.current ? 0.3 : d.complete ? 1 : 0.4}
                stroke={d.current ? PLAYER_COLOR : undefined}
                strokeDasharray={d.current ? '4 3' : undefined}
              />
            ))}
            <LabelList dataKey="attendanceLabel" position="top" fontSize={10} fill="var(--color-ink-muted)" />
          </Bar>
          <Bar dataKey="median" name="Mediana squadra" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.key}
                fill={MEDIAN_COLOR}
                fillOpacity={d.current ? 0.2 : 0.5}
                stroke={d.current ? MEDIAN_COLOR : undefined}
                strokeDasharray={d.current ? '4 3' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: PLAYER_COLOR }} />
          {activePlayers.find((p) => p.id === selectedPlayerId)?.displayName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm opacity-50" style={{ background: MEDIAN_COLOR }} />
          Mediana squadra (solo chi ha fatto tutte le sedute, senza Rehab)
        </span>
        {hasIncomplete && <span>Barra chiara con «3/4» = sedute saltate o in Rehab</span>}
        {hasCurrent && <span>Tratteggiata = settimana in corso (parziale)</span>}
      </div>
    </section>
  )
}
