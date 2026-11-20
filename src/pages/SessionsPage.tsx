import { Combine, Gauge, Pencil, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImportWizard } from '../import/ImportWizard'
import { AnthropometryImport } from '../import/AnthropometryImport'
import { JumpTestImport } from '../import/JumpTestImport'
import { EmptyState } from '../components/ui/EmptyState'
import { buildRpeEntries } from '../lib/csv/importSession'
import { addPlayersToSession, deleteSession, putRpeEntries, putSession } from '../lib/db/repo'
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
  playerTrainingType,
  TRAINING_TYPE_LABEL,
  type MatchLocation,
  type MatchResult,
  type DrillSegment,
  type RpeEntry,
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

type Panel = 'none' | 'edit' | 'rpe' | 'merge'

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

  const { data: segments = [] } = useSegmentsBySessionQuery(panel === 'rpe' || panel === 'merge' ? session.id : undefined)
  const [rpeDraft, setRpeDraft] = useState<Record<string, number>>({})
  const [savingRpe, setSavingRpe] = useState(false)
  const [rpeError, setRpeError] = useState<string | null>(null)

  const playerById = new Map(players.map((p) => [p.id, p]))
  const involvedPlayerIds = [...new Set(segments.map((s) => s.playerId))]
    .filter((id) => playerById.get(id)?.active !== false)
    .sort((a, b) => (playerById.get(a)?.displayName ?? a).localeCompare(playerById.get(b)?.displayName ?? b))

  function toggleMerge() {
    setPanel(panel === 'merge' ? 'none' : 'merge')
  }

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
                onClick={toggleMerge}
                title="Sposta i giocatori di questa sessione in un'altra dello stesso giorno"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5"
              >
                <Combine className="size-3.5" /> Unisci a…
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

      {panel === 'merge' && (
        <tr className="border-b border-border bg-page/40">
          <td colSpan={7} className="px-4 py-3">
            <MergePanel session={session} segments={segments} rpe={rpe} onDone={() => setPanel('none')} />
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

/**
 * Moves the chosen players of this session into another session of the same day, then deletes
 * this one — for a second export (another squad's) imported as its own session, which made the
 * day count two team trainings. Players already in the other session are replaced only if picked.
 * Each moved player keeps the training type they actually did (stored on their segments when it
 * differs from the target session's), so they count as present without being filed under the
 * team's type.
 */
function MergePanel({ session, segments, rpe, onDone }: { session: Session; segments: DrillSegment[]; rpe: RpeEntry[]; onDone: () => void }) {
  const { data: sessions = [] } = useSessionsQuery()
  const { data: players = [] } = usePlayersQuery()
  const invalidate = useInvalidateAfterImport()
  const candidates = sessions.filter((s) => s.id !== session.id && s.date === session.date)
  const [targetId, setTargetId] = useState(candidates.length === 1 ? candidates[0].id : '')
  const target = candidates.find((s) => s.id === targetId)
  const { data: targetSegments, isLoading: loadingTarget } = useSegmentsBySessionQuery(target?.id)
  // Absent = default (everyone not already in the target session).
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [markOtherTeam, setMarkOtherTeam] = useState(true)
  // '' = same type as the target session. Unset = what the player did in this session.
  const [typeOverride, setTypeOverride] = useState<Record<string, TrainingType | ''>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? id
  const inTarget = new Set((targetSegments ?? []).map((s) => s.playerId))
  const sourcePlayerIds = [...new Set(segments.map((s) => s.playerId))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const isPicked = (id: string) => picked[id] ?? !inTarget.has(id)
  const chosen = sourcePlayerIds.filter(isPicked)
  const targetIsTraining = target?.type === 'training'
  const sourceTypeOf = (id: string) => playerTrainingType(session, segments.find((s) => s.playerId === id))
  const typeOf = (id: string): TrainingType | '' => {
    if (id in typeOverride) return typeOverride[id]
    const own = sourceTypeOf(id)
    return own && own !== target?.trainingType ? own : ''
  }
  const typeSelectLabel = `Come la sessione (${target?.trainingType ? TRAINING_TYPE_LABEL[target.trainingType] : 'non classificata'})`

  if (candidates.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        Non ci sono altre sessioni il {session.date}: non c'è niente a cui unirla.
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-ink-secondary hover:bg-ink/5">
          Chiudi
        </button>
      </div>
    )
  }

  async function merge() {
    if (!target || chosen.length === 0) return
    const confirmed = window.confirm(
      `Spostare ${chosen.length} ${chosen.length === 1 ? 'giocatore' : 'giocatori'} in "${target.label}" ed eliminare la sessione "${session.label}"? I giocatori non selezionati vengono eliminati con lei.`,
    )
    if (!confirmed) return
    setSaving(true)
    setError(null)
    try {
      const keep = new Set(chosen)
      const ownType = (id: string) => {
        const t = targetIsTraining ? typeOf(id) : ''
        return t && t !== target.trainingType ? t : undefined
      }
      // Segment ids are `${sessionId}:${playerId}:${drill}`, RPE ids `${sessionId}:${playerId}`.
      const movedSegments = segments
        .filter((seg) => keep.has(seg.playerId))
        .map((seg) => ({
          ...seg,
          id: target.id + seg.id.slice(session.id.length),
          sessionId: target.id,
          trainingType: ownType(seg.playerId),
        }))
      const movedRpe = rpe
        .filter((e) => keep.has(e.playerId))
        .map((e) => ({ ...e, id: `${target.id}:${e.playerId}`, sessionId: target.id }))
      await addPlayersToSession(target.id, movedSegments, movedRpe, markOtherTeam)
      await deleteSession(session.id)
      invalidate()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto durante l'unione.")
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-ink-secondary">Unisci a</span>
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value)
            setPicked({})
            setTypeOverride({})
          }}
          className="max-w-md rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        >
          {!target && <option value="">— Scegli la sessione della squadra —</option>}
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.type === 'match' ? 'Partita' : c.trainingType ? TRAINING_TYPE_LABEL[c.trainingType] : 'Allenamento'})
            </option>
          ))}
        </select>
      </label>

      {target && (loadingTarget || segments.length === 0) && <p className="text-ink-muted">Caricamento giocatori…</p>}
      {target && !loadingTarget && segments.length > 0 && (
        <>
          <p className="text-ink-secondary">
            Giocatori da spostare in "{target.label}" (preselezionati quelli che lì non hanno ancora dati):
          </p>
          {targetIsTraining && (
            <label className="flex flex-wrap items-center gap-2 text-ink-secondary">
              Tipologia svolta da tutti i selezionati:
              <select
                value=""
                onChange={(e) => {
                  const value = e.target.value === '__same' ? '' : (e.target.value as TrainingType)
                  setTypeOverride((prev) => ({ ...prev, ...Object.fromEntries(chosen.map((id) => [id, value])) }))
                }}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink"
              >
                <option value="">— Imposta per tutti —</option>
                <option value="__same">{typeSelectLabel}</option>
                {TRAINING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRAINING_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto lg:grid-cols-2">
            {sourcePlayerIds.map((id) => (
              <div key={id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <label className="flex min-w-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPicked(id)}
                    onChange={() => setPicked((prev) => ({ ...prev, [id]: !isPicked(id) }))}
                    className="size-3.5 accent-primary"
                  />
                  <span className="truncate text-ink">{nameOf(id)}</span>
                  {inTarget.has(id) && (
                    <span className={isPicked(id) ? 'text-status-serious' : 'text-ink-muted'}>
                      {isPicked(id) ? 'sostituisce i suoi dati' : 'già presente'}
                    </span>
                  )}
                </label>
                {targetIsTraining && isPicked(id) && (
                  <select
                    value={typeOf(id)}
                    onChange={(e) => setTypeOverride((prev) => ({ ...prev, [id]: e.target.value as TrainingType | '' }))}
                    aria-label={`Tipologia svolta da ${nameOf(id)}`}
                    className="max-w-full rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-ink"
                  >
                    <option value="">{typeSelectLabel}</option>
                    {TRAINING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TRAINING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-ink-secondary">
            <input type="checkbox" checked={markOtherTeam} onChange={(e) => setMarkOtherTeam(e.target.checked)} className="size-3.5 accent-primary" />
            Si sono allenati con un'altra squadra (restano presenti, segnati "con altra squadra" nella griglia presenze)
          </label>
        </>
      )}

      {error && <p className="text-status-critical">Unione non riuscita: {error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-ink-secondary hover:bg-ink/5">
          Annulla
        </button>
        <button
          type="button"
          onClick={merge}
          disabled={!target || chosen.length === 0 || saving || loadingTarget}
          className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Unione…' : `Unisci ${chosen.length} ed elimina questa sessione`}
        </button>
      </div>
    </div>
  )
}

export function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessionsQuery()
  const { canEdit } = useAuth()
  const [importing, setImporting] = useState(false)
  const [importingJumps, setImportingJumps] = useState(false)
  const [importingBody, setImportingBody] = useState(false)
  const navigate = useNavigate()

  if (importingJumps && canEdit) return <JumpTestImport onClose={() => setImportingJumps(false)} />
  if (importingBody && canEdit) return <AnthropometryImport onClose={() => setImportingBody(false)} />

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
              onClick={() => setImportingBody(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary/50"
            >
              <Upload className="size-4" /> Antropometria
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
