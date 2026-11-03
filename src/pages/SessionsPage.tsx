import { Gauge, Pencil, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImportWizard } from '../import/ImportWizard'
import { JumpTestImport } from '../import/JumpTestImport'
import { EmptyState } from '../components/ui/EmptyState'
import { buildRpeEntries } from '../lib/csv/importSession'
import { deleteSession, putRpeEntries, putSession } from '../lib/db/repo'
import { useAuth } from '../state/AuthContext'
import {
  useInvalidateAfterImport,
  useInvalidateRpe,
  useInvalidateSessionMetadata,
  usePlayersQuery,
  useRpeBySessionQuery,
  useSegmentsBySessionQuery,
  useSessionsQuery,
} from '../state/queries'
import {
  buildMatchLabel,
  MATCH_LOCATION_LABEL,
  MATCH_RESULT_LABEL,
  TRAINING_TYPE_LABEL,
  type MatchLocation,
  type MatchResult,
  type Session,
  type SessionType,
  type TrainingType,
} from '../types/domain'

const TRAINING_TYPES: TrainingType[] = [
  'ripresa',
  'forza',
  'metabolico_alte_velocita',
  'rifinitura',
  'recupero_attivo',
  'mix',
  'amichevole',
]
const MATCH_RESULTS: MatchResult[] = ['win', 'draw', 'loss']
const MATCH_LOCATIONS: MatchLocation[] = ['home', 'away', 'away_2d']

type Panel = 'none' | 'edit' | 'rpe'

