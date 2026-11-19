import type { AppData } from '../../_lib/auth'
import { badRequest, json } from '../../_lib/json'
import { type Env, playerToRow, rowToPlayer } from '../../_lib/mappers'
import { ensureColumns } from '../../_lib/schema'
import type { Player } from '../../../src/types/domain'

function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export const onRequestPost: PagesFunction<Env, string, AppData> = async ({ request, env, data }) => {
  const body = (await request.json()) as { displayName?: string }
  const displayName = body?.displayName?.trim()
  if (!displayName) return badRequest('displayName is required')

  await ensureColumns(env, 'players', [{ name: 'workspace_id', type: 'TEXT' }])

  const workspaceId = data.auth.workspaceId as string
  // A name with no latin letters or digits would slug to '' and collide with every other such name.
  if (!slugifyName(displayName)) return badRequest('il nome deve contenere almeno una lettera o una cifra')
  // Prefixed with the workspace so two different Editors' rosters can't collide on the same slug
  // (e.g. two different "Mario Rossi") — ids are opaque to the rest of the app either way.
  const id = `${workspaceId}:${slugifyName(displayName)}`
  const now = new Date().toISOString()
  const existing = await env.DB.prepare('SELECT * FROM players WHERE id = ? AND workspace_id = ?')
    .bind(id, workspaceId)
    .first<Record<string, unknown>>()

  if (existing) {
    if (existing.display_name !== displayName) {
      const updated: Player = { ...rowToPlayer(existing), displayName, updatedAt: now }
      await env.DB.prepare('UPDATE players SET display_name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
        .bind(displayName, now, id, workspaceId)
        .run()
      return json(updated)
    }
    return json(rowToPlayer(existing))
  }

  const created: Player = {
    id,
    displayName,
    position: 'UNSPECIFIED',
    pbConfirmed: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  const row = playerToRow(created)
  await env.DB.prepare(
    `INSERT INTO players (id, workspace_id, display_name, position, personal_max_speed_kmh, pb_confirmed, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(row[0], workspaceId, ...row.slice(1))
    .run()

  return json(created, { status: 201 })
}
