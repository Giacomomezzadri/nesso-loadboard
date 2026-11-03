import type { JumpTest } from '../../types/domain'

/** A headline jump metric — `column` is the export's trimmed header, as stored in JumpTest.metrics. */
export interface JumpMetricDef {
  column: string
  label: string
  unit: string
  decimals: number
  higherIsBetter: boolean
}

export interface JumpAsymmetryDef {
  column: string
  label: string
}

export interface JumpTestDef {
  testType: string
  label: string
  metrics: JumpMetricDef[]
  asymmetries: JumpAsymmetryDef[]
  /** The metric charted over time on the player profile. */
  trendColumn: string
}

const JUMP_HEIGHT = 'Jump Height (Imp-Mom) [cm]'

/** The tests and metrics shown on Player Profile and in the Leaderboard; every other column stays stored. */
export const JUMP_TESTS: JumpTestDef[] = [
  {
    testType: 'CMJ',
    label: 'CMJ',
    metrics: [
      { column: JUMP_HEIGHT, label: 'Altezza salto', unit: 'cm', decimals: 1, higherIsBetter: true },
      { column: 'RSI-modified [m/s]', label: 'RSI-mod', unit: 'm/s', decimals: 2, higherIsBetter: true },
      { column: 'Peak Power / BM [W/kg]', label: 'Potenza / BM', unit: 'W/kg', decimals: 1, higherIsBetter: true },
      { column: 'Concentric Peak Force [N]', label: 'Picco forza conc.', unit: 'N', decimals: 0, higherIsBetter: true },
    ],
    asymmetries: [
      { column: 'Concentric Peak Force % (Asym) (%)', label: 'Picco forza concentrica' },
      { column: 'Concentric Impulse % (Asym) (%)', label: 'Impulso concentrico' },
      { column: 'Eccentric Peak Force % (Asym) (%)', label: 'Picco forza eccentrica' },
    ],
    trendColumn: JUMP_HEIGHT,
  },
  {
    testType: 'DJ',
    label: 'Drop Jump',
    metrics: [
      { column: JUMP_HEIGHT, label: 'Altezza salto', unit: 'cm', decimals: 1, higherIsBetter: true },
      { column: 'RSI (Flight Time/Contact Time)', label: 'RSI', unit: '', decimals: 2, higherIsBetter: true },
      { column: 'Contact Time [s]', label: 'Tempo di contatto', unit: 's', decimals: 3, higherIsBetter: false },
      { column: 'Peak Power / BM [W/kg]', label: 'Potenza / BM', unit: 'W/kg', decimals: 1, higherIsBetter: true },
    ],
    asymmetries: [
      { column: 'Active Stiffness % (Asym) (%)', label: 'Rigidità attiva' },
      { column: 'Eccentric Impulse % (Asym) (%)', label: 'Impulso eccentrico' },
    ],
    trendColumn: JUMP_HEIGHT,
  },
]

/** Fixed asymmetry thresholds: from 15% orange, from 20% red. */
export const ASYMMETRY_WARNING_PCT = 15
export const ASYMMETRY_CRITICAL_PCT = 20
export type AsymmetryLevel = 'ok' | 'warning' | 'critical'

export function asymmetryLevel(pct: number): AsymmetryLevel {
  if (pct >= ASYMMETRY_CRITICAL_PCT) return 'critical'
  if (pct >= ASYMMETRY_WARNING_PCT) return 'warning'
  return 'ok'
}

function chronological(a: JumpTest, b: JumpTest): number {
  return a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
}

/** One player's tests of one type, oldest first. */
export function playerTestsOfType(tests: JumpTest[], playerId: string, testType: string): JumpTest[] {
  return tests.filter((t) => t.playerId === playerId && t.testType === testType).sort(chronological)
}

/** Each player's most recent test of `testType` — what the Leaderboard and team medians use. */
export function latestTestByPlayer(tests: JumpTest[], testType: string): Map<string, JumpTest> {
  const latest = new Map<string, JumpTest>()
  for (const t of tests) {
    if (t.testType !== testType) continue
    const current = latest.get(t.playerId)
    if (!current || chronological(current, t) < 0) latest.set(t.playerId, t)
  }
  return latest
}
