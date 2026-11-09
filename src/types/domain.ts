// Canonical data model — see the plan doc for the full rationale behind each
// assumption. Everything derived from the CSV reads its thresholds from
// AppSettings; nothing is hardcoded to a specific vendor's zone boundaries.

export type SegmentKind = 'full_session' | 'warmup' | 'drill'
export type SessionType = 'training' | 'match'
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD' | 'UNSPECIFIED'

/** Sub-classification of a training session — lets the trainer compare like-for-like (e.g. Forza vs Forza), not just training-vs-training. Not applicable to matches. */
export type TrainingType =
  | 'ripresa'
  | 'forza'
  | 'metabolico_alte_velocita'
  | 'rifinitura'
  | 'recupero_attivo'
  | 'mix'
  | 'amichevole'

export const TRAINING_TYPE_LABEL: Record<TrainingType, string> = {
  ripresa: 'Ripresa',
  forza: 'Forza',
  metabolico_alte_velocita: 'Metabolico + alte velocità',
  rifinitura: 'Rifinitura',
  recupero_attivo: 'Recupero attivo',
  mix: 'Mix',
  // A friendly match, imported like a real match (same full-session/game data) but filed as a
  // training session — it must NOT close a microcycle the way a real match does (see
  // lastMatchDate/historicalMicrocycleGroups in microcycle.ts, both keyed on type === 'match').
  amichevole: 'Amichevole',
}

/** Outcome of a match session — not applicable to trainings. */
export type MatchResult = 'win' | 'draw' | 'loss'

export const MATCH_RESULT_LABEL: Record<MatchResult, string> = {
  win: 'Vittoria',
  draw: 'Pareggio',
  loss: 'Sconfitta',
}

/** Where a match was played, and whether the trip added an extra travel day — not applicable to trainings. */
export type MatchLocation = 'home' | 'away' | 'away_2d'

export const MATCH_LOCATION_LABEL: Record<MatchLocation, string> = {
  home: 'Casa',
  away: 'Trasferta',
  away_2d: 'Trasferta (2 giorni)',
}

/** The match session label auto-generated from the opponent + venue — "(Avversario) Trasferta" for away/away_2d, "(Avversario) Casa" for home. */
export function buildMatchLabel(opponentName: string, location: MatchLocation): string {
  const suffix = location === 'home' ? 'Casa' : 'Trasferta'
  return `${opponentName.trim()} ${suffix}`
}

/** Opponent's 3-letter code, e.g. for the calendar day badge — "Internazionale" -> "INT". */
export function opponentInitials(opponentName: string): string {
  return opponentName.trim().slice(0, 3).toUpperCase()
}

/** ISO "YYYY-MM-DD" -> opponent's 3-letter code, for every match session — feeds the calendar's match-day badges. */
export function matchDayLabels(sessions: Session[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const s of sessions) {
    if (s.type === 'match' && s.opponentName) result[s.date] = opponentInitials(s.opponentName)
  }
  return result
}

/** What the staff plans for a calendar day — set by hand on the Overview calendar, independent of imported sessions. */
export type PlannedDayKind = 'training' | 'match' | 'day_off'

export interface PlannedDay {
  date: string // ISO "YYYY-MM-DD"
  kind: PlannedDayKind
  /** Only meaningful when kind === 'training'; optional — a plain "Allenamento" without a type is allowed. */
  trainingType?: TrainingType
  /** Only meaningful when kind === 'match'. */
  opponentName?: string
  /** Only meaningful when kind === 'match'. */
  matchLocation?: MatchLocation
  updatedAt: string
}

/** A left/right asymmetry as exported by force plates: "12 R" = 12%, right side dominant. */
export interface Asymmetry {
  pct: number
  side?: 'L' | 'R'
}

/**
 * One jump test (ForceDecks CMJ, DJ, …) for one player. `metrics` and `asymmetries` are keyed
 * by the export's own column header (trimmed), so every column is kept and the catalog in
 * lib/metrics/jumpTests.ts picks which ones to show.
 */
export interface JumpTest {
  id: string // `${playerId}:${testType}:${date}:${time}`
  playerId: string
  /** As exported, upper-cased — "CMJ", "DJ", … */
  testType: string
  date: string // ISO "YYYY-MM-DD"
  time?: string // "HH:MM", 24h
  bodyWeightKg?: number
  reps?: number
  /** The name exactly as spelled in the export — kept for traceability of the match. */
  sourceName: string
  metrics: Record<string, number>
  asymmetries: Record<string, Asymmetry>
  importedAt: string
}

