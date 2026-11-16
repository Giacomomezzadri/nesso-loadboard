/**
 * Upserts shared by the bulk endpoints and by adding players to an existing session
 * (functions/api/sessions/add-players.ts). Bind with segmentToRow / rpeToRow, with the
 * workspace id inserted after the row id.
 */
export const SEGMENT_UPSERT_SQL = `
  INSERT INTO segments (
    id, workspace_id, session_id, player_id, drill_title, segment_kind, duration_sec, total_distance_m,
    distance_per_min, distance_zone4_m, distance_zone5_m, distance_zone6_m, entries_zone5,
    entries_zone6, hsr_m, hsr_per_min, max_speed_kmh, pct_max_speed, acc_zone3, dec_zone3,
    acc_zone4, dec_zone4, acc_zone5, dec_zone5, acc_zone6, dec_zone6, acc_per_min, dec_per_min,
    dropped_duplicates, warnings, is_synthesized_full_session, is_rehab
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    drill_title = excluded.drill_title, segment_kind = excluded.segment_kind,
    duration_sec = excluded.duration_sec, total_distance_m = excluded.total_distance_m,
    distance_per_min = excluded.distance_per_min, distance_zone4_m = excluded.distance_zone4_m,
    distance_zone5_m = excluded.distance_zone5_m, distance_zone6_m = excluded.distance_zone6_m,
    entries_zone5 = excluded.entries_zone5, entries_zone6 = excluded.entries_zone6,
    hsr_m = excluded.hsr_m, hsr_per_min = excluded.hsr_per_min, max_speed_kmh = excluded.max_speed_kmh,
    pct_max_speed = excluded.pct_max_speed, acc_zone3 = excluded.acc_zone3, dec_zone3 = excluded.dec_zone3,
    acc_zone4 = excluded.acc_zone4, dec_zone4 = excluded.dec_zone4, acc_zone5 = excluded.acc_zone5,
    dec_zone5 = excluded.dec_zone5, acc_zone6 = excluded.acc_zone6, dec_zone6 = excluded.dec_zone6,
    acc_per_min = excluded.acc_per_min, dec_per_min = excluded.dec_per_min,
    dropped_duplicates = excluded.dropped_duplicates, warnings = excluded.warnings,
    is_synthesized_full_session = excluded.is_synthesized_full_session, is_rehab = excluded.is_rehab
  WHERE segments.workspace_id = excluded.workspace_id
`

export const RPE_UPSERT_SQL = `
  INSERT INTO rpe (id, workspace_id, session_id, player_id, rpe, s_rpe, entered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET rpe = excluded.rpe, s_rpe = excluded.s_rpe, entered_at = excluded.entered_at
  WHERE rpe.workspace_id = excluded.workspace_id
`
