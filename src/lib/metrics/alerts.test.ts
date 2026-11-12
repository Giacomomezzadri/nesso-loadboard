import { describe, expect, it } from 'vitest'
import type { DrillSegment } from '../../types/domain'
import { computeSessionAlerts, type DatedFullSession } from './alerts'
import { DEFAULT_SETTINGS } from './settings'

const PB = 30 // km/h — every test player's confirmed personal max unless stated otherwise
const TODAY = '2026-09-15'

function seg(playerId: string, maxSpeedKmh: number, sessionId = 'today'): DrillSegment {
  return {
    id: `${sessionId}:${playerId}:full-session`,
    sessionId,
    playerId,
    drillTitle: 'Full Session',
    segmentKind: 'full_session',
    durationSec: 5400,
    totalDistanceM: 5000,
    distancePerMin: 55,
    distanceZone4M: 0,
    distanceZone5M: 0,
    distanceZone6M: 0,
    entriesZone5: 0,
    entriesZone6: 0,
    hsrM: 0,
    hsrPerMin: 0,
    maxSpeedKmh,
    pctMaxSpeed: 0,
    accZone3: 0,
    decZone3: 0,
    accZone4: 0,
    decZone4: 0,
    accZone5: 0,
    decZone5: 0,
    accZone6: 0,
    decZone6: 0,
    accPerMin: 0,
    decPerMin: 0,
  }
}

/** A full_session reading for `playerId` at `pct`% of PB on `date`. */
function reading(playerId: string, pct: number, date: string): DatedFullSession {
  return { seg: seg(playerId, (PB * pct) / 100, `s-${date}`), date }
}

function exposureFlags(
  current: DrillSegment[],
  recent: DatedFullSession[],
  opts: { pbs?: Map<string, number>; referenceDate?: string } = {},
) {
  const pbs = opts.pbs ?? new Map(current.map((s) => [s.playerId, PB]))
  const referenceDate = 'referenceDate' in opts ? opts.referenceDate : TODAY
  return computeSessionAlerts(current, [], DEFAULT_SETTINGS, pbs, recent, referenceDate).filter(
    (f) => f.type === 'low-speed-exposure',
  )
}

describe('low-speed-exposure alert', () => {
  it('flags a player whose peak over the last 7 days stayed below 90% of their PB, as serious', () => {
    const flags = exposureFlags([seg('p1', PB * 0.8)], [reading('p1', 85, '2026-09-12'), reading('p1', 80, TODAY)])
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ playerId: 'p1', severity: 'serious' })
    expect(flags[0].message).toContain('picco: 85%')
  })

  it('does not flag a player who went above 90% at least once in the window', () => {
    expect(exposureFlags([seg('p1', PB * 0.7)], [reading('p1', 92, '2026-09-10'), reading('p1', 70, TODAY)])).toEqual([])
  })

  it('treats a peak of exactly 90% as reaching the threshold (no flag)', () => {
    expect(exposureFlags([seg('p1', PB * 0.9)], [reading('p1', 90, TODAY)])).toEqual([])
  })

  it('rounds the reported peak down so it never reads as 90%', () => {
    const flags = exposureFlags([seg('p1', PB * 0.896)], [reading('p1', 89.6, TODAY)])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('picco: 89%')
  })

  it('includes the day 6 days before the reference date (start of the 7-day window)', () => {
    expect(exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 95, '2026-09-09'), reading('p1', 50, TODAY)])).toEqual([])
  })

  it('ignores readings 7 or more days before the reference date', () => {
    const flags = exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 95, '2026-09-08'), reading('p1', 50, TODAY)])
    expect(flags).toHaveLength(1)
  })

  it('ignores readings dated after the reference date (viewing an older session)', () => {
    const flags = exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 95, '2026-09-16'), reading('p1', 50, TODAY)])
    expect(flags).toHaveLength(1)
  })

  it('handles a window that crosses a month boundary', () => {
    const current = [seg('p1', PB * 0.5)]
    const recent = [reading('p1', 95, '2026-09-26'), reading('p1', 50, '2026-10-02')]
    expect(exposureFlags(current, recent, { referenceDate: '2026-10-02' })).toEqual([])
    expect(exposureFlags(current, recent, { referenceDate: '2026-10-03' })).toHaveLength(1)
  })

  it('never flags a player without a confirmed PB', () => {
    expect(exposureFlags([seg('p1', 15)], [reading('p1', 50, TODAY)], { pbs: new Map() })).toEqual([])
  })

  it('never flags a player whose only readings are 0 km/h (missing GPS speed)', () => {
    expect(exposureFlags([seg('p1', 0)], [reading('p1', 0, TODAY)])).toEqual([])
  })

  it('does not count 0 km/h readings as the peak when real readings exist', () => {
    const flags = exposureFlags([seg('p1', 0)], [reading('p1', 0, TODAY), reading('p1', 80, '2026-09-13')])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('picco: 80%')
  })

  it('only flags players present in the current session', () => {
    const flags = exposureFlags([seg('p1', PB * 0.95)], [reading('p1', 95, TODAY), reading('p2', 60, TODAY)], {
      pbs: new Map([
        ['p1', PB],
        ['p2', PB],
      ]),
    })
    expect(flags).toEqual([])
  })

  it('evaluates each player against their own PB', () => {
    const current = [seg('fast', 27), seg('slow', 27)]
    const recent = [
      { seg: seg('fast', 27), date: TODAY }, // 27/32 = 84%
      { seg: seg('slow', 27), date: TODAY }, // 27/29 = 93%
    ]
    const flags = exposureFlags(current, recent, {
      pbs: new Map([
        ['fast', 32],
        ['slow', 29],
      ]),
    })
    expect(flags.map((f) => f.playerId)).toEqual(['fast'])
  })

  it('emits one flag per player even if the session has duplicate full_session rows', () => {
    const flags = exposureFlags([seg('p1', PB * 0.8), seg('p1', PB * 0.7)], [reading('p1', 80, TODAY)])
    expect(flags).toHaveLength(1)
  })

  it('is skipped entirely when no reference date is given', () => {
    expect(exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 50, TODAY)], { referenceDate: undefined })).toEqual([])
  })

  it('is skipped instead of throwing on a malformed reference date', () => {
    expect(() => exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 50, TODAY)], { referenceDate: 'not-a-date' })).not.toThrow()
    expect(exposureFlags([seg('p1', PB * 0.5)], [reading('p1', 50, TODAY)], { referenceDate: 'not-a-date' })).toEqual([])
  })

  it('sorts serious exposure flags ahead of warnings', () => {
    const all = computeSessionAlerts(
      [seg('p1', PB * 0.8)],
      [],
      DEFAULT_SETTINGS,
      new Map([['p1', PB]]),
      [reading('p1', 80, TODAY)],
      TODAY,
    )
    expect(all[0].severity).toBe('serious')
  })
})
