import type { AppData } from '../_lib/auth'
import { json } from '../_lib/json'
import type { Env } from '../_lib/mappers'
import { ensurePlayerStatusTable, rowToPlayerStatus } from '../_lib/playerStatuses'

/** Every editor-set player situation in this workspace — one small row per absent player per session. */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensurePlayerStatusTable(env)
  const { results } = await env.DB.prepare('SELECT * FROM player_statuses WHERE workspace_id = ?')
    .bind(data.auth.workspaceId)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToPlayerStatus))
}
