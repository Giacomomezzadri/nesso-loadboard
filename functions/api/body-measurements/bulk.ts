import type { AppData } from '../../_lib/auth'
import { BODY_VALUE_RANGES, ensureBodyMeasurementTable } from '../../_lib/bodyMeasurements'
import { ISO_DATE } from '../../_lib/calendar'
import { badRequest, json } from '../../_lib/json'
import { ensureJumpTestTables } from '../../_lib/jumpTests'
import type { Env } from '../../_lib/mappers'
import type { BodyMeasurement, PlayerAlias } from '../../../src/types/domain'

const UPSERT_MEASUREMENT_SQL = `
  INSERT INTO body_measurements (workspace_id, player_id, date, fat_mass_pct, skinfold_mm, muscle_mass_kg, updated_at, data)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(workspace_id, player_id, date) DO UPDATE SET
    fat_mass_pct = excluded.fat_mass_pct, skinfold_mm = excluded.skinfold_mm,
    muscle_mass_kg = excluded.muscle_mass_kg, updated_at = excluded.updated_at, data = excluded.data
`
const UPSERT_ALIAS_SQL = `
  INSERT INTO player_aliases (workspace_id, alias_key, player_id, created_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(workspace_id, alias_key) DO UPDATE SET player_id = excluded.player_id
`
// Height/weight on the roster follow the newest measurement only: an older file re-imported
// later must not overwrite what a more recent one set.
const UPDATE_PLAYER_SQL = `
  UPDATE players SET
    height_cm = COALESCE(?, height_cm), weight_kg = COALESCE(?, weight_kg), updated_at = ?
  WHERE workspace_id = ? AND id = ?
    AND NOT EXISTS (SELECT 1 FROM body_measurements WHERE workspace_id = ? AND player_id = ? AND date > ?)
`
const HEIGHT_RANGE = [100, 230]
const WEIGHT_RANGE = [25, 200]
// D1 caps statements per batch; stay well under it.
const BATCH_SIZE = 100

const inRange = (v: unknown, [min, max]: readonly number[]) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/**
 * Saves an anthropometry import: one measurement per player on one date (re-importing the same
 * date replaces it), the name→player pairings made by hand, and — if asked — the roster height
 * and weight. Viewers are refused non-GET calls by _middleware.ts.
 */
export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as { measurements?: Omit<BodyMeasurement, 'updatedAt'>[]; aliases?: PlayerAlias[]; updatePlayers?: boolean }
  const measurements = body?.measurements ?? []
  const aliases = body?.aliases ?? []
  if (!Array.isArray(measurements) || !Array.isArray(aliases) || measurements.length === 0) return badRequest('nessuna misurazione da importare')

  const workspaceId = data.auth.workspaceId
  const { results } = await env.DB.prepare('SELECT id FROM players WHERE workspace_id = ?').bind(workspaceId).all()
  const playerIds = new Set((results as { id: string }[]).map((r) => r.id))
  const seen = new Set<string>()
  for (const m of measurements) {
    if (!m?.playerId || !ISO_DATE.test(m.date ?? '')) return badRequest('misurazione non valida')
    if (!playerIds.has(m.playerId)) return badRequest(`giocatore sconosciuto: ${m.playerId}`)
    const key = `${m.playerId}:${m.date}`
    if (seen.has(key)) return badRequest('lo stesso giocatore compare due volte nella stessa data')
    seen.add(key)
    for (const field of Object.keys(BODY_VALUE_RANGES) as (keyof typeof BODY_VALUE_RANGES)[]) {
      if (m[field] !== undefined && m[field] !== null && !inRange(m[field], BODY_VALUE_RANGES[field])) {
        return badRequest(`valore fuori intervallo (${field}) per ${m.playerId}`)
      }
    }
  }
  for (const a of aliases) {
    if (!a?.aliasKey || !playerIds.has(a.playerId)) return badRequest('abbinamento non valido')
  }

  await ensureJumpTestTables(env) // creates player_aliases if missing
  await ensureBodyMeasurementTable(env)
  const now = new Date().toISOString()
  const measurementStmt = env.DB.prepare(UPSERT_MEASUREMENT_SQL)
  const aliasStmt = env.DB.prepare(UPSERT_ALIAS_SQL)
  const playerStmt = env.DB.prepare(UPDATE_PLAYER_SQL)

  const playerUpdates = body.updatePlayers
    ? measurements.flatMap((m) => {
        const height = m.anthropometry?.heightCm
        const weight = m.anthropometry?.weightKg
        const h = inRange(height, HEIGHT_RANGE) ? height! : null
        const w = inRange(weight, WEIGHT_RANGE) ? weight! : null
        if (h === null && w === null) return []
        return [playerStmt.bind(h, w, now, workspaceId, m.playerId, workspaceId, m.playerId, m.date)]
      })
    : []

  const statements = [
    ...aliases.map((a) => aliasStmt.bind(workspaceId, a.aliasKey, a.playerId, now)),
    ...measurements.map((m) =>
      measurementStmt.bind(
        workspaceId,
        m.playerId,
        m.date,
        m.fatMassPct ?? null,
        m.skinfoldMm ?? null,
        m.muscleMassKg ?? null,
        now,
        m.anthropometry ? JSON.stringify(m.anthropometry) : null,
      ),
    ),
    ...playerUpdates,
  ]
  for (let i = 0; i < statements.length; i += BATCH_SIZE) await env.DB.batch(statements.slice(i, i + BATCH_SIZE))

  return json({ measurements: measurements.length, aliases: aliases.length }, { status: 201 })
}
