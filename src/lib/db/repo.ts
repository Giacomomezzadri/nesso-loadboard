import type { AppSettings, DrillSegment, PlannedDay, Player, RpeEntry, Session } from '../../types/domain'

const DEFAULT_TIMEOUT_MS = 25000

/** Every API call gets a hard ceiling — a stuck fetch (dead connection, a Worker/D1 call that never resolves) must surface as an error, never hang the caller's "saving" state forever. */
async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`)
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`${init?.method ?? 'GET'} ${path} non ha risposto entro ${timeoutMs / 1000}s — riprova.`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ---------- sessions ----------

export async function listSessions(): Promise<Session[]> {
  return apiFetch<Session[]>('/api/sessions')
}

export async function putSession(session: Session): Promise<void> {
  await apiFetch('/api/sessions', { method: 'POST', body: JSON.stringify(session) })
}

/** Deletes a session and cascades to its segments and RPE entries. */
export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

// ---------- players ----------

export async function listPlayers(): Promise<Player[]> {
  return apiFetch<Player[]>('/api/players')
}

export async function putPlayer(player: Player): Promise<void> {
  await apiFetch(`/api/players/${player.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      position: player.position,
      active: player.active,
      heightCm: player.heightCm,
      weightKg: player.weightKg,
      personalMaxSpeedKmh: player.personalMaxSpeedKmh,
      pbConfirmed: player.pbConfirmed,
      sprint10mSec: player.sprint10mSec,
      sprint30mSec: player.sprint30mSec,
    }),
  })
}

/** Find-or-create a player by display name, returning the (possibly new) player. */
export async function upsertPlayerByName(displayName: string): Promise<Player> {
  return apiFetch<Player>('/api/players/upsert', { method: 'POST', body: JSON.stringify({ displayName }) })
}

// ---------- segments ----------

export async function listSegmentsBySession(sessionId: string): Promise<DrillSegment[]> {
  return apiFetch<DrillSegment[]>(`/api/segments?sessionId=${encodeURIComponent(sessionId)}`)
}

export async function listSegmentsByPlayer(playerId: string): Promise<DrillSegment[]> {
  return apiFetch<DrillSegment[]>(`/api/segments?playerId=${encodeURIComponent(playerId)}`)
}

export async function listAllSegments(): Promise<DrillSegment[]> {
  return apiFetch<DrillSegment[]>('/api/segments')
}

export async function putSegments(segments: DrillSegment[]): Promise<void> {
  if (segments.length === 0) return
  await apiFetch('/api/segments/bulk', { method: 'POST', body: JSON.stringify(segments) })
}

// ---------- rpe ----------

export async function listRpeBySession(sessionId: string): Promise<RpeEntry[]> {
  return apiFetch<RpeEntry[]>(`/api/rpe?sessionId=${encodeURIComponent(sessionId)}`)
}

export async function listAllRpe(): Promise<RpeEntry[]> {
  return apiFetch<RpeEntry[]>('/api/rpe')
}

export async function putRpeEntries(entries: RpeEntry[]): Promise<void> {
  if (entries.length === 0) return
  await apiFetch('/api/rpe/bulk', { method: 'POST', body: JSON.stringify(entries) })
}

// ---------- settings ----------

export async function getSettings(): Promise<AppSettings> {
  return apiFetch<AppSettings>('/api/settings')
}

export async function putSettings(settings: AppSettings): Promise<void> {
  await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

// ---------- planning calendar ----------

export async function listPlannedDays(from: string, to: string): Promise<PlannedDay[]> {
  return apiFetch<PlannedDay[]>(`/api/calendar?from=${from}&to=${to}`)
}

export async function putPlannedDay(day: Omit<PlannedDay, 'updatedAt'>): Promise<PlannedDay> {
  return apiFetch<PlannedDay>(`/api/calendar/${day.date}`, { method: 'PUT', body: JSON.stringify(day) })
}

export async function deletePlannedDay(date: string): Promise<void> {
  await apiFetch(`/api/calendar/${date}`, { method: 'DELETE' })
}

// ---------- auth ----------

export type Role = 'viewer' | 'editor' | 'admin'

export interface CurrentUser {
  id: string
  email: string
  role: Role
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/api/auth/me')
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
}

// ---------- admin ----------

export interface AdminUser {
  id: string
  email: string
  role: Role
  workspaceOwnerId: string | null
  active: boolean
  createdAt: string
  lastLoginAt: string | null
}

export async function adminListUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/api/admin/users')
}

export async function adminCreateUser(input: {
  email: string
  password: string
  role: Role
  workspaceOwnerId?: string | null
}): Promise<AdminUser> {
  return apiFetch<AdminUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) })
}

export async function adminUpdateUser(
  id: string,
  patch: { role?: Role; active?: boolean; newPassword?: string; workspaceOwnerId?: string | null },
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export interface LoginAuditEntry {
  id: string
  userId: string | null
  email: string
  success: boolean
  userAgent: string | null
  createdAt: string
}

export async function adminListLoginAudit(userId?: string): Promise<LoginAuditEntry[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : ''
  return apiFetch<LoginAuditEntry[]>(`/api/admin/login-audit${qs}`)
}

// ---------- player links (cross-workspace, same player) ----------

export type PlayerLinkStatus = 'pending' | 'accepted' | 'rejected'

export interface PlayerLink {
  id: string
  status: PlayerLinkStatus
  /** True if this workspace proposed it — only the other side can accept/reject; either side can delete. */
  proposedByMe: boolean
  myPlayerId: string
  myPlayerName: string
  otherEditorEmail: string
  otherPlayerName: string
  createdAt: string
  updatedAt: string
}

export async function listPlayerLinks(): Promise<PlayerLink[]> {
  return apiFetch<PlayerLink[]>('/api/player-links')
}

export async function proposePlayerLink(input: {
  myPlayerId: string
  targetEditorEmail: string
  targetPlayerName: string
}): Promise<PlayerLink> {
  return apiFetch<PlayerLink>('/api/player-links', { method: 'POST', body: JSON.stringify(input) })
}

export async function respondToPlayerLink(id: string, status: 'accepted' | 'rejected'): Promise<void> {
  await apiFetch(`/api/player-links/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

export async function deletePlayerLink(id: string): Promise<void> {
  await apiFetch(`/api/player-links/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface LinkedPlayerData {
  myPlayerId: string
  otherPlayerName: string
  sessions: Session[]
  segments: DrillSegment[]
}

/** For every accepted link, the other side's sessions (stripped down) and this player's segments from there, re-tagged to this workspace's player id. */
export async function listLinkedPlayerData(): Promise<LinkedPlayerData[]> {
  return apiFetch<LinkedPlayerData[]>('/api/player-links/linked-data')
}
