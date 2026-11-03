import type { PlannedDay } from '../../src/types/domain'
import type { Env } from './mappers'

/**
 * Same statement as migrations/0012_calendar_days.sql — run before every calendar
 * query so the feature works even if nobody applied the migration by hand (Pages
 * never auto-applies migrations; see ensureColumns in schema.ts for the history).
 * IF NOT EXISTS makes it a no-op once the table is real.
 */
export async function ensureCalendarTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS calendar_days (
      workspace_id TEXT NOT NULL,
      date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('training', 'match', 'day_off')),
      training_type TEXT,
      opponent_name TEXT,
      match_location TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, date)
    )`,
  ).run()
}

export function rowToPlannedDay(r: Record<string, unknown>): PlannedDay {
  return {
    date: r.date as string,
    kind: r.kind as PlannedDay['kind'],
    trainingType: (r.training_type as PlannedDay['trainingType'] | null) ?? undefined,
    opponentName: (r.opponent_name as string | null) ?? undefined,
    matchLocation: (r.match_location as PlannedDay['matchLocation'] | null) ?? undefined,
    updatedAt: r.updated_at as string,
  }
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
