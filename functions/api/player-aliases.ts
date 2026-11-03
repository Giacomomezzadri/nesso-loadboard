import type { AppData } from '../_lib/auth'
import { ensureJumpTestTables, rowToPlayerAlias } from '../_lib/jumpTests'
import { json } from '../_lib/json'
import type { Env } from '../_lib/mappers'

/** Hand-made name→player pairings for this workspace (used to match names in external test exports). */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureJumpTestTables(env)
  const { results } = await env.DB.prepare('SELECT * FROM player_aliases WHERE workspace_id = ?')
    .bind(data.auth.workspaceId)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToPlayerAlias))
}
