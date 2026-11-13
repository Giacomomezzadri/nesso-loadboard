import type { AnthropometryRecord, BodyMeasurement } from '../../src/types/domain'
import type { Env } from './mappers'
import { ensureColumns } from './schema'

// Shared with the import preview, so it drops exactly what the server would refuse.
export { BODY_VALUE_RANGES } from '../../src/lib/body/anthropometry'

/**
 * Same statement as migrations/0015_body_measurements.sql (+ 0016's column) — run before every query so the
 * feature works even if the migration was never applied by hand (Pages never auto-applies
 * migrations). IF NOT EXISTS makes it a no-op once the table exists.
 */
export async function ensureBodyMeasurementTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS body_measurements (
      workspace_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      date TEXT NOT NULL,
      fat_mass_pct REAL,
      skinfold_mm REAL,
      muscle_mass_kg REAL,
      updated_at TEXT NOT NULL,
      data TEXT,
      PRIMARY KEY (workspace_id, player_id, date)
    )`,
  ).run()
  // migrations/0016_body_measurement_profile.sql, for tables created before it.
  await ensureColumns(env, 'body_measurements', [{ name: 'data', type: 'TEXT' }])
}

export function rowToBodyMeasurement(r: Record<string, unknown>): BodyMeasurement {
  return {
    playerId: r.player_id as string,
    date: r.date as string,
    fatMassPct: (r.fat_mass_pct as number | null) ?? undefined,
    skinfoldMm: (r.skinfold_mm as number | null) ?? undefined,
    muscleMassKg: (r.muscle_mass_kg as number | null) ?? undefined,
    anthropometry: r.data ? (JSON.parse(r.data as string) as AnthropometryRecord) : undefined,
    updatedAt: r.updated_at as string,
  }
}
