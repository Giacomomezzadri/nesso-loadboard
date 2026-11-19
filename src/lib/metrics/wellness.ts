import type { WellnessEntry, WellnessItemKey } from '../../types/domain'

/**
 * Morning wellness questionnaire (Hooper-style). Shared by the public form the athletes fill
 * in (functions/_lib/wellness.ts renders it) and by the staff pages, so the questions and the
 * meaning of each score can never drift apart.
 *
 * Every item is 1–5 and 5 is always the GOOD end — the questions that are naturally "bad when
 * high" (stress, fatigue, soreness) are worded so the athlete picks the good answer on the
 * right. The total therefore runs 5–25, higher = better.
 */
export interface WellnessItemDef {
  key: WellnessItemKey
  label: string
  question: string
  /** Answer text for 1…5. */
  answers: [string, string, string, string, string]
}

export const WELLNESS_ITEMS: WellnessItemDef[] = [
  { key: 'sleep', label: 'Sonno', question: 'Come hai dormito stanotte?', answers: ['Malissimo', 'Male', 'Normale', 'Bene', 'Benissimo'] },
  { key: 'stress', label: 'Stress', question: 'Quanto ti senti stressato?', answers: ['Moltissimo', 'Molto', 'Normale', 'Poco', 'Per niente'] },
  { key: 'fatigue', label: 'Fatica', question: 'Quanto ti senti stanco?', answers: ['Esausto', 'Molto stanco', 'Normale', 'Riposato', 'Freschissimo'] },
  { key: 'soreness', label: 'Dolore', question: 'Hai dolori muscolari?', answers: ['Molto forti', 'Forti', 'Normali', 'Lievi', 'Nessuno'] },
  { key: 'mood', label: 'Umore', question: 'Come è il tuo umore?', answers: ['Pessimo', 'Giù', 'Normale', 'Buono', 'Ottimo'] },
]

/** Faces for 1…5 — same row for every item, since 5 is always the good end. */
export const WELLNESS_FACES = ['😫', '😟', '😐', '🙂', '😄'] as const

export const WELLNESS_MIN = 1
export const WELLNESS_MAX = 5
export const WELLNESS_NOTE_MAX = 500

export const SLEEP_HOURS_MAX = 16
/** Hours slept below these are yellow / red, whatever the athlete's habits. */
export const SLEEP_HOURS_WARNING = 6
export const SLEEP_HOURS_CRITICAL = 5

export function isValidSleepHours(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= SLEEP_HOURS_MAX
}

export function sleepHoursLevel(hours: number | undefined): WellnessLevel {
  if (hours === undefined) return 'ok'
  if (hours < SLEEP_HOURS_CRITICAL) return 'critical'
  if (hours < SLEEP_HOURS_WARNING) return 'warning'
  return 'ok'
}

/** Days of the athlete's own history a day is compared against. */
export const BASELINE_DAYS = 28
/** Fewer answers than this in the window → no personal baseline yet, only absolute thresholds. */
export const MIN_BASELINE_ENTRIES = 5
/** SD floors, so an athlete who always answers "4" doesn't flag a red on a single "3". */
const ITEM_SD_FLOOR = 0.5
const TOTAL_SD_FLOOR = 1.5

export type WellnessLevel = 'ok' | 'warning' | 'critical'

export function wellnessTotal(e: Pick<WellnessEntry, WellnessItemKey>): number {
  return e.sleep + e.stress + e.fatigue + e.soreness + e.mood
}

export function isValidWellnessScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= WELLNESS_MIN && v <= WELLNESS_MAX
}

/** "YYYY-MM-DD" shifted by n days (calendar arithmetic, timezone-free). */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Today's date in Italy — the day an athlete's "this morning" belongs to. */
export function romeTodayIso(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

interface Stats {
  mean: number
  sd: number
}

function stats(values: number[]): Stats {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return { mean, sd: Math.sqrt(variance) }
}

export interface WellnessBaseline {
  entries: number
  items: Record<WellnessItemKey, Stats>
  total: Stats
}

/** The player's own answers in the BASELINE_DAYS before `date` (the day itself excluded). */
export function personalBaseline(all: WellnessEntry[], playerId: string, date: string): WellnessBaseline | null {
  const from = addDaysIso(date, -BASELINE_DAYS)
  const window = all.filter((e) => e.playerId === playerId && e.date >= from && e.date < date)
  if (window.length < MIN_BASELINE_ENTRIES) return null
  const items = {} as Record<WellnessItemKey, Stats>
  for (const def of WELLNESS_ITEMS) items[def.key] = stats(window.map((e) => e[def.key]))
  return { entries: window.length, items, total: stats(window.map(wellnessTotal)) }
}

const LEVEL_RANK: Record<WellnessLevel, number> = { ok: 0, warning: 1, critical: 2 }
const worst = (a: WellnessLevel, b: WellnessLevel) => (LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b)

function zLevel(z: number): WellnessLevel {
  if (z <= -2) return 'critical'
  if (z <= -1) return 'warning'
  return 'ok'
}

export interface ItemAssessment {
  value: number
  level: WellnessLevel
  /** value − personal mean; undefined without a baseline. */
  delta?: number
}

export interface WellnessAssessment {
  entry: WellnessEntry
  baseline: WellnessBaseline | null
  items: Record<WellnessItemKey, ItemAssessment>
  total: ItemAssessment
  /** Hours slept, judged on absolute thresholds only. */
  sleepHours?: { value: number; level: WellnessLevel }
  /** Worst of the items, the total and the hours slept. */
  level: WellnessLevel
}

/**
 * Colours a day's answers. Two rules, the worse one wins:
 *  - absolute: a 1 is always red, a 2 always yellow (whatever the athlete's habits);
 *  - personal: ≥1 SD below the athlete's own 28-day mean is yellow, ≥2 SD red — so a 3 from
 *    someone who always answers 5 still stands out. Needs MIN_BASELINE_ENTRIES answers.
 */
export function assessWellness(entry: WellnessEntry, all: WellnessEntry[]): WellnessAssessment {
  const baseline = personalBaseline(all, entry.playerId, entry.date)
  const items = {} as Record<WellnessItemKey, ItemAssessment>
  let level: WellnessLevel = 'ok'
  for (const def of WELLNESS_ITEMS) {
    const value = entry[def.key]
    let itemLevel: WellnessLevel = value <= 1 ? 'critical' : value <= 2 ? 'warning' : 'ok'
    let delta: number | undefined
    if (baseline) {
      const s = baseline.items[def.key]
      delta = value - s.mean
      itemLevel = worst(itemLevel, zLevel(delta / Math.max(s.sd, ITEM_SD_FLOOR)))
    }
    items[def.key] = { value, level: itemLevel, delta }
    level = worst(level, itemLevel)
  }
  const totalValue = wellnessTotal(entry)
  let total: ItemAssessment = { value: totalValue, level: 'ok' }
  if (baseline) {
    const delta = totalValue - baseline.total.mean
    total = { value: totalValue, delta, level: zLevel(delta / Math.max(baseline.total.sd, TOTAL_SD_FLOOR)) }
  }
  level = worst(level, total.level)
  const sleepHours = entry.sleepHours === undefined ? undefined : { value: entry.sleepHours, level: sleepHoursLevel(entry.sleepHours) }
  if (sleepHours) level = worst(level, sleepHours.level)
  return { entry, baseline, items, total, sleepHours, level }
}
