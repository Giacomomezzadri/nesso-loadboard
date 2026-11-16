import { AlertTriangle, ArrowLeft, ArrowRight, Check, Upload } from 'lucide-react'
import { useState } from 'react'
import { CsvImportError } from '../lib/csv/parseSessionCsv'
import { commitImport, commitIntoSession, listCsvPlayerNames, stageImport, type StagedImport } from '../lib/csv/importSession'
import { listPlayers, listSegmentsBySession } from '../lib/db/repo'
import {
  buildMatchLabel,
  MATCH_LOCATION_LABEL,
  MATCH_RESULT_LABEL,
  MISSING_PLAYER_STATUSES,
  PLAYER_STATUS_LABEL,
  TRAINING_TYPE_LABEL,
  type MatchLocation,
  type MatchResult,
  type Player,
  type PlayerSessionStatus,
  type Session,
  type SessionType,
  type TrainingType,
} from '../types/domain'
import { useCurrentSession } from '../state/CurrentSessionContext'
import { useInvalidateAfterImport, useSessionsQuery } from '../state/queries'

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
const IMPORT_MODES: { value: 'new' | 'existing'; title: string; hint: string }[] = [
  { value: 'new', title: 'Nuova sessione', hint: 'Un allenamento o una partita della squadra.' },
  {
    value: 'existing',
    title: 'Aggiungi a una sessione esistente',
    hint: "Per i giocatori che quel giorno si sono allenati con un'altra squadra: i loro dati entrano nella sessione già importata, così il giorno conta un solo allenamento.",
  },
]
const MATCH_LOCATIONS: MatchLocation[] = ['home', 'away', 'away_2d']

type Step = 'select' | 'metadata' | 'players' | 'rpe' | 'done'
/** New session, or more players added to a session already imported for the same day. */
type Mode = 'new' | 'existing'

/** One export name in "add to an existing session" mode. */
interface CsvName {
  name: string
  /** The roster player this name already maps to (same rule as /api/players/upsert). */
  player?: Player
  /** That player already has data in the chosen session — importing replaces it. */
  inTarget: boolean
}

