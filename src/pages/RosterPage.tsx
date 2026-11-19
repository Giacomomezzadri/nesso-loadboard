import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, UserPlus, Users } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { putPlayer, upsertPlayerByName } from '../lib/db/repo'
import { matchAvailableSeconds, matchSecondsByPlayer } from '../lib/metrics/attendance'
import { evaluatePlayerPb } from '../lib/metrics/pb'
import { formatFraction, formatNumber, slugifyName } from '../lib/utils'
import type { Player, Position } from '../types/domain'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../state/AuthContext'
import { queryKeys, useAllSegmentsQuery, usePlayersQuery, useSessionsQuery } from '../state/queries'

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD', 'UNSPECIFIED']

const POSITION_LABEL: Record<Position, string> = {
  GK: 'Portiere',
  DEF: 'Difensore',
  MID: 'Centrocampista',
  FWD: 'Attaccante',
  UNSPECIFIED: 'Non assegnato',
}

/** Only NN.NNN — up to 2 integer digits and up to 3 decimal digits, typed freely (no spinner). */
const SPRINT_TIME_PATTERN = /^\d{0,2}(\.\d{0,3})?$/

function SprintTimeCell({
  value,
  canEdit,
  onConfirm,
}: {
  value: number | undefined
  canEdit: boolean
  onConfirm: (value: number | undefined) => void
}) {
  const [draft, setDraft] = useState(value !== undefined ? value.toFixed(3) : '')

  // Stay in sync if the row's value changes from elsewhere (e.g. another tab/device).
  useEffect(() => {
    setDraft(value !== undefined ? value.toFixed(3) : '')
  }, [value])

  const confirm = () => {
    if (draft.trim() === '') {
      onConfirm(undefined)
      return
    }
    const parsed = Number(draft)
    if (!Number.isNaN(parsed)) onConfirm(parsed)
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.000"
        disabled={!canEdit}
        value={draft}
        onChange={(e) => {
          if (SPRINT_TIME_PATTERN.test(e.target.value)) setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm()
        }}
        className="w-20 rounded-md border border-border bg-page px-2 py-1 text-right tabular-nums text-sm text-ink disabled:opacity-60"
      />
      {canEdit && (
        <button
          type="button"
          onClick={confirm}
          aria-label="Conferma il valore"
          title="Conferma il valore"
          className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-ink-secondary hover:bg-ink/5"
        >
          <Check className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Adds a player by hand — for someone who has no GPS session yet (new signing, injured,
 * goalkeeper without a vest) but should already appear e.g. in the wellness form. The id is
 * derived from the name exactly like a CSV import does, so a later GPS export with the same
 * spelling lands on this same player instead of creating a duplicate.
 */
function AddPlayerForm({ players }: { players: Player[] }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [position, setPosition] = useState<Position>('UNSPECIFIED')
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)

  const add = useMutation({
    mutationFn: async ({ name, position }: { name: string; position: Position }) => {
      const player = await upsertPlayerByName(name)
      if (position !== 'UNSPECIFIED') await putPlayer({ ...player, position })
      return player
    },
    onSuccess: (player) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.players })
      setMessage({ tone: 'good', text: `${player.displayName} aggiunto al roster.` })
      setName('')
      setPosition('UNSPECIFIED')
    },
    onError: () => setMessage({ tone: 'bad', text: 'Aggiunta non riuscita, riprova.' }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim().replace(/\s+/g, ' ')
    const slug = slugifyName(trimmed)
    if (!slug) {
      setMessage({ tone: 'bad', text: 'Il nome deve contenere almeno una lettera o una cifra.' })
      return
    }
    // Same rule as the import: same name up to case/spaces/accents = same player.
    const existing = players.find((p) => slugifyName(p.displayName) === slug)
    if (existing) {
      setMessage({
        tone: 'bad',
        text: existing.active
          ? `${existing.displayName} è già nel roster.`
          : `${existing.displayName} è già nel roster ma non è attivo: riattivalo dalla tabella.`,
      })
      return
    }
    setMessage(null)
    add.mutate({ name: trimmed, position })
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-2 p-4">
      <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
        <UserPlus className="size-4 text-primary" />
        Aggiungi giocatore
      </p>
      <p className="text-xs text-ink-muted">
        Scrivi il nome come compare nell'export GPS, così i dati importati in futuro si agganciano a questo giocatore invece di crearne un doppione.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome e cognome"
          aria-label="Nome del giocatore"
          maxLength={80}
          className="min-w-0 flex-1 rounded-md border border-border bg-page px-3 py-2 text-sm text-ink sm:max-w-xs"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          aria-label="Posizione"
          className="rounded-md border border-border bg-page px-2 py-2 text-sm text-ink"
        >
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={add.isPending || !name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {add.isPending ? 'Aggiungo…' : 'Aggiungi'}
        </button>
      </div>
      {message && <p className={message.tone === 'good' ? 'text-sm text-status-good' : 'text-sm text-status-critical'}>{message.text}</p>}
    </form>
  )
}

export function RosterPage() {
  const { data: players = [], isLoading } = usePlayersQuery()
  const { canEdit } = useAuth()
  const queryClient = useQueryClient()
  const { data: sessions = [] } = useSessionsQuery()
  const { data: segments = [] } = useAllSegmentsQuery()

  const updatePlayer = useMutation({
    mutationFn: (player: Player) => putPlayer(player),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.players }),
  })

  if (isLoading) return null

  // Whole season, this workspace's own matches — same figures as the Player Profile tile.
  const matchSeconds = matchSecondsByPlayer(sessions, segments)
  const availableMatchSec = matchAvailableSeconds(sessions, segments)

  if (players.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {canEdit && <AddPlayerForm players={players} />}
        <EmptyState
          icon={Users}
          title="Nessun giocatore ancora"
          description="I giocatori vengono creati automaticamente al primo import di un CSV, oppure puoi aggiungerli a mano qui sopra."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <AddPlayerForm players={players} />}
      <p className="text-sm text-ink-secondary">
        {players.length} giocatori. La posizione alimenta i raggruppamenti nelle pagine Drills e Session v Session.
      </p>

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Giocatore</th>
              <th className="px-4 py-2">Posizione</th>
              <th className="px-4 py-2">Altezza (cm)</th>
              <th className="px-4 py-2">Peso (kg)</th>
              <th className="px-4 py-2">Vmax personale</th>
              <th className="px-4 py-2">Sprint 10m (s)</th>
              <th className="px-4 py-2">Sprint 30m (s)</th>
              <th className="px-4 py-2 text-right">Minuti partita</th>
              <th className="px-4 py-2">Attivo</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-ink">{player.displayName}</td>
                <td className="px-4 py-2">
                  <select
                    value={player.position}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updatePlayer.mutate({
                        ...player,
                        position: e.target.value as Position,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="rounded-md border border-border bg-page px-2 py-1 text-sm text-ink disabled:opacity-60"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {POSITION_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={player.heightCm ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updatePlayer.mutate({
                        ...player,
                        heightCm: e.target.value === '' ? undefined : Number(e.target.value),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-20 rounded-md border border-border bg-page px-2 py-1 text-right tabular-nums text-sm text-ink disabled:opacity-60"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={player.weightKg ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updatePlayer.mutate({
                        ...player,
                        weightKg: e.target.value === '' ? undefined : Number(e.target.value),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-20 rounded-md border border-border bg-page px-2 py-1 text-right tabular-nums text-sm text-ink disabled:opacity-60"
                  />
                </td>
                <td className="px-4 py-2">
                  {player.personalMaxSpeedKmh === undefined ? (
                    <span className="text-xs text-ink-muted">—</span>
                  ) : (
                    (() => {
                      const evaluation = evaluatePlayerPb(player, player.personalMaxSpeedKmh)
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="tabular-nums text-ink">{player.personalMaxSpeedKmh.toFixed(2)} km/h</span>
                          {evaluation.status === 'ok' ? (
                            <span className="rounded-full bg-status-good/15 px-2 py-0.5 font-medium text-status-good">
                              Confermato
                            </span>
                          ) : canEdit ? (
                            <button
                              type="button"
                              title={evaluation.message}
                              onClick={() => updatePlayer.mutate({ ...player, pbConfirmed: true })}
                              className="flex items-center gap-1 rounded-full bg-status-warning/20 px-2 py-0.5 font-medium text-ink hover:opacity-80"
                            >
                              <Check className="size-3" /> Conferma
                            </button>
                          ) : (
                            <span
                              title={evaluation.message}
                              className="rounded-full bg-status-warning/20 px-2 py-0.5 font-medium text-ink"
                            >
                              Da confermare
                            </span>
                          )}
                        </div>
                      )
                    })()
                  )}
                </td>
                <td className="px-4 py-2">
                  <SprintTimeCell
                    value={player.sprint10mSec}
                    canEdit={canEdit}
                    onConfirm={(v) =>
                      updatePlayer.mutate({ ...player, sprint10mSec: v, updatedAt: new Date().toISOString() })
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <SprintTimeCell
                    value={player.sprint30mSec}
                    canEdit={canEdit}
                    onConfirm={(v) =>
                      updatePlayer.mutate({ ...player, sprint30mSec: v, updatedAt: new Date().toISOString() })
                    }
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-ink">
                  {availableMatchSec > 0
                    ? formatFraction((matchSeconds.get(player.id) ?? 0) / 60, availableMatchSec / 60, '′')
                    : `${formatNumber((matchSeconds.get(player.id) ?? 0) / 60)}′`}
                  {availableMatchSec > 0 && (
                    <span className="ml-1 text-xs text-ink-muted">
                      {formatNumber(((matchSeconds.get(player.id) ?? 0) / availableMatchSec) * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={player.active}
                    disabled={!canEdit}
                    onChange={(e) =>
                      updatePlayer.mutate({
                        ...player,
                        active: e.target.checked,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="size-4 accent-accent disabled:opacity-60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
