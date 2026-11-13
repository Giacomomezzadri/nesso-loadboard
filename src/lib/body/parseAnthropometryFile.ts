import Papa from 'papaparse'
import { excelSerialToIso, readXlsx } from '../xlsx/readXlsx'
import type { SkinfoldKey } from './anthropometry'

/**
 * Reads an ISAK anthropometric profile sheet (one row per athlete; the team's
 * "ISAK_<squad>_<timepoint>.xlsx" files), as .xlsx or .csv. Columns are found by
 * header name, so their order and any extra columns don't matter.
 *
 * Deliberately ignored: the sheet's own skinfold sums (their formula is wrong and
 * skips decimals typed as text) and the date of assessment (it is =TODAY(), so it
 * changes every time the file is opened) — the sums are recomputed and the date is
 * chosen at import.
 */

export type GirthKey = 'armRelaxed' | 'armFlexed' | 'waist' | 'gluteal' | 'thighR' | 'thighL' | 'calfR' | 'calfL'
export type BreadthKey = 'humerus' | 'biepicondylar' | 'femur'

export interface ParsedAnthropometryRow {
  sourceName: string
  timepoint?: string
  /** ISO date of birth, when the file has it. */
  birthDate?: string
  /** The file's own "Age" column — used only when there is no date of birth. */
  ageYears?: number
  heightCm?: number
  weightKg?: number
  girthsCm: Partial<Record<GirthKey, number>>
  breadthsCm: Partial<Record<BreadthKey, number>>
  skinfoldsMm: Partial<Record<SkinfoldKey, number>>
  /** Non-empty cells that aren't a number, e.g. "n.d." — reported, never guessed. */
  unreadable: string[]
}

export interface ParsedAnthropometryFile {
  fileName: string
  rows: ParsedAnthropometryRow[]
}

export class AnthropometryImportError extends Error {}

type Field =
  | { kind: 'name' }
  | { kind: 'timepoint' }
  | { kind: 'birthDate' }
  | { kind: 'age' }
  | { kind: 'height' }
  | { kind: 'weight' }
  | { kind: 'girth'; key: GirthKey }
  | { kind: 'breadth'; key: BreadthKey }
  | { kind: 'skinfold'; key: SkinfoldKey }

/** Normalized header → field. Normalized = lower-case, accents and punctuation dropped. */
const HEADERS: [string[], Field][] = [
  [['athlete', 'atleta', 'giocatore', 'name', 'nome'], { kind: 'name' }],
  [['timepoint'], { kind: 'timepoint' }],
  [['dob', 'date of birth', 'data di nascita', 'data nascita'], { kind: 'birthDate' }],
  [['age', 'eta'], { kind: 'age' }],
  [['height', 'stature', 'altezza', 'statura'], { kind: 'height' }],
  [['weight', 'body mass', 'peso'], { kind: 'weight' }],
  [['arm girth relaxed'], { kind: 'girth', key: 'armRelaxed' }],
  [['arm girth flexed and tensed'], { kind: 'girth', key: 'armFlexed' }],
  [['waist girth min', 'waist girth'], { kind: 'girth', key: 'waist' }],
  [['gluteal girth max', 'gluteal girth'], { kind: 'girth', key: 'gluteal' }],
  [['thigh girth dx', 'thigh girth'], { kind: 'girth', key: 'thighR' }],
  [['thigh girth sx'], { kind: 'girth', key: 'thighL' }],
  [['calf girth dx', 'calf girth'], { kind: 'girth', key: 'calfR' }],
  [['calf girth sx'], { kind: 'girth', key: 'calfL' }],
  [['humerus breadth'], { kind: 'breadth', key: 'humerus' }],
  [['biepicondilar breadth', 'biepicondylar breadth'], { kind: 'breadth', key: 'biepicondylar' }],
  [['femur breadth'], { kind: 'breadth', key: 'femur' }],
  [['triceps sf', 'triceps'], { kind: 'skinfold', key: 'triceps' }],
  [['subscapular sf', 'subscapular'], { kind: 'skinfold', key: 'subscapular' }],
  [['biceps sf', 'biceps'], { kind: 'skinfold', key: 'biceps' }],
  [['iliac crest sf', 'iliac crest'], { kind: 'skinfold', key: 'iliacCrest' }],
  [['supraspinal sf', 'supraspinale sf', 'supraspinal', 'supraspinale'], { kind: 'skinfold', key: 'supraspinale' }],
  [['abdominal sf', 'abdominal'], { kind: 'skinfold', key: 'abdominal' }],
  // "tight" is how the team's template spells the thigh skinfold.
  [['tight', 'thigh sf', 'front thigh sf', 'thigh'], { kind: 'skinfold', key: 'thigh' }],
  [['calf', 'calf sf', 'medial calf sf'], { kind: 'skinfold', key: 'calf' }],
]

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const FIELD_BY_HEADER = new Map(HEADERS.flatMap(([names, field]) => names.map((n) => [n, field] as const)))