/** Same slug as functions/api/players/upsert.ts, whose ids are `${workspaceId}:${slug}`. */
function playerSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function sessionOptionLabel(s: Session): string {
  const kind = s.type === 'match' ? 'Partita' : s.trainingType ? TRAINING_TYPE_LABEL[s.trainingType] : 'Allenamento'
  return `${s.label} — ${kind}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Many exports are named "YYYY-MM-DD-..." — infer the session date from the filename when present. */
function inferDateFromFileName(fileName: string): string | null {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

interface ImportWizardProps {
  onClose: () => void
}

export function ImportWizard({ onClose }: ImportWizardProps) {
  const [step, setStep] = useState<Step>('select')
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [fileText, setFileText] = useState<string>('')
  const [date, setDate] = useState(todayIso())
  const [label, setLabel] = useState('')
  const [type, setType] = useState<SessionType>('training')
  const [trainingType, setTrainingType] = useState<TrainingType>('mix')
  const [matchResult, setMatchResult] = useState<MatchResult>('win')
  const [matchLocation, setMatchLocation] = useState<MatchLocation>('home')
  const [opponentName, setOpponentName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [staged, setStaged] = useState<StagedImport | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rpeByPlayerId, setRpeByPlayerId] = useState<Record<string, number>>({})
  // Active roster players the export has no data for — the editor says why for each one.
  const [missingPlayers, setMissingPlayers] = useState<Player[]>([])
  const [statusByPlayerId, setStatusByPlayerId] = useState<Record<string, PlayerSessionStatus>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('new')
  const [targetId, setTargetId] = useState('')
  const [csvNames, setCsvNames] = useState<CsvName[]>([])
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [markOtherTeam, setMarkOtherTeam] = useState(true)
  const { data: sessions = [] } = useSessionsQuery()
  const sessionsOnDate = sessions.filter((s) => s.date === date)
  const target = sessionsOnDate.find((s) => s.id === targetId) ?? (sessionsOnDate.length === 1 ? sessionsOnDate[0] : undefined)

  const invalidate = useInvalidateAfterImport()
  const { setCurrentSessionId } = useCurrentSession()

  async function handleFile(file: File) {
    setFileError(null)
    const text = await file.text()
    setFileName(file.name)
    setFileText(text)
    setLabel((prev) => prev || file.name.replace(/\.csv$/i, ''))
    const inferredDate = inferDateFromFileName(file.name)
    if (inferredDate) setDate(inferredDate)
    setStep('metadata')
  }

  /** "Add to an existing session": list the export's names, preselecting the roster players not in that session yet. */
  async function handleExistingSubmit() {
    if (!target) {
      setFormError('Scegli la sessione a cui aggiungere i giocatori.')
      return
    }
    setFormError(null)
    try {
      const names = listCsvPlayerNames(fileText)
      const [roster, targetSegments] = await Promise.all([listPlayers(), listSegmentsBySession(target.id)])
      const inTarget = new Set(targetSegments.map((s) => s.playerId))
      const entries = names.map((name) => {
        const slug = playerSlug(name)
        const player = roster.find((p) => p.id === slug || p.id.endsWith(`:${slug}`))
        return { name, player, inTarget: player ? inTarget.has(player.id) : false }
      })
      setCsvNames(entries)
      setSelectedNames(new Set(entries.filter((e) => e.player?.active && !e.inTarget).map((e) => e.name)))
      setStep('players')
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Errore imprevisto durante la lettura del CSV.')
      setStep('select')
    }
  }

  async function handlePlayersSubmit() {
    if (!target) return
    setFormError(null)
    try {
      const result = await stageImport(
        fileText,
        fileName,
        {
          date: target.date,
          label: target.label,
          type: target.type,
          trainingType: target.trainingType,
          matchResult: target.matchResult,
          matchLocation: target.matchLocation,
          opponentName: target.opponentName,
        },
        { sessionId: target.id, includeNames: selectedNames },
      )
      setStaged(result)
      const allPlayers = await listPlayers()
      const involvedIds = new Set(result.segments.map((s) => s.playerId))
      setPlayers(allPlayers.filter((p) => involvedIds.has(p.id)).sort((a, b) => a.displayName.localeCompare(b.displayName)))
      setMissingPlayers([])
      setStatusByPlayerId({})
      setStep('rpe')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Errore imprevisto durante la lettura del CSV.')
    }
  }

  async function handleMetadataSubmit() {
    if (mode === 'existing') return handleExistingSubmit()
    if (type === 'match' && !opponentName.trim()) {
      setFormError("Inserisci il nome dell'avversario.")
      return
    }
    setFormError(null)
    try {
      const result = await stageImport(fileText, fileName, {
        date,
        label: type === 'match' ? buildMatchLabel(opponentName, matchLocation) : label || fileName,
        type,
        trainingType: type === 'training' ? trainingType : undefined,
        matchResult: type === 'match' ? matchResult : undefined,
        matchLocation: type === 'match' ? matchLocation : undefined,
        opponentName: type === 'match' ? opponentName.trim() : undefined,
      })
      setStaged(result)
      const allPlayers = await listPlayers()
      const involvedIds = new Set(result.segments.map((s) => s.playerId))
      setPlayers(allPlayers.filter((p) => involvedIds.has(p.id)))
      setMissingPlayers(
        allPlayers
          .filter((p) => p.active && !involvedIds.has(p.id))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      )
      // The choices differ between training and match, so start over whenever the session is re-staged.
      setStatusByPlayerId({})
      setStep('rpe')
    } catch (err) {
      if (err instanceof CsvImportError) {
        setFileError(err.message)
        setStep('select')
      } else {
        setFileError(err instanceof Error ? err.message : 'Errore imprevisto durante la lettura del CSV.')
        setStep('select')
      }
    }
  }

  const unresolvedMissing = missingPlayers.filter((p) => !statusByPlayerId[p.id]).length

  async function handleFinish() {
    if (!staged || unresolvedMissing > 0) return
    setSaving(true)
    setSaveError(null)
    try {
      if (mode === 'existing') {
        await commitIntoSession(staged, rpeByPlayerId, markOtherTeam)
        invalidate()
        setCurrentSessionId(staged.sessionId)
        setStep('done')
        return
      }
      const session = await commitImport(
        staged,
        rpeByPlayerId,
        missingPlayers.map((p) => ({ playerId: p.id, status: statusByPlayerId[p.id] })),
      )
      invalidate()
      setCurrentSessionId(session.id)
      setStep('done')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Errore imprevisto durante il salvataggio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <StepHeader step={step} mode={mode} />

      {step === 'select' && (
        <FileDropZone onFile={handleFile} error={fileError} />
      )}

      {step === 'metadata' && (
        <div className="flex flex-col gap-4 panel p-5">
          <p className="text-sm text-ink-secondary">
            File: <span className="font-medium text-ink">{fileName}</span> — il CSV non contiene data/etichetta, indicale qui.
          </p>
          <div className="flex flex-col gap-2 text-sm" role="radiogroup" aria-label="Dove importare">
            {IMPORT_MODES.map(({ value, title, hint }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${mode === value ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <input type="radio" name="import-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-primary" />
                <span>
                  <span className="font-medium text-ink">{title}</span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Data sessione</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-border bg-page px-3 py-2 text-ink"
            />
          </label>
          {mode === 'existing' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Sessione</span>
              {sessionsOnDate.length === 0 ? (
                <span className="text-xs text-status-serious">Nessuna sessione importata in questa data: importa prima quella della squadra.</span>
              ) : (
                <select
                  value={target?.id ?? ''}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="rounded-md border border-border bg-page px-3 py-2 text-ink"
                >
                  {!target && <option value="">— Scegli —</option>}
                  {sessionsOnDate.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionOptionLabel(s)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          {mode === 'new' && type === 'training' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Etichetta</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="es. Allenamento martedì"
                className="rounded-md border border-border bg-page px-3 py-2 text-ink"
              />
            </label>
          )}
          {mode === 'new' && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SessionType)}
              className="rounded-md border border-border bg-page px-3 py-2 text-ink"
            >
              <option value="training">Allenamento</option>
              <option value="match">Partita</option>
            </select>
          </label>
          )}
          {mode === 'new' && type === 'training' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Tipologia allenamento</span>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value as TrainingType)}
                className="rounded-md border border-border bg-page px-3 py-2 text-ink"
              >
                {TRAINING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRAINING_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-muted">
                Usata in Session v Session per confrontare allenamenti dello stesso tipo.
              </span>
            </label>
          )}
          {mode === 'new' && type === 'match' && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Avversario</span>
                <input
                  type="text"
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  placeholder="es. Juventus"
                  className="rounded-md border border-border bg-page px-3 py-2 text-ink"
                />
                <span className="text-xs text-ink-muted">
                  Etichetta generata:{' '}
                  <span className="font-medium text-ink">
                    {opponentName.trim() ? buildMatchLabel(opponentName, matchLocation) : '—'}
                  </span>
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Esito</span>
                <select
                  value={matchResult}
                  onChange={(e) => setMatchResult(e.target.value as MatchResult)}
                  className="rounded-md border border-border bg-page px-3 py-2 text-ink"
                >
                  {MATCH_RESULTS.map((r) => (
                    <option key={r} value={r}>
                      {MATCH_RESULT_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Sede</span>
                <select
                  value={matchLocation}
                  onChange={(e) => setMatchLocation(e.target.value as MatchLocation)}
                  className="rounded-md border border-border bg-page px-3 py-2 text-ink"
                >
                  {MATCH_LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {MATCH_LOCATION_LABEL[l]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink-muted">
                  Usate in Game v Game per confrontare partite dello stesso esito o della stessa sede.
                </span>
              </label>
            </>
          )}
          {formError && <p className="text-sm text-status-critical">{formError}</p>}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep('select')}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-ink-secondary hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" /> Indietro
            </button>
            <button
              type="button"
              onClick={handleMetadataSubmit}
              className="flex items-center gap-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Continua <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'players' && target && (
        <div className="flex flex-col gap-4 panel p-5">
          <p className="text-sm text-ink-secondary">
            Scegli chi importare in <span className="font-medium text-ink">{sessionOptionLabel(target)}</span> del {target.date}. Sono
            preselezionati i giocatori della tua rosa che non hanno ancora dati in quella sessione.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectedNames(new Set(csvNames.filter((n) => n.player?.active && !n.inTarget).map((n) => n.name)))}
              className="rounded-md border border-border px-2 py-0.5 text-ink-secondary hover:bg-ink/5 hover:text-ink"
            >
              Solo la mia rosa
            </button>
            <button
              type="button"
              onClick={() => setSelectedNames(new Set())}
              className="rounded-md border border-border px-2 py-0.5 text-ink-secondary hover:bg-ink/5 hover:text-ink"
            >
              Nessuno
            </button>
          </div>
          <div className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto">
            {csvNames.map((n) => {
              const checked = selectedNames.has(n.name)
              const note = !n.player
                ? 'non in rosa: verrà aggiunto'
                : !n.player.active
                  ? 'giocatore non attivo'
                  : n.inTarget
                    ? 'ha già dati in questa sessione: verranno sostituiti'
                    : null
              return (
                <label key={n.name} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedNames((prev) => {
                        const next = new Set(prev)
                        if (checked) next.delete(n.name)
                        else next.add(n.name)
                        return next
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  <span className="text-ink">{n.player?.displayName ?? n.name}</span>
                  {note && <span className={`text-xs ${checked && n.inTarget ? 'text-status-serious' : 'text-ink-muted'}`}>{note}</span>}
                </label>
              )
            })}
          </div>
          {formError && <p className="text-sm text-status-critical">{formError}</p>}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep('metadata')}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-ink-secondary hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" /> Indietro
            </button>
            <button
              type="button"
              disabled={selectedNames.size === 0}
              onClick={handlePlayersSubmit}
              className="flex items-center gap-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              Continua con {selectedNames.size} <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'rpe' && staged && (
        <div className="flex flex-col gap-4">
          {staged.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-ink-secondary">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
              <div>
                <p className="font-medium text-ink">{staged.warnings.length} avvisi durante l'import</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {staged.warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {staged.warnings.length > 8 && <li>… e altri {staged.warnings.length - 8}</li>}
                </ul>
              </div>
            </div>
          )}

          {mode === 'existing' ? (
            <label className="panel flex items-start gap-2 p-4 text-sm">
              <input type="checkbox" checked={markOtherTeam} onChange={(e) => setMarkOtherTeam(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-medium text-ink">Si sono allenati con un'altra squadra</span>
                <span className="block text-xs text-ink-muted">
                  Restano presenti alla sessione; nella griglia presenze il loro P viene evidenziato come "con altra squadra".
                </span>
              </span>
            </label>
          ) : (
          <AttendancePanel
            sessionType={staged.metadata.type}
            segments={staged.segments}
            players={players}
            missingPlayers={missingPlayers}
            statusByPlayerId={statusByPlayerId}
            onChange={(playerId, status) => setStatusByPlayerId((prev) => ({ ...prev, [playerId]: status }))}
            onSetAll={(status) =>
              setStatusByPlayerId((prev) => ({
                ...prev,
                ...Object.fromEntries(missingPlayers.filter((p) => !prev[p.id]).map((p) => [p.id, status])),
              }))
            }
          />
          )}

          <div className="panel p-5">
            <p className="mb-3 text-sm text-ink-secondary">
              RPE opzionale (scala 1-10) per calcolare il Training Load (RPE × minuti) — puoi saltare e inserirlo più tardi.
            </p>
            <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {players.map((p) => (
                <label key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink">{p.displayName}</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rpeByPlayerId[p.id] ?? ''}
                    onChange={(e) =>
                      setRpeByPlayerId((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                    }
                    className="w-16 rounded-md border border-border bg-page px-2 py-1 text-right tabular-nums text-ink"
                  />
                </label>
              ))}
            </div>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 rounded-md border border-status-critical/40 bg-status-critical/10 p-3 text-sm text-status-critical">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Salvataggio non riuscito</p>
                <p className="text-xs">{saveError}</p>
              </div>
            </div>
          )}

          {unresolvedMissing > 0 && (
            <p className="text-right text-xs text-status-serious">
              Indica la situazione di {unresolvedMissing === 1 ? '1 giocatore' : `${unresolvedMissing} giocatori`} senza dati
              GPS per salvare.
            </p>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(mode === 'existing' ? 'players' : 'metadata')}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-ink-secondary hover:bg-ink/5"
            >
              <ArrowLeft className="size-4" /> Indietro
            </button>
            <button
              type="button"
              disabled={saving || unresolvedMissing > 0}
              onClick={handleFinish}
              className="flex items-center gap-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Salvataggio…' : saveError ? 'Riprova' : mode === 'existing' ? 'Aggiungi alla sessione' : 'Salva sessione'}{' '}
              <Check className="size-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 panel p-8 text-center">
          <Check className="size-8 text-status-good" />
          <p className="text-base font-medium text-ink">{mode === 'existing' ? 'Giocatori aggiunti alla sessione' : 'Sessione importata'}</p>
          <p className="text-sm text-ink-secondary">
            {staged?.rawRowCount} righe elaborate, {staged?.warnings.length ?? 0} avvisi.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Vai alla dashboard
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Who was there: GPS rows say Present (or Rehab, from the drill title); every active roster
 * player missing from the export needs a reason picked by the editor.
 */
function AttendancePanel({
  sessionType,
  segments,
  players,
  missingPlayers,
  statusByPlayerId,
  onChange,
  onSetAll,
}: {
  sessionType: SessionType
  segments: StagedImport['segments']
  players: Player[]
  missingPlayers: Player[]
  statusByPlayerId: Record<string, PlayerSessionStatus>
  onChange: (playerId: string, status: PlayerSessionStatus) => void
  /** Fills only the players not chosen yet. */
  onSetAll: (status: PlayerSessionStatus) => void
}) {
  const options = MISSING_PLAYER_STATUSES[sessionType]
  const rehabIds = new Set(
    sessionType === 'training'
      ? segments.filter((s) => s.segmentKind === 'full_session' && s.isRehab).map((s) => s.playerId)
      : [],
  )
  const nameById = new Map(players.map((p) => [p.id, p.displayName]))
  const rehabNames = [...rehabIds].map((id) => nameById.get(id) ?? id)
  // From the export itself — a first-time player isn't in the roster yet but is still present.
  const presentCount = new Set(segments.map((s) => s.playerId)).size - rehabIds.size

  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">Presenze</span>
        <span className="rounded-full bg-status-good/15 px-2 py-0.5 text-xs font-medium text-status-good">
          {presentCount} {presentCount === 1 ? 'presente' : 'presenti'}
        </span>
        {rehabNames.length > 0 && (
          <span className="rounded-full bg-status-critical/15 px-2 py-0.5 text-xs font-medium text-status-critical">
            {rehabNames.length} Rehab: {rehabNames.join(', ')}
          </span>
        )}
        <span className="text-xs text-ink-muted">dai dati GPS</span>
      </div>

      {missingPlayers.length === 0 ? (
        <p className="text-xs text-ink-muted">Tutti i giocatori attivi del roster hanno dati GPS in questa sessione.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink-secondary">
              {missingPlayers.length === 1 ? '1 giocatore attivo' : `${missingPlayers.length} giocatori attivi`} senza
              dati GPS: indica la situazione.
            </p>
            <span className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
              Imposta i rimanenti:
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onSetAll(o)}
                  className="rounded-md border border-border px-2 py-0.5 text-ink-secondary hover:bg-ink/5 hover:text-ink"
                >
                  {PLAYER_STATUS_LABEL[o]}
                </button>
              ))}
            </span>
          </div>
          <div className="flex max-h-80 flex-col divide-y divide-border/60 overflow-y-auto">
            {missingPlayers.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className={`text-sm ${statusByPlayerId[p.id] ? 'text-ink' : 'font-medium text-status-serious'}`}>
                  {p.displayName}
                </span>
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Situazione di ${p.displayName}`}>
                  {options.map((o) => {
                    const selected = statusByPlayerId[p.id] === o
                    return (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(p.id, o)}
                        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-ink-secondary hover:bg-ink/5 hover:text-ink'
                        }`}
                      >
                        {PLAYER_STATUS_LABEL[o]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StepHeader({ step, mode }: { step: Step; mode: Mode }) {
  const steps: { key: Step; label: string }[] =
    mode === 'existing'
      ? [
          { key: 'select', label: 'File' },
          { key: 'metadata', label: 'Sessione' },
          { key: 'players', label: 'Giocatori' },
          { key: 'rpe', label: 'RPE' },
          { key: 'done', label: 'Fatto' },
        ]
      : [
          { key: 'select', label: 'File' },
          { key: 'metadata', label: 'Sessione' },
          { key: 'rpe', label: 'Presenze e RPE' },
          { key: 'done', label: 'Fatto' },
        ]
  const currentIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={
              i <= currentIndex
                ? 'flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink'
                : 'flex size-5 items-center justify-center rounded-full border border-border'
            }
          >
            {i + 1}
          </span>
          <span className={i === currentIndex ? 'text-ink' : ''}>{s.label}</span>
          {i < steps.length - 1 && <span className="mx-1 text-border">—</span>}
        </div>
      ))}
    </div>
  )
}

function FileDropZone({ onFile, error }: { onFile: (file: File) => void; error: string | null }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
        dragOver ? 'border-accent bg-accent/5' : 'border-border'
      }`}
    >
      <Upload className="size-8 text-ink-muted" strokeWidth={1.5} />
      <p className="text-sm font-medium text-ink">Trascina qui il CSV della sessione</p>
      <p className="text-xs text-ink-secondary">oppure</p>
      <label className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
        Scegli file
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </label>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-status-critical">
          <AlertTriangle className="size-4" /> {error}
        </p>
      )}
    </div>
  )
}
