import type { AppData } from '../../_lib/auth'
import { badRequest, json, notFound } from '../../_lib/json'
import type { Env } from '../../_lib/mappers'
import { ensurePlayerStatusTable } from '../../_lib/playerStatuses'
import { MISSING_PLAYER_STATUSES, type PlayerSessionStatus, type SessionType } from '../../../src/types/domain'

const INSERT_SQL =
  'INSERT INTO player_statuses (workspace_id, session_id, player_id, status, updated_at) VALUES (?, ?, ?, ?, ?)'
// D1 caps statements per batch; stay well under it.
const BATCH_SIZE = 100

/** Replaces one session's editor-set statuses with the ones given. */
export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as {
    sessionId?: string
    statuses?: { playerId: string; status: PlayerSessionStatus }[]
  }
  const sessionId = body?.sessionId
  const statuses = body?.statuses ?? []
  if (!sessionId || !Array.isArray(statuses)) return badRequest('sessione o stati mancanti')

  const workspaceId = data.auth.workspaceId
  const session = await env.DB.prepare('SELECT type FROM sessions WHERE id = ? AND workspace_id = ?')
    .bind(sessionId, workspaceId)
    .first<{ type: SessionType }>()
  if (!session) return notFound('session not found')

  const allowed = new Set(MISSING_PLAYER_STATUSES[session.type])
  const { results } = await env.DB.prepare('SELECT id FROM players WHERE workspace_id = ?').bind(workspaceId).all()
  const playerIds = new Set((results as { id: string }[]).map((r) => r.id))
  for (const s of statuses) {
    if (!playerIds.has(s?.playerId)) return badRequest(`giocatore sconosciuto: ${s?.playerId}`)
    if (!allowed.has(s.status)) return badRequest(`situazione non valida per questo tipo di sessione: ${s.status}`)
  }

  await ensurePlayerStatusTable(env)
  const now = new Date().toISOString()
  const insert = env.DB.prepare(INSERT_SQL)
  const statements = [
    env.DB.prepare('DELETE FROM player_statuses WHERE workspace_id = ? AND session_id = ?').bind(workspaceId, sessionId),
    ...statuses.map((s) => insert.bind(workspaceId, sessionId, s.playerId, s.status, now)),
  ]
  for (let i = 0; i < statements.length; i += BATCH_SIZE) await env.DB.batch(statements.slice(i, i + BATCH_SIZE))

  return json({ saved: statuses.length }, { status: 201 })
}
