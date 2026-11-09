import type { AppData } from '../../_lib/auth'
import { json, notFound } from '../../_lib/json'
import type { Env } from '../../_lib/mappers'
import { ensurePlayerStatusTable } from '../../_lib/playerStatuses'

/** Deletes a session and cascades to its segments, RPE entries and player statuses — D1 has no FK cascade configured. */
export const onRequestDelete: PagesFunction<Env, string, AppData> = async ({ env, params, data }) => {
  const id = params.id as string
  const workspaceId = data.auth.workspaceId

  const existing = await env.DB.prepare('SELECT id FROM sessions WHERE id = ? AND workspace_id = ?')
    .bind(id, workspaceId)
    .first<{ id: string }>()
  if (!existing) return notFound('session not found')

  await ensurePlayerStatusTable(env)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM player_statuses WHERE session_id = ? AND workspace_id = ?').bind(id, workspaceId),
    env.DB.prepare('DELETE FROM segments WHERE session_id = ? AND workspace_id = ?').bind(id, workspaceId),
    env.DB.prepare('DELETE FROM rpe WHERE session_id = ? AND workspace_id = ?').bind(id, workspaceId),
    env.DB.prepare('DELETE FROM sessions WHERE id = ? AND workspace_id = ?').bind(id, workspaceId),
  ])

  return json({ deleted: id })
}
