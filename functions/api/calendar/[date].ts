import type { AppData } from '../../_lib/auth'
import { ISO_DATE, ensureCalendarTable } from '../../_lib/calendar'
import { badRequest, json } from '../../_lib/json'
import type { Env } from '../../_lib/mappers'
import { MATCH_LOCATION_LABEL, TRAINING_TYPE_LABEL, type PlannedDay } from '../../../src/types/domain'

const KINDS = new Set<PlannedDay['kind']>(['training', 'match', 'day_off'])

/** Sets (or replaces) the plan for one day. Viewers are already refused non-GET calls by _middleware.ts. */
export const onRequestPut: PagesFunction<Env, string, AppData> = async ({ request, env, params, data }) => {
  const date = params.date as string
  if (!ISO_DATE.test(date)) return badRequest('data non valida')

  const body = (await request.json()) as Partial<PlannedDay>
  if (!body?.kind || !KINDS.has(body.kind)) return badRequest('kind deve essere training, match o day_off')
  const trainingType = body.kind === 'training' ? (body.trainingType ?? null) : null
  if (trainingType && !(trainingType in TRAINING_TYPE_LABEL)) return badRequest('tipo di allenamento non valido')
  const matchLocation = body.kind === 'match' ? (body.matchLocation ?? null) : null
  if (matchLocation && !(matchLocation in MATCH_LOCATION_LABEL)) return badRequest('luogo della partita non valido')
  const opponentName = body.kind === 'match' ? body.opponentName?.trim().slice(0, 80) || null : null

  const planned: PlannedDay = {
    date,
    kind: body.kind,
    trainingType: trainingType ?? undefined,
    opponentName: opponentName ?? undefined,
    matchLocation: matchLocation ?? undefined,
    updatedAt: new Date().toISOString(),
  }

  await ensureCalendarTable(env)
  await env.DB.prepare(
    `INSERT INTO calendar_days (workspace_id, date, kind, training_type, opponent_name, match_location, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, date) DO UPDATE SET
       kind = excluded.kind, training_type = excluded.training_type, opponent_name = excluded.opponent_name,
       match_location = excluded.match_location, updated_at = excluded.updated_at`,
  )
    .bind(data.auth.workspaceId, date, planned.kind, trainingType, opponentName, matchLocation, planned.updatedAt)
    .run()
  return json(planned)
}

/** Clears the plan for one day. */
export const onRequestDelete: PagesFunction<Env, string, AppData> = async ({ env, params, data }) => {
  const date = params.date as string
  if (!ISO_DATE.test(date)) return badRequest('data non valida')
  await ensureCalendarTable(env)
  await env.DB.prepare('DELETE FROM calendar_days WHERE workspace_id = ? AND date = ?').bind(data.auth.workspaceId, date).run()
  return json({ date })
}
