import type { AppSettings, DrillSegment, RpeEntry } from '../../types/domain'
import { mechanicalWorkPerMin, pctOfPersonalBest } from './metricsCatalog'
import { median } from './heatmap'

export type AlertSeverity = 'warning' | 'serious' | 'critical'

export interface AlertFlag {
  playerId: string
  type: 'speed-deficit' | 'high-mech-work' | 'high-volume' | 'high-srpe' | 'low-speed-exposure'
  severity: AlertSeverity
  message: string
}

/** One full_session row plus the date of the session it belongs to — needed to build the rolling speed-exposure window below. */
export interface DatedFullSession {
  seg: DrillSegment
  date: string
}

const SPEED_EXPOSURE_WINDOW_DAYS = 7
const SPEED_EXPOSURE_PCT_THRESHOLD = 90

function isoDateMinusDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Session-relative flags — no multi-week history required. Speed-deficit and
 * low-speed-exposure are both "% of MY OWN historical max" — computed from
 * this app's own confirmed personalMaxSpeedKmh reference (personalMaxByPlayer,
 * confirmed players only), never from the CSV's own %MaxSpeed column: that
 * field is the GPS vendor's internal reference for the player, which can
 * silently drift from ours (unset, stale, or simply wrong on the vendor's
 * side) and has produced nonsense deficits before — see
 * impliedVendorPersonalBestKmh() in pb.ts for the cross-check that catches it.
 * The load flags are relative to THIS session's own team median (same
 * deviation bands as the Drills heatmap), which is useful even on a single
 * imported session but will get more meaningful once real week-over-week
 * history exists.
 *
 * `recentFullSessions` + `referenceDate` are optional: pass every full_session
 * row for these players (any session, any date) plus the date to treat as
 * "today" to also get the low-speed-exposure flag below — omit both to skip it.
 */
export function computeSessionAlerts(
  fullSessionSegs: DrillSegment[],
  rpeEntries: RpeEntry[],
  settings: AppSettings,
  personalMaxByPlayer: Map<string, number>,
  recentFullSessions: DatedFullSession[] = [],
  referenceDate?: string,
): AlertFlag[] {
  const flags: AlertFlag[] = []
  const { maxSpeedDeficitPct, highMechWorkRelative, highVolumeRelative, highSRpeRelative } = settings.alertThresholds

  for (const seg of fullSessionSegs) {
    const pct = pctOfPersonalBest(seg, personalMaxByPlayer.get(seg.playerId))
    if (pct !== null && pct > 0 && pct < maxSpeedDeficitPct) {
      flags.push({
        playerId: seg.playerId,
        type: 'speed-deficit',
        severity: pct < maxSpeedDeficitPct - 15 ? 'serious' : 'warning',
        message: `Velocità massima raggiunta: ${pct.toFixed(0)}% del proprio massimo storico (soglia ${maxSpeedDeficitPct}%).`,
      })
    }
  }

  const mechWorkValues = fullSessionSegs.map((s) => mechanicalWorkPerMin(s, settings))
  const mechWorkMedian = median(mechWorkValues)
  for (const seg of fullSessionSegs) {
    const value = mechanicalWorkPerMin(seg, settings)
    if (mechWorkMedian > 0 && (value - mechWorkMedian) / mechWorkMedian >= highMechWorkRelative) {
      flags.push({
        playerId: seg.playerId,
        type: 'high-mech-work',
        severity: 'warning',
        message: `Mechanical work/min ${value.toFixed(2)} — ${Math.round(((value - mechWorkMedian) / mechWorkMedian) * 100)}% sopra la mediana squadra (${mechWorkMedian.toFixed(2)}).`,
      })
    }
  }

  const volumeValues = fullSessionSegs.map((s) => s.totalDistanceM)
  const volumeMedian = median(volumeValues)
  for (const seg of fullSessionSegs) {
    if (volumeMedian > 0 && (seg.totalDistanceM - volumeMedian) / volumeMedian >= highVolumeRelative) {
      flags.push({
        playerId: seg.playerId,
        type: 'high-volume',
        severity: 'warning',
        message: `Distanza totale ${seg.totalDistanceM.toFixed(0)}m — ${Math.round(((seg.totalDistanceM - volumeMedian) / volumeMedian) * 100)}% sopra la mediana squadra (${volumeMedian.toFixed(0)}m).`,
      })
    }
  }

  if (rpeEntries.length > 0) {
    const sRpeMedian = median(rpeEntries.map((r) => r.sRpe))
    for (const entry of rpeEntries) {
      if (sRpeMedian > 0 && (entry.sRpe - sRpeMedian) / sRpeMedian >= highSRpeRelative) {
        flags.push({
          playerId: entry.playerId,
          type: 'high-srpe',
          severity: 'warning',
          message: `Training Load ${entry.sRpe.toFixed(0)} — ${Math.round(((entry.sRpe - sRpeMedian) / sRpeMedian) * 100)}% sopra la mediana squadra (${sRpeMedian.toFixed(0)}).`,
        })
      }
    }
  }

  if (referenceDate) {
    const windowStart = isoDateMinusDays(referenceDate, SPEED_EXPOSURE_WINDOW_DAYS - 1)
    // Only rows with a real (>0) %-of-own-max reading count — a missing/unconfirmed
    // reference must never be read as "0% exposure" and turned into a fabricated flag.
    const peakPctByPlayer = new Map<string, number>()
    for (const { seg, date } of recentFullSessions) {
      if (date < windowStart || date > referenceDate) continue
      const pct = pctOfPersonalBest(seg, personalMaxByPlayer.get(seg.playerId))
      if (pct === null || pct <= 0) continue
      const peak = peakPctByPlayer.get(seg.playerId) ?? 0
      if (pct > peak) peakPctByPlayer.set(seg.playerId, pct)
    }

    for (const seg of fullSessionSegs) {
      const peak = peakPctByPlayer.get(seg.playerId)
      if (peak !== undefined && peak < SPEED_EXPOSURE_PCT_THRESHOLD) {
        flags.push({
          playerId: seg.playerId,
          type: 'low-speed-exposure',
          severity: 'serious',
          message: `Negli ultimi ${SPEED_EXPOSURE_WINDOW_DAYS} giorni non ha mai superato il ${SPEED_EXPOSURE_PCT_THRESHOLD}% della propria velocità massima (picco: ${peak.toFixed(0)}%).`,
        })
      }
    }
  }

  const severityRank: Record<AlertSeverity, number> = { critical: 0, serious: 1, warning: 2 }
  return flags.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
}
