import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Check, FileUp, X } from 'lucide-react'
import { useState } from 'react'
import { BODY_VALUE_RANGES, FAT_MASS_METHOD, MUSCLE_MASS_METHOD, deriveBodyValues } from '../lib/body/anthropometry'
import { ageOn, parseAnthropometryFile, type ParsedAnthropometryFile, type ParsedAnthropometryRow } from '../lib/body/parseAnthropometryFile'
import { buildNameMatcher, nameKey, type NameMatch } from '../lib/csv/matchPlayerNames'
import { putBodyMeasurements } from '../lib/db/repo'
import { cn, formatNumber } from '../lib/utils'
import { useBodyMeasurementsQuery, useInvalidateBodyMeasurementImport, usePlayerAliasesQuery, usePlayersQuery } from '../state/queries'
import type { BodyMeasurement } from '../types/domain'
import { MatchBadge, PlayerSelect, aliasesToRemember, autoPlayerId } from './PlayerMatch'

type ValueKey = keyof typeof BODY_VALUE_RANGES

const VALUE_COLUMNS: { key: ValueKey; label: string; unit: string }[] = [
  { key: 'skinfoldMm', label: 'Plicometria', unit: 'mm' },
  { key: 'fatMassPct', label: 'Massa grassa', unit: '%' },
  { key: 'muscleMassKg', label: 'Massa muscolare', unit: 'kg' },
]

interface PreviewRow {
  key: string
  sourceName: string
  match: NameMatch
  /** A second row with the same name in the file — never imported. */
  duplicate: boolean
  values: Partial<Record<ValueKey, number>>
  notes: string[]
  measurement: Omit<BodyMeasurement, 'updatedAt' | 'playerId'>
}

function todayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

const round2 = (v: number) => Math.round(v * 100) / 100

function buildRow(row: ParsedAnthropometryRow, date: string, match: NameMatch, duplicate: boolean): PreviewRow {
  const ageYears = row.birthDate ? ageOn(row.birthDate, date) : row.ageYears
  const derived = deriveBodyValues({
    ageYears,
    heightCm: row.heightCm,
    skinfoldsMm: row.skinfoldsMm,
    armGirthCm: row.girthsCm.armRelaxed,
    thighGirthCm: row.girthsCm.thighR ?? row.girthsCm.thighL,
    calfGirthCm: row.girthsCm.calfR ?? row.girthsCm.calfL,
  })
  const notes = [...row.unreadable.map((u) => `valore non leggibile — ${u}`), ...derived.missing]
  const values: Partial<Record<ValueKey, number>> = {}
  for (const { key, label } of VALUE_COLUMNS) {
    const v = derived[key]
    if (v === undefined) continue
    const [min, max] = BODY_VALUE_RANGES[key]
    if (v < min || v > max) notes.push(`${label.toLowerCase()} fuori intervallo (${formatNumber(v, 1)}): controlla i dati`)
    else values[key] = v
  }
  return {
    key: nameKey(row.sourceName),
    sourceName: row.sourceName,
    match,
    duplicate,
    values,
    notes,
    measurement: {
      date,
      ...values,
      anthropometry: {
        timepoint: row.timepoint,
        heightCm: row.heightCm,
        weightKg: row.weightKg,
        ageYears: ageYears === undefined ? undefined : round2(ageYears),
        girthsCm: row.girthsCm,
        breadthsCm: row.breadthsCm,
        skinfoldsMm: row.skinfoldsMm,
        fatMassMethod: values.fatMassPct === undefined ? undefined : FAT_MASS_METHOD,
        muscleMassMethod: values.muscleMassKg === undefined ? undefined : MUSCLE_MASS_METHOD,
      },
    },
  }
}

/**
 * Imports one ISAK anthropometric profile sheet (.xlsx or .csv): plicometria, % fat mass and
 * muscle mass are computed from the raw measures (see lib/body/anthropometry.ts) and saved as
 * one body measurement per player on the date chosen here. Names are matched like the jump-test
 * import, and hand pairings are remembered. Never creates a roster player.
 */