/** A hand-made pairing of an externally spelled name (normalized) to a roster player. */
export interface PlayerAlias {
  aliasKey: string
  playerId: string
}

/**
 * A player's situation in one session. `present`/`rehab` come from the GPS export (a
 * full-session row, Rehab-flagged or not); the rest are picked by the editor at import time
 * for active roster players with no GPS data.
 */
export type PlayerSessionStatus =
  | 'present'
  | 'rehab'
  | 'absent'
  | 'gym'
  | 'national_team'
  | 'not_called'
  | 'unavailable'
  | 'unused'
  | 'other_team'

/** The choices offered for a player with no GPS data, by session type. */
export const MISSING_PLAYER_STATUSES: Record<SessionType, PlayerSessionStatus[]> = {
  training: ['absent', 'gym', 'other_team', 'national_team'],
  match: ['not_called', 'unavailable', 'other_team', 'unused'],
}

export const PLAYER_STATUS_LABEL: Record<PlayerSessionStatus, string> = {
  present: 'Presente',
  rehab: 'Rehab',
  absent: 'Assente',
  gym: 'Palestra',
  national_team: 'Nazionale',
  not_called: 'Non convocato',
  unavailable: 'Indisponibile',
  unused: 'Non utilizzato',
  other_team: 'Altra squadra',
}

/** An editor-set situation, stored per session and player (GPS-derived ones aren't stored). */
export interface PlayerStatusEntry {
  sessionId: string
  playerId: string
  status: PlayerSessionStatus
  updatedAt: string
}

/** One CSV row, after type coercion, before grouping/aggregation. */
export interface RawCsvRow {
  playerDisplayName: string
  drillTitle: string
  durationSec: number
  totalDistanceM: number
  distancePerMin: number
  distanceZone4M: number
  distanceZone5M: number
  distanceZone6M: number
  entriesZone5: number
  entriesZone6: number
  hsrM: number
  hsrPerMin: number
  maxSpeedKmh: number
  pctMaxSpeed: number
  accZone3: number
  decZone3: number
  accZone4: number
  decZone4: number
  accZone5: number
  decZone5: number
  accZone6: number
  decZone6: number
  accPerMin: number
  decPerMin: number
  rowIndex: number
  warnings: string[]
}

/** One row reassigned from its file-order player to another during import
 *  reconciliation (a shifted/misattributed name in the source export). */
export interface ReassignmentAudit {
  rowIndex: number
  drillTitle: string
  fromPlayerName: string
  toPlayerName: string
  violatedColumns: string[]
  reason: string
}

/** A training/match session — date/label/type are user-supplied at import time. */
export interface Session {
  id: string
  date: string // ISO "YYYY-MM-DD"
  label: string
  type: SessionType
  /** Only meaningful when type === 'training'. */
  trainingType?: TrainingType
  /** Only meaningful when type === 'match'. */
  matchResult?: MatchResult
  /** Only meaningful when type === 'match'. */
  matchLocation?: MatchLocation
  /** Only meaningful when type === 'match' — drives the auto-generated label via buildMatchLabel. */
  opponentName?: string
  importedAt: string
  sourceFileName?: string
  rawRowCount: number
  warningCount: number
  notes?: string
  /** Rows the reconciliation pass reassigned to a different player — see ReassignmentAudit. */
  reconciliation?: ReassignmentAudit[]
}

