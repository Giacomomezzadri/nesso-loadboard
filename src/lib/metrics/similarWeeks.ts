import type { DrillSegment, Session } from '../../types/domain'
import { median } from './heatmap'

/** The training sessions between two consecutive matches — same boundaries as the microcycle (see microcycle.ts). */
export interface MatchWeek {
  key: string
  /** The match that closes the week; undefined for the in-progress week after the last match. */
  endMatch?: Session
  trainings: Session[]
}

export interface PlayerWeekLoad {
  /** Sum of the metric over every full session the player has in the week (Rehab included — it's their real load). */
  value: number
  /** Sessions with any full-session row. */
  attended: number
  /** Sessions done in full — attended and not Rehab. */
  completed: number
  rehab: number
}

function chronological(a: Session, b: Session): number {
  return a.date.localeCompare(b.date) || a.importedAt.localeCompare(b.importedAt)
}

/**
 * Splits history into match-to-match weeks. A week's length is its number of training
 * sessions (Amichevole included, a double session counts twice); the match itself is not
 * part of it. Trainings before the first match have no opening match and are skipped.
 */
export function buildMatchWeeks(sessions: Session[]): { closed: MatchWeek[]; current: MatchWeek | null } {
  const sorted = [...sessions].sort(chronological)
  const matches = sorted.filter((s) => s.type === 'match')
  const trainings = sorted.filter((s) => s.type === 'training')
  const between = (after: string, before: string | null) =>
    trainings.filter((t) => t.date > after && (before === null || t.date < before))

  const closed: MatchWeek[] = []
  for (let i = 1; i < matches.length; i++) {
    const group = between(matches[i - 1].date, matches[i].date)
    if (group.length > 0) closed.push({ key: matches[i].id, endMatch: matches[i], trainings: group })
  }
  const last = matches[matches.length - 1]
  const currentTrainings = last ? between(last.date, null) : []
  return { closed, current: currentTrainings.length > 0 ? { key: 'current', trainings: currentTrainings } : null }
}

/** Full-session rows keyed by `${sessionId}:${playerId}`. */
export function indexFullSessions(segments: DrillSegment[]): Map<string, DrillSegment> {
  const byKey = new Map<string, DrillSegment>()
  for (const seg of segments) {
    if (seg.segmentKind === 'full_session') byKey.set(`${seg.sessionId}:${seg.playerId}`, seg)
  }
  return byKey
}

export function playerWeekLoad(
  week: MatchWeek,
  playerId: string,
  fullByKey: Map<string, DrillSegment>,
  metric: (s: DrillSegment) => number,
): PlayerWeekLoad {
  const load: PlayerWeekLoad = { value: 0, attended: 0, completed: 0, rehab: 0 }
  for (const session of week.trainings) {
    const seg = fullByKey.get(`${session.id}:${playerId}`)
    if (!seg) continue
    load.value += metric(seg)
    load.attended++
    if (seg.isRehab) load.rehab++
    else load.completed++
  }
  return load
}

/** Team median of the week, over the players who did every session of it in full — absences and Rehab would drag it down. */
export function teamWeekMedian(
  week: MatchWeek,
  playerIds: string[],
  fullByKey: Map<string, DrillSegment>,
  metric: (s: DrillSegment) => number,
): { value: number | null; playerCount: number } {
  const values = playerIds
    .map((id) => playerWeekLoad(week, id, fullByKey, metric))
    .filter((l) => l.completed === week.trainings.length)
    .map((l) => l.value)
  return { value: values.length > 0 ? median(values) : null, playerCount: values.length }
}
