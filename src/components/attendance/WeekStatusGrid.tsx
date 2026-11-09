import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addDaysIso, buildFootballWeeks, buildStatusResolver, daysBetween } from '../../lib/metrics/playerStatus'
import { cn, formatNumber } from '../../lib/utils'
import { usePlannedDaysQuery, usePlayerStatusesQuery } from '../../state/queries'
import {
  PLAYER_STATUS_LABEL,
  TRAINING_TYPE_LABEL,
  type DrillSegment,
  type Player,
  type PlayerSessionStatus,
  type Position,
  type Session,
} from '../../types/domain'

const STATUS_STYLE: Record<PlayerSessionStatus, { code: string; className: string }> = {
  present: { code: 'P', className: 'bg-status-good text-white' },
  rehab: { code: 'R', className: 'bg-status-critical/15 text-status-critical' },
  absent: { code: 'A', className: 'bg-ink/10 text-ink-secondary' },
  gym: { code: 'PL', className: 'bg-series-violet/15 text-series-violet' },
  national_team: { code: 'NZ', className: 'bg-series-blue/15 text-series-blue' },
  other_team: { code: 'AS', className: 'bg-series-aqua/15 text-series-aqua' },
  not_called: { code: 'NC', className: 'bg-ink/10 text-ink-secondary' },
  unavailable: { code: 'IN', className: 'bg-status-serious/20 text-status-serious' },
  unused: { code: 'NU', className: 'bg-series-yellow/20 text-ink' },
}
/** Always shown in full, grouped by where the situation comes from. */
const LEGEND_GROUPS: { title: string; statuses: PlayerSessionStatus[] }[] = [
  { title: 'Dal GPS', statuses: ['present', 'rehab'] },
  { title: 'Allenamento', statuses: ['absent', 'gym', 'other_team', 'national_team'] },
  { title: 'Partita', statuses: ['not_called', 'unavailable', 'unused'] },
]
const POSITION_ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD', 'UNSPECIFIED']

const WEEKDAY = new Intl.DateTimeFormat('it-IT', { weekday: 'short', timeZone: 'UTC' })
const SHORT_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(iso + 'T00:00:00Z')

function localTodayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

function sessionTitle(s: Session): string {
  if (s.type === 'match') return s.label
  return s.trainingType ? TRAINING_TYPE_LABEL[s.trainingType] : 'Allenamento'
}

function StatusChip({ status, title }: { status?: PlayerSessionStatus; title: string }) {
  if (!status) {
    return (
      <span title={title} className="flex h-5 min-w-6 items-center justify-center rounded text-[10px] text-ink-muted/60">
        ·
      </span>
    )
  }
  const style = STATUS_STYLE[status]
  return (
    <span
      title={title}
      className={cn('flex h-5 min-w-6 items-center justify-center rounded px-1 text-[10px] font-semibold leading-none', style.className)}
    >
      {style.code}
    </span>
  )
}

/**
 * Overview grid: every active player × every day of a match-to-match week, with their
 * situation in each session (GPS-derived Present/Rehab, the rest set by the editor at import).
 */
