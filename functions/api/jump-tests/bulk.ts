import type { AppData } from '../../_lib/auth'
import { ensureJumpTestTables } from '../../_lib/jumpTests'
import { badRequest, json } from '../../_lib/json'
import type { Env } from '../../_lib/mappers'
import type { JumpTest, PlayerAlias } from '../../../src/types/domain'

const UPSERT_TEST_SQL = `
  INSERT INTO jump_tests (workspace_id, id, player_id, test_type, date, time, body_weight_kg, reps, source_name, data, imported_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(workspace_id, id) DO UPDATE SET
    player_id = excluded.player_id, test_type = excluded.test_type, date = excluded.date, time = excluded.time,
    body_weight_kg = excluded.body_weight_kg, reps = excluded.reps, source_name = excluded.source_name,
    data = excluded.data, imported_at = excluded.imported_at
`
const UPSERT_ALIAS_SQL = `
  INSERT INTO player_aliases (workspace_id, alias_key, player_id, created_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(workspace_id, alias_key) DO UPDATE SET player_id = excluded.player_id
`
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// D1 caps statements per batch; stay well under it.
const BATCH_SIZE = 100

/** Saves an import: the tests, plus any name→player pairings made by hand during it. */
export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as { tests?: JumpTest[]; aliases?: PlayerAlias[] }
  const tests = body?.tests ?? []
  const aliases = body?.aliases ?? []
  if (!Array.isArray(tests) || !Array.isArray(aliases) || tests.length === 0) return badRequest('nessun test da importare')

  const workspaceId = data.auth.workspaceId
  // Only this workspace's own roster may receive tests or aliases.
  const { results } = await env.DB.prepare('SELECT id FROM players WHERE workspace_id = ?').bind(workspaceId).all()
  const playerIds = new Set((results as { id: string }[]).map((r) => r.id))
  for (const t of tests) {
    if (!t?.id || !t.testType || !ISO_DATE.test(t.date ?? '')) return badRequest('test non valido')
    if (!playerIds.has(t.playerId)) return badRequest(`giocatore sconosciuto: ${t.playerId}`)
  }
  for (const a of aliases) {
    if (!a?.aliasKey || !playerIds.has(a.playerId)) return badRequest('abbinamento non valido')
  }

  await ensureJumpTestTables(env)
  const now = new Date().toISOString()
  const testStmt = env.DB.prepare(UPSERT_TEST_SQL)
  const aliasStmt = env.DB.prepare(UPSERT_ALIAS_SQL)
  const statements = [
    ...aliases.map((a) => aliasStmt.bind(workspaceId, a.aliasKey, a.playerId, now)),
    ...tests.map((t) =>
      testStmt.bind(
        workspaceId,
        t.id,
        t.playerId,
        t.testType,
        t.date,
        t.time ?? null,
        t.bodyWeightKg ?? null,
        t.reps ?? null,
        t.sourceName,
        JSON.stringify({ metrics: t.metrics ?? {}, asymmetries: t.asymmetries ?? {} }),
        now,
      ),
    ),
  ]
  for (let i = 0; i < statements.length; i += BATCH_SIZE) await env.DB.batch(statements.slice(i, i + BATCH_SIZE))

  return json({ tests: tests.length, aliases: aliases.length }, { status: 201 })
}
