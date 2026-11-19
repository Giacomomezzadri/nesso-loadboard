import { randomToken, type AppData } from '../../_lib/auth'
import { json } from '../../_lib/json'
import type { Env } from '../../_lib/mappers'
import { ensureWellnessTables } from '../../_lib/wellness'
import type { WellnessLink } from '../../../src/types/domain'

/**
 * The team's public questionnaire link (/q/<token>). GET reads it (null if none);
 * POST creates it, or replaces the token so the old link stops working; DELETE turns it off.
 * Viewers only reach GET — _middleware.ts refuses their writes.
 */

async function currentLink(env: Env, workspaceId: string | null): Promise<WellnessLink | null> {
  const row = await env.DB.prepare('SELECT token, created_at FROM wellness_links WHERE workspace_id = ?')
    .bind(workspaceId)
    .first<{ token: string; created_at: string }>()
  return row ? { token: row.token, createdAt: row.created_at } : null
}

export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureWellnessTables(env)
  return json(await currentLink(env, data.auth.workspaceId))
}

export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureWellnessTables(env)
  const link: WellnessLink = { token: randomToken(), createdAt: new Date().toISOString() }
  await env.DB.prepare(
    `INSERT INTO wellness_links (workspace_id, token, created_at) VALUES (?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`,
  )
    .bind(data.auth.workspaceId, link.token, link.createdAt)
    .run()
  return json(link, { status: 201 })
}

export const onRequestDelete: PagesFunction<Env, string, AppData> = async ({ env, data }) => {
  await ensureWellnessTables(env)
  await env.DB.prepare('DELETE FROM wellness_links WHERE workspace_id = ?').bind(data.auth.workspaceId).run()
  return json({ ok: true })
}