/** A player, keyed by a slug of their display name (no roster ID exists in the CSV). */
export interface Player {
  id: string
  displayName: string
  position: Position
  heightCm?: number
  weightKg?: number
  personalMaxSpeedKmh?: number
  /** Has a human confirmed personalMaxSpeedKmh is a trustworthy reference? See lib/metrics/pb.ts. */
  pbConfirmed: boolean
  /** Manually entered sprint test times (seconds) — not derived from GPS imports. */
  sprint10mSec?: number
  sprint30mSec?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/** One player+drill row within a session (post dedup/classification). */
export interface DrillSegment {
  id: string // `${sessionId}:${playerId}:${slug(drillTitle)}`
  sessionId: string
  playerId: string
  drillTitle: string
  segmentKind: SegmentKind
  durationSec: number
  totalDistanceM: number
  distancePerMin: number
  distanceZone4M: number
  distanceZone5M: number
  distanceZone6M: number
  entriesZone5: number
  entriesZone6: number
  hsrM: number
  hsrPerMin: number
  maxSpeedKmh: number
  pctMaxSpeed: number
  accZone3: number
  decZone3: number
  accZone4: number
  decZone4: number
  accZone5: number
  decZone5: number
  accZone6: number
  decZone6: number
  accPerMin: number
  decPerMin: number
  droppedDuplicates?: { drillTitle: string; durationSec: number }[]
  warnings?: string[]
  /** True if no "Full Session"-labeled row existed for this player and this
   *  segment was synthesized instead — for a match, strictly the sum of the
   *  1st/2nd Half rows; for a training, the sum of all other segments. */
  isSynthesizedFullSession?: boolean
  /** True if the drill title was "Rehab" (or similar) — the player was doing
   *  injury rehab work, not normal training. Still counts as this player's own
   *  full_session (their own history/trend/RPE stay intact), but must never
   *  feed a team-wide average/median/ranking — see isRehabTitle() in
   *  lib/csv/segmentBuilder.ts for the detection rule. */
  isRehab?: boolean
}

/** Manual RPE entry for one player in one session (Borg CR10 by default). */
export interface RpeEntry {
  id: string // `${sessionId}:${playerId}`
  sessionId: string
  playerId: string
  rpe: number
  sRpe: number // rpe * full_session duration (min), cached at entry time
  enteredAt: string
}

export type ZoneNumber = 3 | 4 | 5 | 6

export interface AppSettings {
  id: 'app-settings'
  schemaVersion: 1
  speedZonesKmh: {
    zone4MinKmh: number
    zone5MinKmh: number
    zone6MinKmh: number
  }
  useVendorZoneLabelsOnly: boolean
  mechanicalWork: {
    includeZonesForMechWork: ZoneNumber[]
    accModerateZones: ZoneNumber[]
    accHighZones: ZoneNumber[]
    decModerateZones: ZoneNumber[]
    decHighZones: ZoneNumber[]
  }
  sprintDefinition: {
    entriesZonesForSprintCount: (5 | 6)[]
  }
  gameDrillKeywords: string[]
  rpeScale: {
    type: 'borg-cr10'
    min: number
    max: number
  }
  weeklyTargets?: Partial<Record<string, number>>
  rollingWindowDays: number
  alertThresholds: {
    /** Below this % of the player's own recorded max speed -> sprint-deficit flag. */
    maxSpeedDeficitPct: number
    /** Relative deviation above the session's team median (same bands as the Drills heatmap) -> high-load flag. */
    highMechWorkRelative: number
    highVolumeRelative: number
    highSRpeRelative: number
  }
  /** Shown in the header of every PDF report. */
  teamName?: string
  /** Report templates built in Settings by editors/admins — see lib/reports/catalog.ts. */
  reportTemplates?: ReportTemplate[]
}

/**
 * Every kind of block a report can contain; add a kind here and in lib/reports/catalog.ts.
 * "page.section" kinds render that section of the page (see components/report/ReportSection.tsx).
 */
export type ReportBlockKind =
  | 'week_attendance'
  | 'overview.summary'
  | 'overview.alerts'
  | 'overview.calendar'
  | 'overview.microcycle'
  | 'dynamic.td'
  | 'dynamic.hsr'
  | 'dynamic.sprint'
  | 'dynamic.mechw'
  | 'dynamic.microcycle'
  | 'svg.training-vs-game'
  | 'svg.intensity'
  | 'svg.weekly-model'
  | 'svg.drills'
  | 'svs.similar_weeks'
  | 'svs.table'
  | 'gvg.head_to_head'
  | 'gvg.minutes'
  | 'gvg.by_group'
  | 'drills.heatmap'
  | 'compare.volume'
  | 'compare.high_speed'
  | 'compare.mechanical'
  | 'profile.tiles'
  | 'profile.jump_tests'
  | 'profile.alerts'
  | 'profile.microcycle'
  | 'profile.weekly_model'
  | 'profile.trend'
  | 'profile.history'
  | 'alerts.table'
  | 'leaderboard.ranking'
  | 'leaderboard.scatter'
  | 'roster.table'

/** One block in a report template, with its own options (unused ones are simply ignored by a kind). */
export interface ReportBlock {
  id: string
  kind: ReportBlockKind
  /** Rows: only these roles; empty/absent = every active player. */
  positions?: Position[]
}

export interface ReportTemplate {
  id: string
  name: string
  blocks: ReportBlock[]
}

