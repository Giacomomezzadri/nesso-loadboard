import type { JumpTest, PlayerAlias } from '../../src/types/domain'
import type { Env } from './mappers'

/**
 * Same statements as migrations/0013_jump_tests.sql, run before every jump-test/alias
 * query so the feature works even if the migration was never applied by hand (Pages
 * never auto-applies migrations). IF NOT EXISTS makes them no-ops once the tables exist.
 */
export async function ensureJumpTestTables(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS jump_tests (
        workspace_id TEXT NOT NULL,
        id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        test_type TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT,
        body_weight_kg REAL,
        reps INTEGER,
        source_name TEXT NOT NULL,
        data TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, id)
      )`,
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_jump_tests_player ON jump_tests(workspace_id, player_id)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS player_aliases (
        workspace_id TEXT NOT NULL,
        alias_key TEXT NOT NULL,
        player_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, alias_key)
      )`,
    ),
  ])
}

export function rowToJumpTest(r: Record<string, unknown>): JumpTest {
  const data = JSON.parse(r.data as string) as Pick<JumpTest, 'metrics' | 'asymmetries'>
  return {
    id: r.id as string,
    playerId: r.player_id as string,
    testType: r.test_type as string,
    date: r.date as string,
    time: (r.time as string | null) ?? undefined,
    bodyWeightKg: (r.body_weight_kg as number | null) ?? undefined,
    reps: (r.reps as number | null) ?? undefined,
    sourceName: r.source_name as string,
    metrics: data.metrics ?? {},
    asymmetries: data.asymmetries ?? {},
    importedAt: r.imported_at as string,
  }
}

export function rowToPlayerAlias(r: Record<string, unknown>): PlayerAlias {
  return { aliasKey: r.alias_key as string, playerId: r.player_id as string }
}
