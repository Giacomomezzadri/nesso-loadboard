import type { BodyMeasurement } from '../../src/types/domain'
import type { Env } from './mappers'

/**
 * Same statement as migrations/0015_body_measurements.sql — run before every query so the
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
      PRIMARY KEY (workspace_id, player_id, date)
    )`,
  ).run()
}

export function rowToBodyMeasurement(r: Record<string, unknown>): BodyMeasurement {
  return {
    playerId: r.player_id as string,
    date: r.date as string,
    fatMassPct: (r.fat_mass_pct as number | null) ?? undefined,
    skinfoldMm: (r.skinfold_mm as number | null) ?? undefined,
    muscleMassKg: (r.muscle_mass_kg as number | null) ?? undefined,
    updatedAt: r.updated_at as string,
  }
}