export function AnthropometryImport({ onClose }: { onClose: () => void }) {
  const { data: players = [] } = usePlayersQuery()
  const { data: aliases = [] } = usePlayerAliasesQuery()
  const { data: existing = [] } = useBodyMeasurementsQuery()
  const invalidate = useInvalidateBodyMeasurementImport()
  const [file, setFile] = useState<ParsedAnthropometryFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(todayIso())
  const [updatePlayers, setUpdatePlayers] = useState(true)
  // Hand-picked player per normalized name; '' = don't import. Absent = use the automatic match.
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [done, setDone] = useState<number | null>(null)

  const matcher = buildNameMatcher(players, aliases)
  const seenKeys = new Set<string>()
  const rows = (file?.rows ?? []).map((r) => {
    const key = nameKey(r.sourceName)
    const duplicate = seenKeys.has(key)
    seenKeys.add(key)
    return buildRow(r, date, matcher(r.sourceName), duplicate)
  })
  const chosenPlayerId = (row: { key: string; match: NameMatch }) => choice[row.key] ?? autoPlayerId(row)
  const importable = rows.filter((r) => !r.duplicate && chosenPlayerId(r) !== '' && Object.keys(r.values).length > 0)

  // Two file names paired to the same player would write the same measurement twice.
  const rowsByPlayer = new Map<string, string[]>()
  for (const r of importable) rowsByPlayer.set(chosenPlayerId(r), [...(rowsByPlayer.get(chosenPlayerId(r)) ?? []), r.sourceName])
  const clashes = [...rowsByPlayer.values()].filter((names) => names.length > 1)
  const replacing = importable.filter((r) => existing.some((m) => m.playerId === chosenPlayerId(r) && m.date === date)).length

  const save = useMutation({
    mutationFn: async () => {
      const measurements = importable.map((r) => ({ ...r.measurement, playerId: chosenPlayerId(r) }))
      const uniqueRows = rows.filter((r) => !r.duplicate)
      await putBodyMeasurements(measurements, aliasesToRemember(uniqueRows, chosenPlayerId), updatePlayers)
      return measurements.length
    },
    onSuccess: (count) => {
      invalidate()
      setDone(count)
    },
  })

  const onFile = async (list: FileList | null) => {
    const picked = list?.[0]
    if (!picked) return
    save.reset()
    setChoice({})
    try {
      setFile(await parseAnthropometryFile(picked))
      setError(null)
    } catch (err) {
      setFile(null)
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-medium text-ink">Importa profilo antropometrico</p>
          <p className="text-sm text-ink-secondary">
            File ISAK (.xlsx o .csv, una riga per atleta). Plicometria, massa grassa e massa muscolare vengono calcolate dalle
            misure del file.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink" aria-label="Chiudi">
          <X className="size-5" />
        </button>
      </div>

      {done !== null ? (
        <div className="panel flex flex-col items-start gap-3 p-5">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Check className="size-4 text-status-good" />
            Importate {done} misurazioni. Le trovi nel Player Profile, sezione Composizione corporea.
          </p>
          <button type="button" onClick={onClose} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90">
            Fatto
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-stretch gap-3">
            <label className="panel flex min-w-64 flex-1 cursor-pointer flex-col items-center gap-2 border-dashed p-5 text-center hover:border-primary/50">
              <FileUp className="size-6 text-primary" />
              <span className="text-sm font-medium text-ink">{file ? file.fileName : 'Scegli il file Excel o CSV'}</span>
              {file && <span className="text-xs text-ink-muted">{file.rows.length} atleti · clicca per cambiare file</span>}
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            <div className="panel flex flex-col justify-center gap-2 p-4">
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Data della rilevazione
                <input
                  type="date"
                  value={date}
                  max={todayIso()}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-md border border-border bg-page px-2 py-1 text-sm text-ink"
                />
              </label>
              <span className="max-w-56 text-[11px] text-ink-muted">La data non viene letta dal file: nel modello ISAK è =OGGI() e cambia a ogni apertura.</span>
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-sm text-status-critical">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {file && (
            <>
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-2">Nome nel file</th>
                      <th className="px-4 py-2">Giocatore</th>
                      <th className="px-4 py-2">Stato</th>
                      {VALUE_COLUMNS.map((c) => (
                        <th key={c.key} className="whitespace-nowrap px-4 py-2 text-right">
                          {c.label} ({c.unit})
                        </th>
                      ))}
                      <th className="px-4 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const chosen = chosenPlayerId(row)
                      return (
                        <tr key={`${row.key}:${i}`} className={cn('border-b border-border/60 last:border-0', row.duplicate && 'opacity-50')}>
                          <td className="px-4 py-2 font-medium text-ink">{row.sourceName}</td>
                          <td className="px-4 py-2">
                            {row.duplicate ? (
                              <span className="text-xs text-ink-muted">Nome ripetuto: non importato</span>
                            ) : (
                              <PlayerSelect players={players} value={chosen} onChange={(id) => setChoice((c) => ({ ...c, [row.key]: id }))} />
                            )}
                          </td>
                          <td className="px-4 py-2">{!row.duplicate && <MatchBadge row={row} chosen={chosen} picked={row.key in choice} />}</td>
                          {VALUE_COLUMNS.map((c) => (
                            <td key={c.key} className="px-4 py-2 text-right tabular-nums text-ink">
                              {row.values[c.key] === undefined ? <span className="text-ink-muted">—</span> : formatNumber(row.values[c.key]!, 1)}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-xs text-status-serious">
                            {row.notes.map((n) => (
                              <p key={n}>{n}</p>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-ink-muted">
                Plicometria = somma delle 8 pliche ISAK. Massa grassa = Durnin-Womersley (4 pliche; Durnin-Rahaman sotto i 17 anni)
                + Siri. Massa muscolare = Lee 2000 (circonferenze di braccio, coscia e polpaccio corrette per la plica). Equazioni
                per atleti maschi. Le somme scritte nel file vengono ignorate e ricalcolate.
              </p>

              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" checked={updatePlayers} onChange={(e) => setUpdatePlayers(e.target.checked)} className="size-4 accent-primary" />
                Aggiorna anche altezza e peso nella scheda giocatore (solo se non esiste una misurazione più recente)
              </label>

              {clashes.map((names) => (
                <p key={names.join('|')} className="flex items-start gap-2 text-sm text-status-critical">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {names.join(' e ')} sono abbinati allo stesso giocatore: correggi l'abbinamento.
                </p>
              ))}
              {replacing > 0 && (
                <p className="text-xs text-status-serious">
                  {replacing} {replacing === 1 ? 'giocatore ha' : 'giocatori hanno'} già una misurazione in questa data: verrà sostituita.
                </p>
              )}
              {save.error && <p className="text-sm text-status-critical">{(save.error as Error).message}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={importable.length === 0 || clashes.length > 0 || !date || save.isPending}
                  onClick={() => save.mutate()}
                  className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? 'Importazione…' : `Importa ${importable.length} misurazioni`}
                </button>
                {rows.length - importable.length > 0 && (
                  <span className="text-xs text-ink-muted">
                    {rows.length - importable.length} {rows.length - importable.length === 1 ? 'riga non verrà importata' : 'righe non verranno importate'} (non
                    abbinate, ripetute o senza valori calcolabili).
                  </span>
                )}
                <span className="text-xs text-ink-muted">Gli abbinamenti fatti a mano vengono ricordati per i prossimi import.</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
