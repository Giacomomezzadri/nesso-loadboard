import type { DrillSegment, Session, TrainingType } from '../../types/domain'

/** The 4 training types that make up one "textbook" microcycle between matches. */
const REQUIRED_TRAINING_TYPES: TrainingType[] = ['ripresa', 'forza', 'metabolico_alte_velocita', 'rifinitura']

/** Below this many attended sessions in the current (in-progress) microcycle, the % is unreliable — flagged with an asterisk, not hidden. */
const LOW_SAMPLE_THRESHOLD = 3

export type DenominatorSource = 'per-type' | 'insufficient-data'

export interface MicrocycleCompletion {
  numerator: number
  denominator: number | null
  pct: number | null
  denominatorSource: DenominatorSource
  /** How many of the 4 training types had historical data for this player (the denominator sums only those). */
  typesWithData: number
  sessionsSinceLastMatch: number
  lowSample: boolean
}

function sortByDate(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.importedAt.localeCompare(b.importedAt))
}

/** Most recent match session's date, or null if no match has been recorded yet. */
export function lastMatchDate(sessions: Session[]): string | null {
  const matches = sortByDate(sessions.filter((s) => s.type === 'match'))
  return matches.length > 0 ? matches[matches.length - 1].date : null
}

/** Training sessions strictly between two match dates (exclusive of both bounds) — or, when `beforeDate` is null, everything up to (not including) `afterMatchDate`'s... actually: everything AFTER afterMatchDate when beforeMatchDate is null (the in-progress, not-yet-closed cycle). */
function trainingSessionsInWindow(sessions: Session[], afterDateExclusive: string | null, beforeDateExclusive: string | null): Session[] {
  return sortByDate(
    sessions.filter((s) => {
      if (s.type !== 'training') return false
      if (afterDateExclusive !== null && s.date <= afterDateExclusive) return false
      if (beforeDateExclusive !== null && s.date >= beforeDateExclusive) return false
      return true
    }),
  )
}

/** STEP 1 — training sessions since the last match (the in-progress microcycle), team-wide (not player-specific: attendance is handled separately). */
export function currentMicrocycleSessions(sessions: Session[]): Session[] {
  const lastMatch = lastMatchDate(sessions)
  return trainingSessionsInWindow(sessions, lastMatch, null)
}

/** Sum of a metric across a session group, for one player — sessions the player has no segment for simply don't contribute (their absence isn't fabricated as 0-with-full-weight, it's just not counted, same spirit as the rest of the app's "never fabricate" rule). */
function sumMetricForPlayer(
  group: Session[],
  playerId: string,
  fullSessionByPlayerAndSession: Map<string, DrillSegment>,
  metric: (s: DrillSegment) => number,
): { sum: number; attended: number } {
  let sum = 0
  let attended = 0
  for (const session of group) {
    const seg = fullSessionByPlayerAndSession.get(`${session.id}:${playerId}`)
    if (seg) {
      sum += metric(seg)
      attended++
    }
  }
  return { sum, attended }
}

/** The player's "textbook" microcycle: their average load per training type (Ripresa, Forza, Metabolico, Rifinitura), summed. */
function perTypeAverageSum(
  sessions: Session[],
  playerId: string,
  fullSessionByPlayerAndSession: Map<string, DrillSegment>,
  metric: (s: DrillSegment) => number,
): { sum: number; typesWithData: number } {
  let sum = 0
  let typesWithData = 0
  for (const type of REQUIRED_TRAINING_TYPES) {
    const sessionsOfType = sessions.filter((s) => s.type === 'training' && s.trainingType === type)
    const values: number[] = []
    for (const session of sessionsOfType) {
      const seg = fullSessionByPlayerAndSession.get(`${session.id}:${playerId}`)
      if (seg) values.push(metric(seg))
    }
    if (values.length > 0) {
      sum += values.reduce((a, b) => a + b, 0) / values.length
      typesWithData++
    }
  }
  return { sum, typesWithData }
}

/**
 * Full computation for one player: current in-progress load (since the last
 * match) as a % of their textbook microcycle — the sum of their average load in
 * each of the 4 training types, over every training session before the last match.
 */
export function computeMicrocycleCompletion(
  playerId: string,
  allSessions: Session[],
  allSegments: DrillSegment[],
  metric: (s: DrillSegment) => number,
): MicrocycleCompletion {
  const fullSessionByPlayerAndSession = new Map<string, DrillSegment>()
  for (const seg of allSegments) {
    if (seg.segmentKind === 'full_session') fullSessionByPlayerAndSession.set(`${seg.sessionId}:${seg.playerId}`, seg)
  }

  const current = currentMicrocycleSessions(allSessions)
  const { sum: numerator, attended } = sumMetricForPlayer(current, playerId, fullSessionByPlayerAndSession, metric)

  // Historical sessions only (strictly before the last match) — never the in-progress
  // window measured above, or the comparison becomes circular. No match yet → no history.
  const lastMatch = lastMatchDate(allSessions)
  const history = lastMatch === null ? [] : trainingSessionsInWindow(allSessions, null, lastMatch)
  const perType = perTypeAverageSum(history, playerId, fullSessionByPlayerAndSession, metric)
  const denominator = perType.typesWithData > 0 ? perType.sum : null
  const denominatorSource: DenominatorSource = denominator !== null ? 'per-type' : 'insufficient-data'

  const pct = denominator && denominator > 0 ? (numerator / denominator) * 100 : null

  return {
    numerator,
    denominator,
    pct,
    denominatorSource,
    typesWithData: perType.typesWithData,
    sessionsSinceLastMatch: attended,
    lowSample: attended < LOW_SAMPLE_THRESHOLD,
  }
}
