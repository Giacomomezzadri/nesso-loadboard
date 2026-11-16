import type { AppData } from '../../_lib/auth'
import { badRequest, json } from '../../_lib/json'
import { type Env, segmentToRow } from '../../_lib/mappers'
import { ensureColumns } from '../../_lib/schema'
import { SEGMENT_UPSERT_SQL as UPSERT_SQL } from '../../_lib/sessionWrites'
import type { DrillSegment } from '../../../src/types/domain'

export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const segments = (await request.json()) as DrillSegment[]
  if (!Array.isArray(segments) || segments.length === 0) return badRequest('expected a non-empty array of segments')

  await ensureColumns(env, 'segments', [
    { name: 'workspace_id', type: 'TEXT' },
    { name: 'is_rehab', type: 'INTEGER NOT NULL DEFAULT 0' },
  ])

  const workspaceId = data.auth.workspaceId
  const stmt = env.DB.prepare(UPSERT_SQL)
  const batch = segments.map((s) => {
    const row = segmentToRow(s)
    return stmt.bind(row[0], workspaceId, ...row.slice(1))
  })
  await env.DB.batch(batch)

  return json({ inserted: segments.length }, { status: 201 })
}
