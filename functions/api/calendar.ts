import type { AppData } from '../_lib/auth'
import { ISO_DATE, ensureCalendarTable, rowToPlannedDay } from '../_lib/calendar'
import { badRequest, json } from '../_lib/json'
import type { Env } from '../_lib/mappers'

/** Planned days for this workspace within [from, to] (inclusive ISO dates). */
export const onRequestGet: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return badRequest('from e to devono essere date YYYY-MM-DD')

  await ensureCalendarTable(env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM calendar_days WHERE workspace_id = ? AND date >= ? AND date <= ? ORDER BY date',
  )
    .bind(data.auth.workspaceId, from, to)
    .all()
  return json((results as Record<string, unknown>[]).map(rowToPlannedDay))
}