function SessionRow({ session, canEdit }: { session: Session; canEdit: boolean }) {
  const { data: rpe = [] } = useRpeBySessionQuery(session.id)
  const { data: players = [] } = usePlayersQuery()
  const invalidateAfterDelete = useInvalidateAfterImport()
  const invalidateMetadata = useInvalidateSessionMetadata()
  const invalidateRpe = useInvalidateRpe()

  const [panel, setPanel] = useState<Panel>('none')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [type, setType] = useState<SessionType>(session.type)
  const [trainingType, setTrainingType] = useState<TrainingType>(session.trainingType ?? 'mix')
  const [matchResult, setMatchResult] = useState<MatchResult>(session.matchResult ?? 'win')
  const [matchLocation, setMatchLocation] = useState<MatchLocation>(session.matchLocation ?? 'home')
  const [opponentName, setOpponentName] = useState(session.opponentName ?? '')
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)

  const { data: segments = [] } = useSegmentsBySessionQuery(panel === 'rpe' ? session.id : undefined)
  const [rpeDraft, setRpeDraft] = useState<Record<string, number>>({})
  const [savingRpe, setSavingRpe] = useState(false)
  const [rpeError, setRpeError] = useState<string | null>(null)

  const playerById = new Map(players.map((p) => [p.id, p]))
  const involvedPlayerIds = [...new Set(segments.map((s) => s.playerId))]
    .filter((id) => playerById.get(id)?.active !== false)
    .sort((a, b) => (playerById.get(a)?.displayName ?? a).localeCompare(playerById.get(b)?.displayName ?? b))

  function toggleEdit() {
    if (panel !== 'edit') {
      setType(session.type)
      setTrainingType(session.trainingType ?? 'mix')
      setMatchResult(session.matchResult ?? 'win')
      setMatchLocation(session.matchLocation ?? 'home')
      setOpponentName(session.opponentName ?? '')
    }
    setPanel(panel === 'edit' ? 'none' : 'edit')
  }

  function toggleRpe() {
    if (panel !== 'rpe') {
      setRpeDraft(Object.fromEntries(rpe.map((r) => [r.playerId, r.rpe])))
    }
    setPanel(panel === 'rpe' ? 'none' : 'rpe')
  }

  async function saveMeta() {
    setSavingMeta(true)
    setMetaError(null)
    try {
      const trimmedOpponent = opponentName.trim()
      const updated: Session = {
        ...session,
        type,
        trainingType: type === 'training' ? trainingType : undefined,
        matchResult: type === 'match' ? matchResult : undefined,
        matchLocation: type === 'match' ? matchLocation : undefined,
        opponentName: type === 'match' ? trimmedOpponent || undefined : undefined,
        // Only re-derive the label when there's an opponent to build it from —
        // never blanks out a pre-existing label for matches imported before this field existed.
        label: type === 'match' && trimmedOpponent ? buildMatchLabel(trimmedOpponent, matchLocation) : session.label,
      }
      await putSession(updated)
      invalidateMetadata()
      setPanel('none')
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Errore imprevisto durante il salvataggio.')
    } finally {
      setSavingMeta(false)
    }
  }

  async function saveRpe() {
    setSavingRpe(true)
    setRpeError(null)
    try {
      const entries = buildRpeEntries(session.id, segments, rpeDraft)
      if (entries.length > 0) await putRpeEntries(entries)
      invalidateRpe(session.id)
      setPanel('none')
    } catch (err) {
      setRpeError(err instanceof Error ? err.message : 'Errore imprevisto durante il salvataggio.')
    } finally {
      setSavingRpe(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Eliminare definitivamente la sessione "${session.label}" (${session.date})? Verranno rimossi anche tutti i dati e l'RPE associati. L'operazione non è reversibile.`,
    )
    if (!confirmed) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSession(session.id)
      invalidateAfterDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Errore imprevisto durante l\'eliminazione.')
      setDeleting(false)
    }
  }

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="px-4 py-2 tabular-nums text-ink">{session.date}</td>
        <td className="px-4 py-2 font-medium text-ink">{session.label}</td>
        <td className="px-4 py-2 text-ink-secondary">
          {session.type === 'match' ? 'Partita' : 'Allenamento'}
          {session.type === 'training' && session.trainingType && (
            <span className="ml-1.5 text-xs text-ink-muted">({TRAINING_TYPE_LABEL[session.trainingType]})</span>
          )}
          {session.type === 'match' && session.matchResult && (
            <span className="ml-1.5 text-xs text-ink-muted">
              ({MATCH_RESULT_LABEL[session.matchResult]}
              {session.matchLocation && ` — ${MATCH_LOCATION_LABEL[session.matchLocation]}`})
            </span>
          )}
        </td>
        <td className="px-4 py-2 tabular-nums text-ink-secondary">{session.rawRowCount}</td>
        <td className="px-4 py-2">
          {session.warningCount > 0 ? (
            <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-xs font-medium text-status-warning">
              {session.warningCount} avvisi
            </span>
          ) : (
            <span className="rounded-full bg-status-good/15 px-2 py-0.5 text-xs font-medium text-status-good">OK</span>
          )}
        </td>
        <td className="px-4 py-2 text-xs text-ink-muted">{rpe.length > 0 ? `RPE: ${rpe.length}` : 'RPE mancante'}</td>
        <td className="px-4 py-2">
          {canEdit ? (
            <div className="flex items-center justify-end gap-1 whitespace-nowrap">
              <button
                type="button"
                onClick={toggleEdit}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5"
              >
                <Pencil className="size-3.5" /> Tipo
              </button>
              <button
                type="button"
                onClick={toggleRpe}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5"
              >
                <Gauge className="size-3.5" /> RPE
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-60"
              >
                <Trash2 className="size-3.5" /> {deleting ? 'Eliminazione…' : 'Elimina'}
              </button>
            </div>
          ) : (
            <span className="block text-right text-xs text-ink-muted">—</span>
          )}
        </td>
      </tr>

      {deleteError && (
        <tr className="border-b border-border bg-status-critical/5">
          <td colSpan={7} className="px-4 py-2 text-xs text-status-critical">
            Eliminazione non riuscita: {deleteError}
          </td>
        </tr>
      )}

      {panel === 'edit' && (
        <tr className="border-b border-border bg-page/40">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-ink-secondary">Tipo</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SessionType)}
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                >
                  <option value="training">Allenamento</option>
                  <option value="match">Partita</option>
                </select>
              </label>
              {type === 'training' && (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-ink-secondary">Tipologia allenamento</span>
                  <select
                    value={trainingType}
                    onChange={(e) => setTrainingType(e.target.value as TrainingType)}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                  >
                    {TRAINING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TRAINING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {type === 'match' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-ink-secondary">Avversario</span>
                    <input
                      type="text"
                      value={opponentName}
                      onChange={(e) => setOpponentName(e.target.value)}
                      placeholder="es. Juventus"
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-ink-secondary">Esito</span>
                    <select
                      value={matchResult}
                      onChange={(e) => setMatchResult(e.target.value as MatchResult)}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                    >
                      {MATCH_RESULTS.map((r) => (
                        <option key={r} value={r}>
                          {MATCH_RESULT_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-ink-secondary">Sede</span>
                    <select
                      value={matchLocation}
                      onChange={(e) => setMatchLocation(e.target.value as MatchLocation)}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
                    >
                      {MATCH_LOCATIONS.map((l) => (
                        <option key={l} value={l}>
                          {MATCH_LOCATION_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {metaError && <p className="w-full text-xs text-status-critical">Salvataggio non riuscito: {metaError}</p>}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  className="rounded-md px-3 py-1.5 text-xs text-ink-secondary hover:bg-ink/5"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={saveMeta}
                  disabled={savingMeta}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
                >
                  {savingMeta ? 'Salvataggio…' : metaError ? 'Riprova' : 'Salva'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {panel === 'rpe' && (
        <tr className="border-b border-border bg-page/40">
          <td colSpan={7} className="px-4 py-3">
            {involvedPlayerIds.length === 0 ? (
              <p className="text-xs text-ink-muted">Caricamento giocatori…</p>
            ) : (
              <>
                <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {involvedPlayerIds.map((id) => (
                    <label key={id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink">{playerById.get(id)?.displayName ?? id}</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={rpeDraft[id] ?? ''}
                        onChange={(e) => setRpeDraft((prev) => ({ ...prev, [id]: Number(e.target.value) }))}
                        className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right tabular-nums text-ink"
                      />
                    </label>
                  ))}
                </div>
                {rpeError && <p className="mt-2 text-xs text-status-critical">Salvataggio non riuscito: {rpeError}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPanel('none')}
                    className="rounded-md px-3 py-1.5 text-xs text-ink-secondary hover:bg-ink/5"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={saveRpe}
                    disabled={savingRpe}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
                  >
                    {savingRpe ? 'Salvataggio…' : rpeError ? 'Riprova' : 'Salva RPE'}
                  </button>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessionsQuery()
  const { canEdit } = useAuth()
  const [importing, setImporting] = useState(false)
  const [importingJumps, setImportingJumps] = useState(false)
  const navigate = useNavigate()

  if (importingJumps && canEdit) return <JumpTestImport onClose={() => setImportingJumps(false)} />

  if (importing && canEdit) {
    return (
      <ImportWizard
        onClose={() => {
          setImporting(false)
          navigate('/drills')
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary">
          Storico delle sessioni importate in questo browser. Da qui puoi anche cambiarne la tipologia, correggere
          l'RPE o eliminarle.
        </p>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportingJumps(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary/50"
            >
              <Upload className="size-4" /> Test di salto
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              <Upload className="size-4" /> Nuovo import
            </button>
          </div>
        )}
      </div>

      {isLoading ? null : sessions.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Nessuna sessione importata"
          description="Importa il primo export CSV per iniziare."
        />
      ) : (
        <div className="overflow-x-auto panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Etichetta</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Righe</th>
                <th className="px-4 py-2">Import</th>
                <th className="px-4 py-2">RPE</th>
                <th className="px-4 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} canEdit={canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
