import { isValidSleepHours, isValidWellnessScore, romeTodayIso, WELLNESS_ITEMS, WELLNESS_NOTE_MAX } from '../../src/lib/metrics/wellness'
import type { Env } from '../_lib/mappers'
import {
  ensureWellnessTables,
  invalidLinkPage,
  WELLNESS_FORM_PREFIX,
  wellnessErrorPage,
  wellnessFormPage,
  wellnessThanksPage,
} from '../_lib/wellness'

/**
 * PUBLIC — the athletes' morning questionnaire, reached from the team link /q/<token> with no
 * login (see _middleware.ts). The token is the only credential: it resolves to a workspace,
 * and the form can only list that workspace's active players and write wellness answers for
 * them — nothing else in the app is reachable from here.
 */

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/
const DATE_LABEL = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

async function workspaceForToken(env: Env, token: string): Promise<string | null> {
  if (!TOKEN_SHAPE.test(token)) return null
  await ensureWellnessTables(env)
  const row = await env.DB.prepare('SELECT workspace_id FROM wellness_links WHERE token = ?').bind(token).first<{ workspace_id: string }>()
  return row?.workspace_id ?? null
}

async function activePlayers(env: Env, workspaceId: string): Promise<{ id: string; name: string }[]> {
  const { results } = await env.DB.prepare('SELECT id, display_name FROM players WHERE workspace_id = ? AND active = 1 ORDER BY display_name')
    .bind(workspaceId)
    .all<{ id: string; display_name: string }>()
  return results.map((r) => ({ id: r.id, name: r.display_name }))
}

const dateLabel = (iso: string) => DATE_LABEL.format(new Date(iso + 'T00:00:00Z'))

export const onRequestGet: PagesFunction<Env, 'token'> = async ({ env, params }) => {
  const token = String(params.token)
  const workspaceId = await workspaceForToken(env, token)
  if (!workspaceId) return invalidLinkPage()
  return wellnessFormPage({
    formAction: WELLNESS_FORM_PREFIX + token,
    players: await activePlayers(env, workspaceId),
    dateLabel: dateLabel(romeTodayIso()),
  })
}

export const onRequestPost: PagesFunction<Env, 'token'> = async ({ request, env, params }) => {
  const token = String(params.token)
  const formAction = WELLNESS_FORM_PREFIX + token
  const workspaceId = await workspaceForToken(env, token)
  if (!workspaceId) return invalidLinkPage()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return wellnessErrorPage('Invio non valido, riprova.', formAction)
  }

  const playerId = String(form.get('player') ?? '')
  const player = (await activePlayers(env, workspaceId)).find((p) => p.id === playerId)
  if (!player) return wellnessErrorPage('Scegli il tuo nome dalla lista.', formAction)

  const scores: number[] = []
  for (const item of WELLNESS_ITEMS) {
    const value = Number(form.get(item.key))
    if (!isValidWellnessScore(value)) return wellnessErrorPage(`Rispondi a tutte le domande (manca "${item.label}").`, formAction)
    scores.push(value)
  }
  const rawHours = String(form.get('sleep_hours') ?? '').trim().replace(',', '.')
  const sleepHours = rawHours === '' ? NaN : Number(rawHours)
  if (!isValidSleepHours(sleepHours)) return wellnessErrorPage('Indica quante ore hai dormito (da 0 a 16).', formAction)
  const note = String(form.get('note') ?? '').trim().slice(0, WELLNESS_NOTE_MAX) || null

  const date = romeTodayIso()
  await env.DB.prepare(
    `INSERT INTO wellness_entries (workspace_id, player_id, date, ${WELLNESS_ITEMS.map((i) => i.key).join(', ')}, sleep_hours, note, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, player_id, date) DO UPDATE SET
       ${WELLNESS_ITEMS.map((i) => `${i.key} = excluded.${i.key}`).join(', ')},
       sleep_hours = excluded.sleep_hours, note = excluded.note, submitted_at = excluded.submitted_at`,
  )
    .bind(workspaceId, player.id, date, ...scores, Math.round(sleepHours * 2) / 2, note, new Date().toISOString())
    .run()

  // Post/Redirect/Get would need a second public route; a plain page is fine here — a
  // refresh at worst re-sends the same answers, which overwrite themselves.
  return wellnessThanksPage({ playerName: player.name, dateLabel: dateLabel(date), formAction })
}
