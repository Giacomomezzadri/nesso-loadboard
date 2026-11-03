import type { Player, PlayerAlias } from '../../types/domain'

/**
 * Order-, case-, accent- and spacing-insensitive form of a person's name, so the same player
 * spelled by two systems compares equal: "AZZALI LEONARDO", "Leonardo  Azzali " and
 * "Leonardo Azzalì" all become "azzali leonardo".
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

export type NameMatch =
  | { status: 'alias'; playerId: string }
  | { status: 'name'; playerId: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'none' }

/**
 * Resolves an externally spelled name to a roster player: a saved hand-made pairing wins,
 * then a unique normalized-name match. Two roster players with the same normalized name are
 * reported as ambiguous rather than guessed. Never creates a player.
 */
export function buildNameMatcher(players: Player[], aliases: PlayerAlias[]): (name: string) => NameMatch {
  const playerIds = new Set(players.map((p) => p.id))
  const aliasByKey = new Map(aliases.filter((a) => playerIds.has(a.playerId)).map((a) => [a.aliasKey, a.playerId]))
  const playersByKey = new Map<string, string[]>()
  for (const p of players) {
    const key = nameKey(p.displayName)
    playersByKey.set(key, [...(playersByKey.get(key) ?? []), p.id])
  }

  return (name) => {
    const key = nameKey(name)
    const aliased = aliasByKey.get(key)
    if (aliased) return { status: 'alias', playerId: aliased }
    const candidates = playersByKey.get(key) ?? []
    if (candidates.length === 1) return { status: 'name', playerId: candidates[0] }
    if (candidates.length > 1) return { status: 'ambiguous', candidates }
    return { status: 'none' }
  }
}
