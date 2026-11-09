import type { AppData } from '../_lib/auth'
import { ensureBodyMeasurementTable, rowToBodyMeasurement } from '../_lib/bodyMeasurements'
import { ISO_DATE } from '../_lib/calendar'
import { badRequest, json, notFound } from '../_lib/json'
import type { Env } from '../_lib/mappers'
import type { BodyMeasurement } from '../../src/types/domain'

/** Plausible ranges — anything outside is a typo, not a measurement. */
const RANGES = {
  fatMassPct: [1, 60],
  skinfoldMm: [5, 400],
  muscleMassKg: [10, 150],
} as const

/** Every measurement in this workspace (a few per player per season). */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureBodyMeasurementTable(env)
  const { results } = await env.DB.prepare('SELECT * FROM body_measurements WHERE workspace_id = ? ORDER BY date')
    .bind(data.auth.workspaceId)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToBodyMeasurement))
}

/** Saves (or replaces) one player's measurement on one date. Viewers are refused non-GET calls by _middleware.ts. */
export const onRequestPut: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as Partial<BodyMeasurement>
  if (!body?.playerId || !ISO_DATE.test(body.date ?? '')) return badRequest('giocatore o data non validi')

  const values: Record<keyof typeof RANGES, number | null> = { fatMassPct: null, skinfoldMm: null, muscleMassKg: null }
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const v = body[key]
    if (v === undefined || v === null) continue
    const [min, max] = RANGES[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return badRequest(`valore fuori intervallo: ${key}`)
    values[key] = v
  }
  if (Object.values(values).every((v) => v === null)) return badRequest('inserisci almeno un valore')

  const workspaceId = data.auth.workspaceId
  const player = await env.DB.prepare('SELECT id FROM players WHERE id = ? AND workspace_id = ?')
    .bind(body.playerId, workspaceId)
    .first()
  if (!player) return notFound('player not found')

  await ensureBodyMeasurementTable(env)
  const updatedAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO body_measurements (workspace_id, player_id, date, fat_mass_pct, skinfold_mm, muscle_mass_kg, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, player_id, date) DO UPDATE SET
       fat_mass_pct = excluded.fat_mass_pct, skinfold_mm = excluded.skinfold_mm,
       muscle_mass_kg = excluded.muscle_mass_kg, updated_at = excluded.updated_at`,
  )
    .bind(workspaceId, body.playerId, body.date, values.fatMassPct, values.skinfoldMm, values.muscleMassKg, updatedAt)
    .run()

  const saved: BodyMeasurement = {
    playerId: body.playerId,
    date: body.date!,
    fatMassPct: values.fatMassPct ?? undefined,
    skinfoldMm: values.skinfoldMm ?? undefined,
    muscleMassKg: values.muscleMassKg ?? undefined,
    updatedAt,
  }
  return json(saved)
}

/** Removes one measurement: ?playerId=…&date=YYYY-MM-DD. */
export const onRequestDelete: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const url = new URL(request.url)
  const playerId = url.searchParams.get('playerId')
  const date = url.searchParams.get('date')
  if (!playerId || !date || !ISO_DATE.test(date)) return badRequest('giocatore o data non validi')
  await ensureBodyMeasurementTable(env)
  await env.DB.prepare('DELETE FROM body_measurements WHERE workspace_id = ? AND player_id = ? AND date = ?')
    .bind(data.auth.workspaceId, playerId, date)
    .run()
  return json({ playerId, date })
}
