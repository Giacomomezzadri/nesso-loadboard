import type { DrillSegment, RpeEntry, Session } from '../../types/domain'
import { addDaysIso } from './playerStatus'

/**
 * Training Load = RPE × minutes of the player's full session (the classic session-RPE),
 * stored as RpeEntry.sRpe at entry time. Shown everywhere as "Training Load".
 */
export const TRAINING_LOAD_LABEL = 'Training Load'
export const TRAINING_LOAD_UNIT = 'UA'

export type RpeIndex = Map<string, RpeEntry>

export function indexRpe(entries: RpeEntry[]): RpeIndex {
  return new Map(entries.map((e) => [`${e.sessionId}:${e.playerId}`, e]))
}

/** The player's Training Load for the segment's session; undefined when no RPE was entered. */
export function trainingLoadOf(index: RpeIndex, seg: Pick<DrillSegment, 'sessionId' | 'playerId'>): number | undefined {
  return index.get(`${seg.sessionId}:${seg.playerId}`)?.sRpe
}

export function rpeOf(index: RpeIndex, seg: Pick<DrillSegment, 'sessionId' | 'playerId'>): number | undefined {
  return index.get(`${seg.sessionId}:${seg.playerId}`)?.rpe
}

export type AcwrZone = 'low' | 'optimal' | 'high' | 'very_high'

/** EWMA decay constants (Williams et al., 2017): λ = 2 / (N + 1) for a 7-day acute and a 28-day chronic window. */
const LAMBDA_ACUTE = 2 / (7 + 1)
const LAMBDA_CHRONIC = 2 / (28 + 1)
/** Below this many days of history the chronic average hasn't settled yet. */
export const ACWR_MIN_HISTORY_DAYS = 28
/** Under this share of rated sessions (last 28 days) the ratio is flagged as unreliable. */
export const ACWR_MIN_RATED_SHARE = 0.8

export interface PlayerAcwr {
  playerId: string
  /** Acute EWMA of the daily Training Load (UA/day). */
  acute: number
  /** Chronic EWMA of the daily Training Load (UA/day). */
  chronic: number
  ratio: number | null
  zone: AcwrZone | null
  /** Last 28 days: sessions the player has GPS data for, and how many of them have an RPE. */
  sessionsWithData: number
  ratedSessions: number
  /** Less than ACWR_MIN_HISTORY_DAYS of history: the ratio isn't meaningful yet. */
  building: boolean
}

/** The usual bands: under 0.8 underloaded, 0.8–1.3 the "sweet spot", above 1.5 a spike. */
export function acwrZone(ratio: number): AcwrZone {
  if (ratio < 0.8) return 'low'
  if (ratio <= 1.3) return 'optimal'
  if (ratio <= 1.5) return 'high'
  return 'very_high'
}

/**
 * Acute:chronic workload ratio on `refDate`, from exponentially weighted moving averages of
 * each player's daily Training Load, updated day by day from the first session:
 * EWMA_today = load_today × λ + EWMA_yesterday × (1 − λ).
 *
 * - A day without sessions for the player counts as 0 (rest is real zero load).
 * - A day where the player has GPS data in a session with no RPE is skipped: the averages are
 *   held rather than dragged down by a missing entry, and the gap shows in ratedSessions.
 */
export function computeAcwr(
  entries: RpeEntry[],
  sessions: Session[],
  segments: DrillSegment[],
  playerIds: string[],
  refDate: string,
): PlayerAcwr[] {
  const dateById = new Map(sessions.map((s) => [s.id, s.date]))
  const seasonStart = sessions.reduce<string | null>((min, s) => (s.date <= refDate && (min === null || s.date < min) ? s.date : min), null)
  if (seasonStart === null) return []
  const rated = indexRpe(entries)

  const loadByDay = new Map<string, number>() // `${playerId}:${date}`
  for (const e of entries) {
    const date = dateById.get(e.sessionId)
    if (!date || date > refDate) continue
    const key = `${e.playerId}:${date}`
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + e.sRpe)
  }
  const unratedDays = new Set<string>()
  const windowStart = addDaysIso(refDate, -(ACWR_MIN_HISTORY_DAYS - 1))
  const withData = new Map<string, number>()
  const withRpe = new Map<string, number>()
  const seen = new Set<string>()
  for (const seg of segments) {
    if (seg.segmentKind !== 'full_session') continue
    const date = dateById.get(seg.sessionId)
    const key = `${seg.sessionId}:${seg.playerId}`
    if (!date || date > refDate || seen.has(key)) continue
    seen.add(key)
    const isRated = rated.has(key)
    if (!isRated) unratedDays.add(`${seg.playerId}:${date}`)
    if (date >= windowStart) {
      withData.set(seg.playerId, (withData.get(seg.playerId) ?? 0) + 1)
      if (isRated) withRpe.set(seg.playerId, (withRpe.get(seg.playerId) ?? 0) + 1)
    }
  }

  const historyDays = Math.round((Date.parse(refDate) - Date.parse(seasonStart)) / 86_400_000) + 1
  const building = historyDays < ACWR_MIN_HISTORY_DAYS

  return playerIds.map((playerId) => {
    let acute = 0
    let chronic = 0
    for (let d = seasonStart; d <= refDate; d = addDaysIso(d, 1)) {
      const key = `${playerId}:${d}`
      if (unratedDays.has(key)) continue
      const load = loadByDay.get(key) ?? 0
      acute = load * LAMBDA_ACUTE + acute * (1 - LAMBDA_ACUTE)
      chronic = load * LAMBDA_CHRONIC + chronic * (1 - LAMBDA_CHRONIC)
    }
    const ratio = chronic > 0 ? acute / chronic : null
    return {
      playerId,
      acute,
      chronic,
      ratio,
      zone: ratio === null ? null : acwrZone(ratio),
      sessionsWithData: withData.get(playerId) ?? 0,
      ratedSessions: withRpe.get(playerId) ?? 0,
      building,
    }
  })
}
