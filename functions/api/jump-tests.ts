import type { AppData } from '../_lib/auth'
import { ensureJumpTestTables, rowToJumpTest } from '../_lib/jumpTests'
import { json } from '../_lib/json'
import type { Env } from '../_lib/mappers'

/** Every jump test of this workspace — a few rows per player per test day, small enough to load whole. */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureJumpTestTables(env)
  const { results } = await env.DB.prepare('SELECT * FROM jump_tests WHERE workspace_id = ? ORDER BY date, time')
    .bind(data.auth.workspaceId)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToJumpTest))
}
