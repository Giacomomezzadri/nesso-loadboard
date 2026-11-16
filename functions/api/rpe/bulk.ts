import type { AppData } from '../../_lib/auth'
import { badRequest, json } from '../../_lib/json'
import { type Env, rpeToRow } from '../../_lib/mappers'
import { ensureColumns } from '../../_lib/schema'
import { RPE_UPSERT_SQL as UPSERT_SQL } from '../../_lib/sessionWrites'
import type { RpeEntry } from '../../../src/types/domain'

export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const entries = (await request.json()) as RpeEntry[]
  if (!Array.isArray(entries) || entries.length === 0) return badRequest('expected a non-empty array of rpe entries')

  await ensureColumns(env, 'rpe', [{ name: 'workspace_id', type: 'TEXT' }])

  const workspaceId = data.auth.workspaceId
  const stmt = env.DB.prepare(UPSERT_SQL)
  const batch = entries.map((e) => {
    const row = rpeToRow(e)
    return stmt.bind(row[0], workspaceId, ...row.slice(1))
  })
  await env.DB.batch(batch)

  return json({ inserted: entries.length }, { status: 201 })
}
