import type { DrillSegment, Session } from '../../types/domain'

export interface AttendanceRatio {
  attended: number
  total: number
  /** null when there is nothing to divide by (no session of that kind yet). */
  pct: number | null
}

export interface PlayerAttendance {
  /** Completed trainings / every team training session (Amichevole included, two a day = two). */
  training: AttendanceRatio
  /** Matches with any GPS data for the player / every team match. */
  matches: AttendanceRatio
  /** Player's match seconds / sum of each match's longest recorded full session. */
  minutes: { playedSec: number; availableSec: number; pct: number | null }
}

function ratio(attended: number, total: number): AttendanceRatio {
  return { attended, total, pct: total > 0 ? (attended / total) * 100 : null }
}

/**
 * Whole-season attendance for one player, from the GPS exports alone — a player missing
 * from a session's export is an absence. Every player shares the same denominator: all of
 * the team's sessions, from the very first training on.
 *
 * - Training counts as attended only if the player has a non-Rehab full session row.
 * - A match counts as attended on any full session row (GPS data = on the pitch).
 * - The match's available minutes are its longest recorded full session across the squad,
 *   so stoppage time is included without assuming a fixed 90'.
 *
 * Pass the workspace's own sessions/segments, never a cross-workspace merge: the
 * denominator is this team's calendar.
 */
export function computePlayerAttendance(playerId: string, sessions: Session[], teamSegments: DrillSegment[]): PlayerAttendance {
  const trainingIds = new Set(sessions.filter((s) => s.type === 'training').map((s) => s.id))
  const matchIds = new Set(sessions.filter((s) => s.type === 'match').map((s) => s.id))

  const completedTrainings = new Set<string>()
  const playedMatches = new Set<string>()
  let playedSec = 0
  const longestBySession = new Map<string, number>()

  for (const seg of teamSegments) {
    if (seg.segmentKind !== 'full_session') continue
    if (matchIds.has(seg.sessionId)) {
      longestBySession.set(seg.sessionId, Math.max(longestBySession.get(seg.sessionId) ?? 0, seg.durationSec))
      if (seg.playerId === playerId && !playedMatches.has(seg.sessionId)) {
        playedMatches.add(seg.sessionId)
        playedSec += seg.durationSec
      }
    } else if (trainingIds.has(seg.sessionId) && seg.playerId === playerId && !seg.isRehab) {
      completedTrainings.add(seg.sessionId)
    }
  }

  const availableSec = [...longestBySession.values()].reduce((sum, v) => sum + v, 0)
  return {
    training: ratio(completedTrainings.size, trainingIds.size),
    matches: ratio(playedMatches.size, matchIds.size),
    minutes: { playedSec, availableSec, pct: availableSec > 0 ? (playedSec / availableSec) * 100 : null },
  }
}
