import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** Stable cross-session join key for a player — normalizes whitespace/case. */
export function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60)
}

export function formatDurationFromSeconds(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.round(totalSec % 60)
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${formatNumber(value, fractionDigits)}%`
}

/** The two figures behind a percentage, e.g. "1.234/2.000 m" — shown next to every % so it can be checked. */
export function formatFraction(numerator: number, denominator: number, unit = '', fractionDigits = 0): string {
  const num = formatNumber(numerator, fractionDigits)
  const den = formatNumber(denominator, fractionDigits)
  if (unit === '′') return `${num}′/${den}′`
  return unit ? `${num}/${den} ${unit}` : `${num}/${den}`
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function isoWeek(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z')
  const target = new Date(d.valueOf())
  const dayNr = (d.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setUTCMonth(0, 1)
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7))
  }
  const week = 1 + Math.round((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
