import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAllRpe,
  listAllSegments,
  listLinkedPlayerData,
  listPlayerLinks,
  listPlayers,
  listRpeBySession,
  listSegmentsByPlayer,
  listSegmentsBySession,
  listSessions,
  getSettings,
  listJumpTests,
  listPlannedDays,
  listPlayerAliases,
  listPlayerStatuses,
} from '../lib/db/repo'

export const queryKeys = {
  sessions: ['sessions'] as const,
  players: ['players'] as const,
  segmentsBySession: (sessionId: string) => ['segments', 'by-session', sessionId] as const,
  segmentsByPlayer: (playerId: string) => ['segments', 'by-player', playerId] as const,
  allSegments: ['segments', 'all'] as const,
  rpeBySession: (sessionId: string) => ['rpe', 'by-session', sessionId] as const,
  allRpe: ['rpe', 'all'] as const,
  settings: ['settings'] as const,
  playerLinks: ['player-links'] as const,
  linkedPlayerData: ['player-links', 'linked-data'] as const,
  plannedDays: (from: string, to: string) => ['calendar', from, to] as const,
  jumpTests: ['jump-tests'] as const,
  playerAliases: ['player-aliases'] as const,
  playerStatuses: ['player-statuses'] as const,
}

export function useSessionsQuery() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: listSessions })
}

export function usePlayersQuery() {
  return useQuery({ queryKey: queryKeys.players, queryFn: listPlayers })
}

export function useSegmentsBySessionQuery(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.segmentsBySession(sessionId ?? ''),
    queryFn: () => listSegmentsBySession(sessionId as string),
    enabled: !!sessionId,
  })
}

export function useSegmentsByPlayerQuery(playerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.segmentsByPlayer(playerId ?? ''),
    queryFn: () => listSegmentsByPlayer(playerId as string),
    enabled: !!playerId,
  })
}

export function useAllSegmentsQuery() {
  return useQuery({ queryKey: queryKeys.allSegments, queryFn: listAllSegments })
}

export function useRpeBySessionQuery(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rpeBySession(sessionId ?? ''),
    queryFn: () => listRpeBySession(sessionId as string),
    enabled: !!sessionId,
  })
}

export function useAllRpeQuery() {
  return useQuery({ queryKey: queryKeys.allRpe, queryFn: listAllRpe })
}

export function useSettingsQuery() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: getSettings })
}

/** Planned calendar days in [from, to] — see PlanningCalendar. */
export function usePlannedDaysQuery(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.plannedDays(from, to),
    queryFn: () => listPlannedDays(from, to),
    placeholderData: keepPreviousData,
  })
}

/** After setting or clearing a planned day — every cached calendar window. */
export function useInvalidatePlannedDays() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['calendar'] })
}

export function useJumpTestsQuery() {
  return useQuery({ queryKey: queryKeys.jumpTests, queryFn: listJumpTests })
}

export function usePlayerAliasesQuery() {
  return useQuery({ queryKey: queryKeys.playerAliases, queryFn: listPlayerAliases })
}

/** After a jump-test import — the tests and any name pairings saved with them. */
export function useInvalidateJumpTests() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.jumpTests })
    queryClient.invalidateQueries({ queryKey: queryKeys.playerAliases })
  }
}

export function usePlayerStatusesQuery() {
  return useQuery({ queryKey: queryKeys.playerStatuses, queryFn: listPlayerStatuses })
}

export function usePlayerLinksQuery() {
  return useQuery({ queryKey: queryKeys.playerLinks, queryFn: listPlayerLinks })
}

/** Merged history (sessions + this player's segments) from every accepted cross-workspace link — see functions/api/player-links/linked-data.ts. */
export function useLinkedPlayerDataQuery() {
  return useQuery({ queryKey: queryKeys.linkedPlayerData, queryFn: listLinkedPlayerData })
}

/** Invalidates everything a session import or delete can affect — segments and RPE included, since both write those tables. Broad on purpose; use a narrower invalidator below for a metadata-only or RPE-only edit, which don't touch segments at all. */
export function useInvalidateAfterImport() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    queryClient.invalidateQueries({ queryKey: queryKeys.players })
    queryClient.invalidateQueries({ queryKey: ['segments'] })
    queryClient.invalidateQueries({ queryKey: ['rpe'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.playerStatuses })
  }
}

/** For a session metadata-only edit (type/trainingType/matchResult/matchLocation) — nothing else changed, so refetching all segments/RPE would just be wasted work. */
export function useInvalidateSessionMetadata() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
}

/** For an RPE-only edit on one session — no session/segment data changed. */
export function useInvalidateRpe() {
  const queryClient = useQueryClient()
  return (sessionId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rpeBySession(sessionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.allRpe })
  }
}

/** After proposing/accepting/rejecting/deleting a player link — both the request list and the merged data it feeds. */
export function useInvalidatePlayerLinks() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.playerLinks })
    queryClient.invalidateQueries({ queryKey: queryKeys.linkedPlayerData })
  }
}
