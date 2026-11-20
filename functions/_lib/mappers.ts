import type { DrillSegment, Player, RpeEntry, Session } from '../../src/types/domain'

export interface Env {
  DB: D1Database
}

// --- sessions ---

export function sessionToRow(s: Session): unknown[] {
  return [
    s.id,
    s.date,
    s.label,
    s.type,
    s.trainingType ?? null,
    s.matchResult ?? null,
    s.matchLocation ?? null,
    s.opponentName ?? null,
    s.importedAt,
    s.sourceFileName ?? null,
    s.rawRowCount,
    s.warningCount,
    s.notes ?? null,
    s.reconciliation ? JSON.stringify(s.reconciliation) : null,
  ]
}

export function rowToSession(r: Record<string, unknown>): Session {
  return {
    id: r.id as string,
    date: r.date as string,
    label: r.label as string,
    type: r.type as Session['type'],
    trainingType: (r.training_type as Session['trainingType']) ?? undefined,
    matchResult: (r.match_result as Session['matchResult']) ?? undefined,
    matchLocation: (r.match_location as Session['matchLocation']) ?? undefined,
    opponentName: (r.opponent_name as string | null) ?? undefined,
    importedAt: r.imported_at as string,
    sourceFileName: (r.source_file_name as string | null) ?? undefined,
    rawRowCount: r.raw_row_count as number,
    warningCount: r.warning_count as number,
    notes: (r.notes as string | null) ?? undefined,
    reconciliation: r.reconciliation ? JSON.parse(r.reconciliation as string) : undefined,
  }
}

// --- players ---

/** Used only for the new-player INSERT — height/weight are never set at creation time, so they're deliberately left out of the fixed column list (see the PATCH endpoint for how those two get written once set). */
export function playerToRow(p: Player): unknown[] {
  return [p.id, p.displayName, p.position, p.personalMaxSpeedKmh ?? null, p.pbConfirmed ? 1 : 0, p.active ? 1 : 0, p.createdAt, p.updatedAt]
}

export function rowToPlayer(r: Record<string, unknown>): Player {
  return {
    id: r.id as string,
    displayName: r.display_name as string,
    position: r.position as Player['position'],
    heightCm: (r.height_cm as number | null) ?? undefined,
    weightKg: (r.weight_kg as number | null) ?? undefined,
    personalMaxSpeedKmh: (r.personal_max_speed_kmh as number | null) ?? undefined,
    pbConfirmed: Boolean(r.pb_confirmed),
    sprint10mSec: (r.sprint_10m_sec as number | null) ?? undefined,
    sprint30mSec: (r.sprint_30m_sec as number | null) ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// --- segments ---

export function segmentToRow(s: DrillSegment): unknown[] {
  return [
    s.id,
    s.sessionId,
    s.playerId,
    s.drillTitle,
    s.segmentKind,
    s.durationSec,
    s.totalDistanceM,
    s.distancePerMin,
    s.distanceZone4M,
    s.distanceZone5M,
    s.distanceZone6M,
    s.entriesZone5,
    s.entriesZone6,
    s.hsrM,
    s.hsrPerMin,
    s.maxSpeedKmh,
    s.pctMaxSpeed,
    s.accZone3,
    s.decZone3,
    s.accZone4,
    s.decZone4,
    s.accZone5,
    s.decZone5,
    s.accZone6,
    s.decZone6,
    s.accPerMin,
    s.decPerMin,
    s.droppedDuplicates ? JSON.stringify(s.droppedDuplicates) : null,
    s.warnings ? JSON.stringify(s.warnings) : null,
    s.isSynthesizedFullSession ? 1 : 0,
    s.isRehab ? 1 : 0,
    s.trainingType ?? null,
  ]
}

export function rowToSegment(r: Record<string, unknown>): DrillSegment {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    playerId: r.player_id as string,
    drillTitle: r.drill_title as string,
    segmentKind: r.segment_kind as DrillSegment['segmentKind'],
    durationSec: r.duration_sec as number,
    totalDistanceM: r.total_distance_m as number,
    distancePerMin: r.distance_per_min as number,
    distanceZone4M: r.distance_zone4_m as number,
    distanceZone5M: r.distance_zone5_m as number,
    distanceZone6M: r.distance_zone6_m as number,
    entriesZone5: r.entries_zone5 as number,
    entriesZone6: r.entries_zone6 as number,
    hsrM: r.hsr_m as number,
    hsrPerMin: r.hsr_per_min as number,
    maxSpeedKmh: r.max_speed_kmh as number,
    pctMaxSpeed: r.pct_max_speed as number,
    accZone3: r.acc_zone3 as number,
    decZone3: r.dec_zone3 as number,
    accZone4: r.acc_zone4 as number,
    decZone4: r.dec_zone4 as number,
    accZone5: r.acc_zone5 as number,
    decZone5: r.dec_zone5 as number,
    accZone6: r.acc_zone6 as number,
    decZone6: r.dec_zone6 as number,
    accPerMin: r.acc_per_min as number,
    decPerMin: r.dec_per_min as number,
    droppedDuplicates: r.dropped_duplicates ? JSON.parse(r.dropped_duplicates as string) : undefined,
    warnings: r.warnings ? JSON.parse(r.warnings as string) : undefined,
    isSynthesizedFullSession: Boolean(r.is_synthesized_full_session),
    isRehab: Boolean(r.is_rehab),
    trainingType: (r.training_type as DrillSegment['trainingType'] | null) ?? undefined,
  }
}

// --- rpe ---

export function rpeToRow(e: RpeEntry): unknown[] {
  return [e.id, e.sessionId, e.playerId, e.rpe, e.sRpe, e.enteredAt]
}

export function rowToRpe(r: Record<string, unknown>): RpeEntry {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    playerId: r.player_id as string,
    rpe: r.rpe as number,
    sRpe: r.s_rpe as number,
    enteredAt: r.entered_at as string,
  }
}
