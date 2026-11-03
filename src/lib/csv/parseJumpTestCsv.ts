import Papa from 'papaparse'
import type { Asymmetry } from '../../types/domain'
import { CsvImportError } from './parseSessionCsv'

/** One export row, before it's matched to a roster player. */
export interface ParsedJumpRow {
  sourceName: string
  testType: string
  date: string // ISO
  time?: string // "HH:MM" 24h
  bodyWeightKg?: number
  reps?: number
  metrics: Record<string, number>
  asymmetries: Record<string, Asymmetry>
}

export interface ParsedJumpFile {
  fileName: string
  rows: ParsedJumpRow[]
  testTypes: string[]
  warnings: string[]
}

// Identity/bookkeeping columns — everything else numeric is a metric.
const NAME = 'Name'
const TEST_TYPE = 'Test Type'
const DATE = 'Date'
const TIME = 'Time'
const BODY_WEIGHT = 'BW [KG]'
const REPS = 'Reps'
const NON_METRIC = new Set([NAME, 'ExternalId', TEST_TYPE, DATE, TIME, BODY_WEIGHT, REPS, 'Tags'])

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseNumber(raw: string | undefined): number | undefined {
  const s = (raw ?? '').trim()
  if (s === '') return undefined
  const value = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''))
  return Number.isFinite(value) ? value : undefined
}

/** "12 R" / "4.9 L" / "0" → { pct, side }. */
function parseAsymmetry(raw: string | undefined): Asymmetry | undefined {
  const m = (raw ?? '').trim().match(/^(-?[\d.,]+)\s*([LR])?$/i)
  if (!m) return undefined
  const pct = parseNumber(m[1])
  if (pct === undefined) return undefined
  return m[2] ? { pct: Math.abs(pct), side: m[2].toUpperCase() as 'L' | 'R' } : { pct: Math.abs(pct) }
}

/** "29/10/2026" (day first, as ForceDecks exports it) → "2026-10-29". */
function parseDate(raw: string | undefined): string | undefined {
  const m = (raw ?? '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const iso = (raw ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/)
  return iso ? iso[0] : undefined
}

/** "3:35 PM" / "15:35" → "15:35". */
function parseTime(raw: string | undefined): string | undefined {
  const m = (raw ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i)
  if (!m) return undefined
  let hours = Number(m[1])
  const meridiem = m[3]?.toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  return `${String(hours).padStart(2, '0')}:${m[2]}`
}

export function isAsymmetryColumn(header: string): boolean {
  return /\(asym\)/i.test(header)
}

/**
 * Parses one ForceDecks test export. The test type comes from each row's "Test Type"
 * column, so CMJ, DJ (or both mixed) go through the same parser; metric columns are
 * whatever the export carries, keyed by their trimmed header.
 */
export async function parseJumpTestCsv(file: File): Promise<ParsedJumpFile> {
  const text = stripBom(await file.text())
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  })
  const headers = result.meta.fields ?? []
  const missing = [NAME, TEST_TYPE, DATE].filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new CsvImportError(
      `${file.name}: non sembra un export di test di salto — mancano le colonne ${missing.map((h) => `"${h}"`).join(', ')}.`,
    )
  }
  const metricHeaders = headers.filter((h) => !NON_METRIC.has(h))

  const warnings: string[] = []
  const rows: ParsedJumpRow[] = []
  result.data.forEach((raw, i) => {
    const sourceName = (raw[NAME] ?? '').trim()
    const testType = (raw[TEST_TYPE] ?? '').trim().toUpperCase()
    const date = parseDate(raw[DATE])
    if (!sourceName || !testType || !date) {
      warnings.push(`Riga ${i + 2}: nome, tipo di test o data mancanti o non leggibili — saltata.`)
      return
    }
    const metrics: Record<string, number> = {}
    const asymmetries: Record<string, Asymmetry> = {}
    for (const h of metricHeaders) {
      if (isAsymmetryColumn(h)) {
        const a = parseAsymmetry(raw[h])
        if (a) asymmetries[h] = a
      } else {
        const v = parseNumber(raw[h])
        if (v !== undefined) metrics[h] = v
      }
    }
    rows.push({
      sourceName,
      testType,
      date,
      time: parseTime(raw[TIME]),
      bodyWeightKg: parseNumber(raw[BODY_WEIGHT]),
      reps: parseNumber(raw[REPS]),
      metrics,
      asymmetries,
    })
  })

  if (rows.length === 0) throw new CsvImportError(`${file.name}: nessuna riga valida trovata.`)
  return { fileName: file.name, rows, testTypes: [...new Set(rows.map((r) => r.testType))], warnings }
}