export function WeekStatusGrid({
  sessions,
  segments,
  players,
}: {
  sessions: Session[]
  segments: DrillSegment[]
  players: Player[]
}) {
  const today = localTodayIso()
  const lookaheadEnd = addDaysIso(today, 14)
  const { data: planned = [] } = usePlannedDaysQuery(today, lookaheadEnd)
  const { data: stored = [] } = usePlayerStatusesQuery()
  const [weekIndex, setWeekIndex] = useState<number | null>(null)

  const nextPlannedMatch = planned.find((d) => d.kind === 'match' && d.date >= today)?.date
  const weeks = useMemo(() => buildFootballWeeks(sessions, today, nextPlannedMatch), [sessions, today, nextPlannedMatch])
  const resolve = useMemo(() => buildStatusResolver(segments, stored), [segments, stored])

  if (weeks.length === 0) return null
  const index = weekIndex === null || weekIndex >= weeks.length ? weeks.length - 1 : weekIndex
  const week = weeks[index]
  const days = daysBetween(week.start, week.end)
  const matchDay = week.endMatch?.date ?? week.plannedMatchDate

  const sessionsByDay = new Map<string, Session[]>()
  for (const s of sessions) {
    if (s.date < week.start || s.date > week.end) continue
    sessionsByDay.set(s.date, [...(sessionsByDay.get(s.date) ?? []), s])
  }
  for (const list of sessionsByDay.values()) list.sort((a, b) => a.importedAt.localeCompare(b.importedAt))
  const plannedByDay = new Map(planned.map((d) => [d.date, d]))
  const weekSessions = days.flatMap((d) => sessionsByDay.get(d) ?? [])

  const rows = players
    .filter((p) => p.active)
    .sort(
      (a, b) =>
        POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || a.displayName.localeCompare(b.displayName),
    )
  const cells = rows.map((p) => {
    let present = 0
    const byDay = days.map((d) =>
      (sessionsByDay.get(d) ?? []).map((s) => {
        const { status, segment } = resolve(s, p.id)
        if (status === 'present') present++
        const minutes = s.type === 'match' && segment ? ` · ${formatNumber(segment.durationSec / 60)}′` : ''
        return { session: s, status, title: `${p.displayName} — ${sessionTitle(s)}: ${status ? PLAYER_STATUS_LABEL[status] : 'non registrato'}${minutes}` }
      }),
    )
    return { player: p, byDay, present }
  })

  const weekTitle = week.endMatch
    ? `${week.endMatch.label} · ${SHORT_DATE.format(asDate(week.endMatch.date))}`
    : 'Settimana in corso'
  const dayTag = (d: string) => {
    if (!matchDay) return ''
    const diff = Math.round((asDate(d).getTime() - asDate(matchDay).getTime()) / 86_400_000)
    return diff === 0 ? 'MD' : diff < 0 ? `MD${diff}` : `MD+${diff}`
  }

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
          <ClipboardList className="size-4 text-primary" />
          Presenze della settimana
        </p>
        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setWeekIndex(index - 1)}
            aria-label="Settimana precedente"
            className="rounded-md p-1 text-ink-secondary hover:bg-ink/5 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-40 text-center text-xs font-medium text-ink">{weekTitle}</span>
          <button
            type="button"
            disabled={index === weeks.length - 1}
            onClick={() => setWeekIndex(index + 1)}
            aria-label="Settimana successiva"
            className="rounded-md p-1 text-ink-secondary hover:bg-ink/5 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border bg-page/60 px-3 py-2 text-[11px] text-ink-secondary">
        {LEGEND_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-medium uppercase tracking-wide text-ink-muted">{group.title}</span>
            {group.statuses.map((st) => (
              <span key={st} className="flex items-center gap-1">
                <span className={cn('flex h-4 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold', STATUS_STYLE[st].className)}>
                  {STATUS_STYLE[st].code}
                </span>
                {PLAYER_STATUS_LABEL[st]}
                {st === 'other_team' && <span className="text-ink-muted">(anche in partita)</span>}
              </span>
            ))}
          </div>
        ))}
        <span className="flex items-center gap-1">
          <span className="flex h-4 min-w-5 items-center justify-center text-ink-muted">·</span>
          Non registrato
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface py-1 pr-2 text-left font-medium text-ink-muted">Giocatore</th>
              {days.map((d) => {
                const isMatch = d === matchDay
                const daySessions = sessionsByDay.get(d) ?? []
                const plan = plannedByDay.get(d)
                const subtitle =
                  daySessions.length > 0
                    ? daySessions.map(sessionTitle).join(' + ')
                    : plan?.kind === 'day_off'
                      ? 'Riposo'
                      : plan?.kind === 'training'
                        ? `${plan.trainingType ? TRAINING_TYPE_LABEL[plan.trainingType] : 'Allenamento'} (pianificato)`
                        : plan?.kind === 'match'
                          ? 'Partita (pianificata)'
                          : 'Nessuna sessione'
                return (
                  <th
                    key={d}
                    title={`${SHORT_DATE.format(asDate(d))} — ${subtitle}`}
                    className={cn(
                      'px-0.5 py-1 text-center font-normal',
                      isMatch && 'rounded-t-md bg-accent/10',
                      d > today && 'opacity-50',
                    )}
                  >
                    <span className={cn('block text-[10px] uppercase', d === today ? 'font-semibold text-primary' : 'text-ink-muted')}>
                      {WEEKDAY.format(asDate(d)).replace('.', '')} {asDate(d).getUTCDate()}
                    </span>
                    <span className={cn('block text-[10px] font-semibold', isMatch ? 'text-accent' : 'text-ink-secondary')}>
                      {dayTag(d)}
                    </span>
                  </th>
                )
              })}
              <th className="py-1 pl-2 text-right font-medium text-ink-muted" title="Sessioni da presente (senza Rehab) / sessioni della settimana">
                Pres.
              </th>
            </tr>
          </thead>
          <tbody>
            {cells.map(({ player, byDay, present }, rowIndex) => {
              const newGroup = rowIndex > 0 && cells[rowIndex - 1].player.position !== player.position
              return (
                <tr key={player.id} className="group">
                  <td
                    className={cn(
                      'sticky left-0 z-10 max-w-36 truncate bg-surface py-0.5 pr-2 text-ink group-hover:bg-page',
                      newGroup && 'border-t border-border',
                    )}
                  >
                    <span className="mr-1 inline-block w-7 text-[10px] text-ink-muted">{player.position === 'UNSPECIFIED' ? '' : player.position}</span>
                    {player.displayName}
                  </td>
                  {byDay.map((entries, i) => (
                    <td
                      key={days[i]}
                      className={cn(
                        'px-0.5 py-0.5 group-hover:bg-page',
                        days[i] === matchDay && 'bg-accent/10',
                        newGroup && 'border-t border-border',
                      )}
                    >
                      <div className="flex justify-center gap-0.5">
                        {entries.map((e) => (
                          <StatusChip key={e.session.id} status={e.status} title={e.title} />
                        ))}
                      </div>
                    </td>
                  ))}
                  <td
                    className={cn(
                      'py-0.5 pl-2 text-right tabular-nums text-ink-secondary group-hover:bg-page',
                      newGroup && 'border-t border-border',
                    )}
                  >
                    {weekSessions.length > 0 ? `${present}/${weekSessions.length}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
