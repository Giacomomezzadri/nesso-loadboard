import type { DrillSegment, MatchLocation, MatchResult, Player, PlayerSessionStatus, ReassignmentAudit, RpeEntry, Session, SessionType, TrainingType } from '../../types/domain'
import { listPlayers, putPlayer, putPlayerStatuses, putRpeEntries, putSegments, putSession } from '../db/repo'
import { evaluatePlayerPb } from '../metrics/pb'
import { parseSessionCsv } from './parseSessionCsv'
import { reconcileRows } from './reconcile'
import { buildSegmentsForSession } from './segmentBuilder'

/** RPE entries from a {playerId: rpe} map — sRPE uses the player's full_session duration when present, else the sum of all their segments in this session. Entries with rpe <= 0 are dropped (never fabricate a zero-effort entry). */
export function buildRpeEntries(
  sessionId: string,
  segments: DrillSegment[],
  rpeByPlayerId: Record<string, number>,
): RpeEntry[] {
  const now = new Date().toISOString()
  const fullSessionDurationByPlayer = new Map<string, number>()
  for (const seg of segments) {
    if (seg.segmentKind === 'full_session') {
      fullSessionDurationByPlayer.set(seg.playerId, seg.durationSec)
    }
  }

  return Object.entries(rpeByPlayerId)
    .filter(([, rpe]) => rpe > 0)
    .map(([playerId, rpe]) => {
      const durationSec =
        fullSessionDurationByPlayer.get(playerId) ??
        segments.filter((s) => s.playerId === playerId).reduce((sum, s) => sum + s.durationSec, 0)
      return {
        id: `${sessionId}:${playerId}`,
        sessionId,
        playerId,
        rpe,
        sRpe: rpe * (durationSec / 60),
        enteredAt: now,
      }
    })
}

export interface SessionMetadataInput {
  date: string
  label: string
  type: SessionType
  trainingType?: TrainingType
  matchResult?: MatchResult
  matchLocation?: MatchLocation
  opponentName?: string
}

export interface StagedImport {
  sessionId: string
  metadata: SessionMetadataInput
  sourceFileName: string
  segments: Awaited<ReturnType<typeof buildSegmentsForSession>>['segments']
  warnings: string[]
  rawRowCount: number
  reconciliation: ReassignmentAudit[]
}

/** Parse + reconcile + build segments in-memory, without touching the API yet. */
export async function stageImport(fileText: string, fileName: string, metadata: SessionMetadataInput): Promise<StagedImport> {
  const sessionId = crypto.randomUUID()
  const parsed = parseSessionCsv(fileText)
  const { rows, audits } = reconcileRows(parsed.rows)
  const { segments, warnings } = await buildSegmentsForSession(sessionId, rows, metadata.type)

  const reconciliationWarnings = audits.map((a) => a.reason)

  return {
    sessionId,
    metadata,
    sourceFileName: fileName,
    segments,
    warnings: [...parsed.globalWarnings, ...reconciliationWarnings, ...warnings],
    rawRowCount: parsed.rowCount,
    reconciliation: audits,
  }
}

/** Persist a staged import (and any RPE entered for it), then reconcile PB references. */
export async function commitImport(
  staged: StagedImport,
  rpeByPlayerId: Record<string, number>,
  /** The editor's choice for each active roster player missing from the export. */
  missingPlayerStatuses: { playerId: string; status: PlayerSessionStatus }[] = [],
): Promise<Session> {
  const now = new Date().toISOString()
  const session: Session = {
    id: staged.sessionId,
    date: staged.metadata.date,
    label: staged.metadata.label,
    type: staged.metadata.type,
    trainingType: staged.metadata.type === 'training' ? staged.metadata.trainingType : undefined,
    matchResult: staged.metadata.type === 'match' ? staged.metadata.matchResult : undefined,
    matchLocation: staged.metadata.type === 'match' ? staged.metadata.matchLocation : undefined,
    opponentName: staged.metadata.type === 'match' ? staged.metadata.opponentName : undefined,
    importedAt: now,
    sourceFileName: staged.sourceFileName,
    rawRowCount: staged.rawRowCount,
    warningCount: staged.warnings.length,
    reconciliation: staged.reconciliation.length > 0 ? staged.reconciliation : undefined,
  }

  await putSession(session)
  await putSegments(staged.segments)
  if (missingPlayerStatuses.length > 0) await putPlayerStatuses(session.id, missingPlayerStatuses)

  const rpeEntries = buildRpeEntries(session.id, staged.segments, rpeByPlayerId)
  if (rpeEntries.length > 0) {
    await putRpeEntries(rpeEntries)
  }

  await updatePersonalBests(staged.segments)

  return session
}

/** Auto-updates a player's recorded max speed when this session beats it — flips pbConfirmed to false so it surfaces on the Data Quality page until a human checks it. */
async function updatePersonalBests(segments: StagedImport['segments']): Promise<void> {
  const maxSpeedByPlayer = new Map<string, number>()
  for (const seg of segments) {
    maxSpeedByPlayer.set(seg.playerId, Math.max(maxSpeedByPlayer.get(seg.playerId) ?? 0, seg.maxSpeedKmh))
  }
  if (maxSpeedByPlayer.size === 0) return

  const players = await listPlayers()
  const playerById = new Map(players.map((p) => [p.id, p]))

  await Promise.all(
    [...maxSpeedByPlayer.entries()].map(async ([playerId, sessionMax]) => {
      const player = playerById.get(playerId)
      if (!player) return
      const evaluation = evaluatePlayerPb(player, sessionMax)
      if (evaluation.status === 'new_record') {
        const updated: Player = { ...player, personalMaxSpeedKmh: sessionMax, pbConfirmed: false }
        await putPlayer(updated)
      }
    }),
  )
}
