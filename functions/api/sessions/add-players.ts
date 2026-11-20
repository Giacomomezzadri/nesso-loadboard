import type { AppData } from '../../_lib/auth'
import { badRequest, json, notFound } from '../../_lib/json'
import { type Env, rpeToRow, segmentToRow } from '../../_lib/mappers'
import { ensurePlayerStatusTable } from '../../_lib/playerStatuses'
import { ensureColumns } from '../../_lib/schema'
import { RPE_UPSERT_SQL, SEGMENT_UPSERT_SQL } from '../../_lib/sessionWrites'
import { type DrillSegment, type RpeEntry, TRAINING_TYPE_LABEL } from '../../../src/types/domain'

// D1 caps statements per batch; stay well under it.
const BATCH_SIZE = 100

/**
 * Adds players' GPS data (and RPE) to an existing session instead of creating a second one
 * for the same day — e.g. players who trained with another squad of the club, taken from
 * that squad's export. A player already in the session is replaced: their old segments and
 * RPE there are removed first, never mixed with the new ones.
 *
 * markOtherTeam stores the "Altra squadra" status for the added players. GPS data still
 * makes them Present everywhere (see buildStatusResolver); the status only records where
 * they trained. Without it, any stored status of theirs in this session is cleared.
 *
 * A segment's trainingType records that the player did a different kind of training from the
 * session's own (e.g. Metabolico with the other squad on the team's Forza day).
 *
 * Viewers are refused non-GET calls by _middleware.ts.
 */
export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as { sessionId?: string; segments?: DrillSegment[]; rpe?: RpeEntry[]; markOtherTeam?: boolean }
  const sessionId = body?.sessionId
  const segments = body?.segments ?? []
  const rpe = body?.rpe ?? []
  if (!sessionId || !Array.isArray(segments) || !Array.isArray(rpe) || segments.length === 0) {
    return badRequest('sessione o dati mancanti')
  }

  const workspaceId = data.auth.workspaceId
  const session = await env.DB.prepare('SELECT id FROM sessions WHERE id = ? AND workspace_id = ?').bind(sessionId, workspaceId).first()
  if (!session) return notFound('session not found')

  const { results } = await env.DB.prepare('SELECT id FROM players WHERE workspace_id = ?').bind(workspaceId).all()
  const rosterIds = new Set((results as { id: string }[]).map((r) => r.id))
  const playerIds = new Set(segments.map((s) => s.playerId))
  for (const s of segments) {
    if (s?.sessionId !== sessionId || !s.id?.startsWith(`${sessionId}:`)) return badRequest('segmento non appartenente alla sessione')
    if (!rosterIds.has(s.playerId)) return badRequest(`giocatore sconosciuto: ${s.playerId}`)
    if (s.trainingType != null && !(s.trainingType in TRAINING_TYPE_LABEL)) return badRequest('tipo di allenamento non valido')
  }
  for (const e of rpe) {
    if (e?.sessionId !== sessionId || e.id !== `${sessionId}:${e.playerId}` || !playerIds.has(e.playerId)) return badRequest('RPE non valido')
  }

  await ensureColumns(env, 'segments', [
    { name: 'workspace_id', type: 'TEXT' },
    { name: 'is_rehab', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'training_type', type: 'TEXT' },
  ])
  await ensureColumns(env, 'rpe', [{ name: 'workspace_id', type: 'TEXT' }])
  await ensurePlayerStatusTable(env)

  const now = new Date().toISOString()
  const deleteSegments = env.DB.prepare('DELETE FROM segments WHERE workspace_id = ? AND session_id = ? AND player_id = ?')
  const deleteRpe = env.DB.prepare('DELETE FROM rpe WHERE workspace_id = ? AND session_id = ? AND player_id = ?')
  const deleteStatus = env.DB.prepare('DELETE FROM player_statuses WHERE workspace_id = ? AND session_id = ? AND player_id = ?')
  const upsertStatus = env.DB.prepare(
    `INSERT INTO player_statuses (workspace_id, session_id, player_id, status, updated_at) VALUES (?, ?, ?, 'other_team', ?)
     ON CONFLICT(workspace_id, session_id, player_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  )
  const segmentStmt = env.DB.prepare(SEGMENT_UPSERT_SQL)
  const rpeStmt = env.DB.prepare(RPE_UPSERT_SQL)

  const statements = [
    ...[...playerIds].flatMap((id) => [deleteSegments.bind(workspaceId, sessionId, id), deleteRpe.bind(workspaceId, sessionId, id)]),
    ...segments.map((s) => {
      const row = segmentToRow(s)
      return segmentStmt.bind(row[0], workspaceId, ...row.slice(1))
    }),
    ...rpe.map((e) => {
      const row = rpeToRow(e)
      return rpeStmt.bind(row[0], workspaceId, ...row.slice(1))
    }),
    ...[...playerIds].map((id) => (body.markOtherTeam ? upsertStatus.bind(workspaceId, sessionId, id, now) : deleteStatus.bind(workspaceId, sessionId, id))),
  ]
  for (let i = 0; i < statements.length; i += BATCH_SIZE) await env.DB.batch(statements.slice(i, i + BATCH_SIZE))

  return json({ players: playerIds.size, segments: segments.length, rpe: rpe.length }, { status: 201 })
}
