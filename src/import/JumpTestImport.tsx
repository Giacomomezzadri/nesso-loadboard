import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Check, FileUp, X } from 'lucide-react'
import { useState } from 'react'
import { buildNameMatcher, nameKey, type NameMatch } from '../lib/csv/matchPlayerNames'
import { parseJumpTestCsv, type ParsedJumpFile } from '../lib/csv/parseJumpTestCsv'
import { putJumpTests } from '../lib/db/repo'
import { useInvalidateJumpTests, usePlayerAliasesQuery, usePlayersQuery } from '../state/queries'
import type { JumpTest } from '../types/domain'
import { MatchBadge, PlayerSelect, aliasesToRemember, autoPlayerId } from './PlayerMatch'

interface NameRow {
  key: string
  sourceName: string
  testTypes: string[]
  rowCount: number
  match: NameMatch
}

/**
 * Imports one or more ForceDecks exports (CMJ, DJ, …). Names are matched to the roster
 * order/case/accent-insensitively; anything left over is paired by hand here, and that
 * pairing is remembered for the next import. Never creates a roster player.
 */
export function JumpTestImport({ onClose }: { onClose: () => void }) {
  const { data: players = [] } = usePlayersQuery()
  const { data: aliases = [] } = usePlayerAliasesQuery()
  const invalidate = useInvalidateJumpTests()
  const [files, setFiles] = useState<ParsedJumpFile[]>([])
  const [errors, setErrors] = useState<string[]>([])
  // Hand-picked player per normalized name; '' = don't import. Absent = use the automatic match.
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [done, setDone] = useState<number | null>(null)

  const matcher = buildNameMatcher(players, aliases)
  const rowsByKey = new Map<string, NameRow>()
  for (const file of files) {
    for (const row of file.rows) {
      const key = nameKey(row.sourceName)
      const existing = rowsByKey.get(key)
      if (existing) {
        existing.rowCount++
        if (!existing.testTypes.includes(row.testType)) existing.testTypes.push(row.testType)
      } else {
        rowsByKey.set(key, { key, sourceName: row.sourceName, testTypes: [row.testType], rowCount: 1, match: matcher(row.sourceName) })
      }
    }
  }
  const nameRows = [...rowsByKey.values()].sort(
    (a, b) => Number(b.match.status === 'none' || b.match.status === 'ambiguous') - Number(a.match.status === 'none' || a.match.status === 'ambiguous') || a.sourceName.localeCompare(b.sourceName),
  )
  const chosenPlayerId = (row: { key: string; match: NameMatch }) => choice[row.key] ?? autoPlayerId(row)

  const matchedRows = nameRows.filter((r) => chosenPlayerId(r) !== '')
  const testCount = matchedRows.reduce((n, r) => n + r.rowCount, 0)
  const unresolved = nameRows.length - matchedRows.length

  const save = useMutation({
    mutationFn: async () => {
      const importedAt = new Date().toISOString()
      const tests = new Map<string, JumpTest>()
      for (const file of files) {
        for (const row of file.rows) {
          const playerId = chosenPlayerId(rowsByKey.get(nameKey(row.sourceName))!)
          if (!playerId) continue
          // Same player + test + date + time = same test: a re-import overwrites it.
          const id = `${playerId}:${row.testType}:${row.date}:${row.time ?? ''}`
          tests.set(id, { id, playerId, importedAt, ...row })
        }
      }
      await putJumpTests([...tests.values()], aliasesToRemember(nameRows, chosenPlayerId))
      return tests.size
    },
    onSuccess: (count) => {
      invalidate()
      setDone(count)
    },
  })

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const parsed: ParsedJumpFile[] = []
    const errs: string[] = []
    for (const file of Array.from(list)) {
      try {
        parsed.push(await parseJumpTestCsv(file))
      } catch (err) {
        errs.push((err as Error).message)
      }
    }
    setFiles((prev) => [...prev, ...parsed])
    setErrors(errs)
    save.reset()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-medium text-ink">Importa test di salto</p>
          <p className="text-sm text-ink-secondary">
            Export ForceDecks (CMJ, Drop Jump…): puoi caricare più file insieme. Il tipo di test viene riconosciuto
            dal file.
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
            Importati {done} test. Li trovi nel Player Profile e nella Leaderboard.
          </p>
          <button type="button" onClick={onClose} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90">
            Fatto
          </button>
        </div>
      ) : (
        <>
          <label className="panel flex cursor-pointer flex-col items-center gap-2 border-dashed p-6 text-center hover:border-primary/50">
            <FileUp className="size-6 text-primary" />
            <span className="text-sm font-medium text-ink">{files.length === 0 ? 'Scegli i file CSV' : 'Aggiungi altri file'}</span>
            <span className="text-xs text-ink-muted">Puoi selezionarne più di uno</span>
            <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
          </label>

          {errors.map((e) => (
            <p key={e} className="flex items-start gap-2 text-sm text-status-critical">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {e}
            </p>
          ))}

          {files.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={`${f.fileName}-${i}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary">
                    <span className="font-medium text-ink">{f.testTypes.join(' + ')}</span> · {f.rows.length} righe ·{' '}
                    {[...new Set(f.rows.map((r) => r.date))].join(', ')}
                    {f.warnings.length > 0 && <span className="text-status-warning"> · {f.warnings.length} avvisi</span>}
                  </span>
                ))}
              </div>

              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-2">Nome nel file</th>
                      <th className="px-4 py-2">Test</th>
                      <th className="px-4 py-2">Giocatore</th>
                      <th className="px-4 py-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nameRows.map((row) => {
                      const chosen = chosenPlayerId(row)
                      return (
                        <tr key={row.key} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-2 font-medium text-ink">{row.sourceName}</td>
                          <td className="px-4 py-2 text-ink-secondary">{row.testTypes.join(', ')}</td>
                          <td className="px-4 py-2">
                            <PlayerSelect players={players} value={chosen} onChange={(id) => setChoice((c) => ({ ...c, [row.key]: id }))} />
                          </td>
                          <td className="px-4 py-2">
                            <MatchBadge row={row} chosen={chosen} picked={row.key in choice} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {files.some((f) => f.warnings.length > 0) && (
                <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                  {files.flatMap((f) => f.warnings.map((w) => <li key={`${f.fileName}:${w}`}>{f.fileName}: {w}</li>))}
                </ul>
              )}

              {save.error && <p className="text-sm text-status-critical">{(save.error as Error).message}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={testCount === 0 || save.isPending}
                  onClick={() => save.mutate()}
                  className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? 'Importazione…' : `Importa ${testCount} test`}
                </button>
                {unresolved > 0 && (
                  <span className="text-xs text-ink-muted">
                    {unresolved} {unresolved === 1 ? 'nome non verrà importato' : 'nomi non verranno importati'} — abbinali a un giocatore per includerli.
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
