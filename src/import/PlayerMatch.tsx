import { Link2 } from 'lucide-react'
import type { NameMatch } from '../lib/csv/matchPlayerNames'
import { cn } from '../lib/utils'
import type { Player, PlayerAlias } from '../types/domain'

/**
 * Shared pieces of the imports that pair names spelled by another system (ForceDecks,
 * the ISAK sheet…) to roster players: the picker, the status badge and the pairings to
 * remember for next time.
 */

const MATCH_BADGE: Record<NameMatch['status'], { label: string; className: string }> = {
  name: { label: 'Trovato', className: 'bg-status-good/15 text-status-good' },
  alias: { label: 'Abbinamento salvato', className: 'bg-primary/10 text-primary' },
  ambiguous: { label: 'Più giocatori', className: 'bg-status-warning/20 text-ink' },
  none: { label: 'Da abbinare', className: 'bg-status-serious/20 text-ink' },
}

export interface MatchedName {
  /** nameKey() of the name as spelled in the file. */
  key: string
  match: NameMatch
}

/** The player the automatic match found, or '' when a hand pick is needed. */
export function autoPlayerId(row: MatchedName): string {
  return row.match.status === 'name' || row.match.status === 'alias' ? row.match.playerId : ''
}

/** Every pairing a plain name match wouldn't find on its own next time. */
export function aliasesToRemember(rows: MatchedName[], chosenPlayerId: (row: MatchedName) => string): PlayerAlias[] {
  return rows.flatMap((r) => {
    const playerId = chosenPlayerId(r)
    if (!playerId) return []
    if ((r.match.status === 'name' || r.match.status === 'alias') && r.match.playerId === playerId) return []
    return [{ aliasKey: r.key, playerId }]
  })
}

export function PlayerSelect({ players, value, onChange }: { players: Player[]; value: string; onChange: (playerId: string) => void }) {
  const byName = (a: Player, b: Player) => a.displayName.localeCompare(b.displayName)
  const active = players.filter((p) => p.active).sort(byName)
  const inactive = players.filter((p) => !p.active).sort(byName)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('w-full min-w-44 rounded-md border bg-surface px-2 py-1 text-sm text-ink', value ? 'border-border' : 'border-status-serious/60')}
    >
      <option value="">— Non importare —</option>
      <optgroup label="Attivi">
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </optgroup>
      {inactive.length > 0 && (
        <optgroup label="Non attivi">
          {inactive.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

/** "Trovato" / "Da abbinare" / …, or the hand-made outcome when the pick differs from the automatic one. */
export function MatchBadge({ row, chosen, picked }: { row: MatchedName; chosen: string; picked: boolean }) {
  const manual = picked && chosen !== autoPlayerId(row)
  const badge = manual
    ? chosen
      ? { label: 'Abbinato a mano', className: 'bg-primary/10 text-primary' }
      : { label: 'Non importato', className: 'bg-ink/8 text-ink-muted' }
    : MATCH_BADGE[row.match.status]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>
      {(manual || row.match.status === 'alias') && chosen && <Link2 className="size-3" />}
      {badge.label}
    </span>
  )
}