/** "7.4", "7,4", " 7.4 " → 7.4; '' → undefined; anything else → NaN (reported as unreadable). */
function parseNumber(raw: string): number | undefined {
  const s = raw.trim()
  if (s === '') return undefined
  const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN
}

/** Excel serial (number cell) or "dd/mm/yyyy" / ISO text → ISO date. */
function parseBirthDate(raw: string): string | undefined {
  const s = raw.trim()
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s))
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return s.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
}

function parseGrid(grid: string[][], fileName: string): ParsedAnthropometryFile | undefined {
  // Header row: the first one (among the first few) that names the athlete column.
  const headerIndex = grid.slice(0, 10).findIndex((row) => row.some((cell) => FIELD_BY_HEADER.get(normalizeHeader(cell ?? ''))?.kind === 'name'))
  if (headerIndex < 0) return undefined

  const columns = grid[headerIndex].map((cell) => FIELD_BY_HEADER.get(normalizeHeader(cell ?? '')))
  const headerLabels = grid[headerIndex].map((cell) => (cell ?? '').trim())
  const rows: ParsedAnthropometryRow[] = []

  for (const cells of grid.slice(headerIndex + 1)) {
    const row: ParsedAnthropometryRow = { sourceName: '', girthsCm: {}, breadthsCm: {}, skinfoldsMm: {}, unreadable: [] }
    columns.forEach((field, i) => {
      const raw = (cells[i] ?? '').trim()
      if (!field || raw === '') return
      if (field.kind === 'name') row.sourceName = raw
      else if (field.kind === 'timepoint') row.timepoint = raw
      else if (field.kind === 'birthDate') {
        const iso = parseBirthDate(raw)
        if (iso) row.birthDate = iso
        else row.unreadable.push(`${headerLabels[i]}: "${raw}"`)
      } else {
        const value = parseNumber(raw)
        if (value === undefined) return
        if (!Number.isFinite(value)) {
          row.unreadable.push(`${headerLabels[i]}: "${raw}"`)
          return
        }
        if (field.kind === 'age') row.ageYears = value
        else if (field.kind === 'height') row.heightCm = value
        else if (field.kind === 'weight') row.weightKg = value
        else if (field.kind === 'girth') row.girthsCm[field.key] = value
        else if (field.kind === 'breadth') row.breadthsCm[field.key] = value
        else row.skinfoldsMm[field.key] = value
      }
    })
    if (row.sourceName) rows.push(row)
  }
  return { fileName, rows }
}

export async function parseAnthropometryFile(file: File): Promise<ParsedAnthropometryFile> {
  const isCsv = /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv'
  let grids: string[][][]
  if (isCsv) {
    const text = (await file.text()).replace(/^﻿/, '')
    grids = [Papa.parse<string[]>(text, { skipEmptyLines: true }).data]
  } else {
    grids = (await readXlsx(file)).map((s) => s.rows)
  }

  for (const grid of grids) {
    const parsed = parseGrid(grid, file.name)
    if (parsed) {
      if (parsed.rows.length === 0) throw new AnthropometryImportError(`${file.name}: nessun atleta trovato nel file`)
      return parsed
    }
  }
  throw new AnthropometryImportError(`${file.name}: non trovo la colonna con il nome dell'atleta (ATHLETE / Giocatore)`)
}

/** Age in decimal years on `onDate` (both ISO). */
export function ageOn(birthDate: string, onDate: string): number {
  const ms = Date.parse(onDate + 'T00:00:00Z') - Date.parse(birthDate + 'T00:00:00Z')
  return ms / (365.2425 * 86_400_000)
}
