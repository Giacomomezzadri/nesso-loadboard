import type { PlayerStatusEntry } from '../../src/types/domain'
import type { Env } from './mappers'

/**
 * Same statement as migrations/0014_player_statuses.sql — run before every player-status
 * query so the feature works even if the migration was never applied by hand (Pages never
 * auto-applies migrations). IF NOT EXISTS makes it a no-op once the table exists.
 */
export async function ensurePlayerStatusTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS player_statuses (
      workspace_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, session_id, player_id)
    )`,
  ).run()
}

export function rowToPlayerStatus(r: Record<string, unknown>): PlayerStatusEntry {
  return {
    sessionId: r.session_id as string,
    playerId: r.player_id as string,
    status: r.status as PlayerStatusEntry['status'],
    updatedAt: r.updated_at as string,
  }
}
