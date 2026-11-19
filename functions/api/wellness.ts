import type { AppData } from '../_lib/auth'
import { json } from '../_lib/json'
import type { Env } from '../_lib/mappers'
import { ensureWellnessTables, rowToWellness } from '../_lib/wellness'

/** Every wellness answer of this workspace — one small row per player per day, fine to load whole. */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureWellnessTables(env)
  const { results } = await env.DB.prepare('SELECT * FROM wellness_entries WHERE workspace_id = ? ORDER BY date, player_id')
    .bind(data.auth.workspaceId)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToWellness))
}
