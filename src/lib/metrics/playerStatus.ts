import type { DrillSegment, PlayerSessionStatus, PlayerStatusEntry, Session } from '../../types/domain'

/**
 * Resolves each player's situation in a session: a GPS full-session row means Present (or
 * Rehab, in a training, when the row was flagged so); otherwise whatever the editor picked
 * at import. Undefined = not recorded (e.g. sessions imported before this existed).
 */
export function buildStatusResolver(segments: DrillSegment[], stored: PlayerStatusEntry[]) {
  const gps = new Map<string, DrillSegment>()
  for (const seg of segments) {
    if (seg.segmentKind === 'full_session') gps.set(`${seg.sessionId}:${seg.playerId}`, seg)
  }
  const manual = new Map(stored.map((e) => [`${e.sessionId}:${e.playerId}`, e.status]))

  return (session: Session, playerId: string): { status?: PlayerSessionStatus; segment?: DrillSegment } => {
    const key = `${session.id}:${playerId}`
    const segment = gps.get(key)
    if (segment) return { status: session.type === 'training' && segment.isRehab ? 'rehab' : 'present', segment }
    return { status: manual.get(key) }
  }
}

// UTC date math on "YYYY-MM-DD" strings, like the planning calendar.
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d)
  return days
}

export interface FootballWeek {
  key: string
  /** First day: the day after the previous match. */
  start: string
  /** Last day: the closing match (or, for the week in progress, the next planned match / today). */
  end: string
  /** The imported match that closes the week; undefined for the week in progress. */
  endMatch?: Session
  /** Date of the next match from the planning calendar, for the week in progress. */
  plannedMatchDate?: string
}

/** Longest stretch shown for one week — a long break (winter, pre-season) is cut to its last days. */
const MAX_WEEK_DAYS = 14

/**
 * Match-to-match "football weeks": each runs from the day after one match to the next match
 * inclusive. The last one is the week in progress, up to the next planned match (from the
 * calendar) or today.
 */
export function buildFootballWeeks(sessions: Session[], today: string, nextPlannedMatch?: string): FootballWeek[] {
  const matches = sessions
    .filter((s) => s.type === 'match')
    .sort((a, b) => a.date.localeCompare(b.date) || a.importedAt.localeCompare(b.importedAt))
  const clampStart = (start: string, end: string) => {
    const earliest = addDaysIso(end, -(MAX_WEEK_DAYS - 1))
    return start < earliest ? earliest : start
  }

  const weeks: FootballWeek[] = []
  let previousDate: string | null = null
  for (const match of matches) {
    if (match.date === previousDate) continue // two matches on one day close the same week
    const start = previousDate ? addDaysIso(previousDate, 1) : addDaysIso(match.date, -6)
    weeks.push({ key: match.id, start: clampStart(start, match.date), end: match.date, endMatch: match })
    previousDate = match.date
  }

  const lastSessionDate = sessions.reduce((max, s) => (s.date > max ? s.date : max), '')
  const currentStart = previousDate ? addDaysIso(previousDate, 1) : addDaysIso(today, -6)
  let currentEnd = today > lastSessionDate ? today : lastSessionDate
  if (nextPlannedMatch && nextPlannedMatch >= currentStart && nextPlannedMatch > currentEnd) currentEnd = nextPlannedMatch
  if (currentEnd >= currentStart) {
    const plannedMatchDate = nextPlannedMatch && nextPlannedMatch >= currentStart ? nextPlannedMatch : undefined
    weeks.push({ key: 'current', start: clampStart(currentStart, currentEnd), end: currentEnd, plannedMatchDate })
  }
  return weeks
}
