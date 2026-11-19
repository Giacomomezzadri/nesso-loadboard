import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Copy, Link2, MessageCircle, Moon, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TrendLine } from '../components/charts/TrendLine'
import { StatTile } from '../components/ui/StatTile'
import { disableWellnessLink, regenerateWellnessLink } from '../lib/db/repo'
import { cn, formatNumber } from '../lib/utils'
import {
  addDaysIso,
  assessWellness,
  BASELINE_DAYS,
  MIN_BASELINE_ENTRIES,
  romeTodayIso,
  WELLNESS_FACES,
  WELLNESS_ITEMS,
  wellnessTotal,
  type ItemAssessment,
  type WellnessLevel,
} from '../lib/metrics/wellness'
import { useAuth } from '../state/AuthContext'
import { queryKeys, usePlayersQuery, useWellnessLinkQuery, useWellnessQuery } from '../state/queries'

const LEVEL_CELL: Record<WellnessLevel, string> = {
  ok: '',
  warning: 'bg-status-warning/20',
  critical: 'bg-status-critical/15 text-status-critical',
}
const LEVEL_ORDER: Record<WellnessLevel, number> = { critical: 0, warning: 1, ok: 2 }

const DAY_LABEL = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const SHORT_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmt = (f: Intl.DateTimeFormat, iso: string) => f.format(new Date(iso + 'T00:00:00Z'))

function ScoreCell({ a }: { a: ItemAssessment }) {
  return (
    <td className={cn('px-2 py-2 text-center tabular-nums', LEVEL_CELL[a.level])}>
      <span aria-hidden className="mr-1">{WELLNESS_FACES[a.value - 1]}</span>
      <span className="font-semibold">{a.value}</span>
    </td>
  )
}

function LinkPanel() {
  const { canEdit } = useAuth()
  const queryClient = useQueryClient()
  const { data: link, isLoading } = useWellnessLinkQuery()
  const [copied, setCopied] = useState(false)
  const url = link ? `${window.location.origin}/q/${link.token}` : ''

  const regenerate = useMutation({
    mutationFn: regenerateWellnessLink,
    onSuccess: (l) => queryClient.setQueryData(queryKeys.wellnessLink, l),
  })
  const disable = useMutation({
    mutationFn: disableWellnessLink,
    onSuccess: () => queryClient.setQueryData(queryKeys.wellnessLink, null),
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copia il link:', url)
    }
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Questionario wellness del mattino — compilalo appena sveglio: ${url}`)}`

  if (isLoading) return null

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
        <Link2 className="size-4 text-primary" />
        Link per gli atleti
      </p>
      {link ? (
        <>
          <p className="text-sm text-ink-secondary">
            Un solo link per tutta la squadra: ogni atleta lo apre dal telefono, sceglie il proprio nome e risponde. Nessun login.
            Mandalo una volta sul gruppo e tienilo fissato.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-border bg-page px-3 py-2 text-sm text-ink"
              aria-label="Link del questionario"
            />
            <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm">
              {copied ? <Check className="size-4 text-status-good" /> : <Copy className="size-4" />}
              {copied ? 'Copiato' : 'Copia'}
            </button>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-ink">
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                className="flex items-center gap-1 text-ink-secondary underline-offset-2 hover:underline"
                disabled={regenerate.isPending}
                onClick={() => {
                  if (window.confirm('Generare un nuovo link? Quello attuale smetterà subito di funzionare.')) regenerate.mutate()
                }}
              >
                <RefreshCw className="size-3.5" />
                Genera un nuovo link
              </button>
              <button
                type="button"
                className="text-status-critical underline-offset-2 hover:underline"
                disabled={disable.isPending}
                onClick={() => {
                  if (window.confirm('Disattivare il link? Gli atleti non potranno più compilare finché non ne crei uno nuovo.')) disable.mutate()
                }}
              >
                Disattiva
              </button>
            </div>
          )}
        </>
      ) : canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-secondary">Crea il link da mandare alla squadra: gli atleti compilano il questionario dal telefono, senza account.</p>
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
          >
            Crea link
          </button>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Nessun link attivo. Può crearlo solo un Editor.</p>
      )}
      {(regenerate.isError || disable.isError) && <p className="text-sm text-status-critical">Operazione non riuscita, riprova.</p>}
    </section>
  )
}

export function WellnessPage() {
  const { data: entries = [], isLoading } = useWellnessQuery()
  const { data: players = [] } = usePlayersQuery()
  const today = romeTodayIso()
  const [date, setDate] = useState(today)

  const activePlayers = useMemo(() => players.filter((p) => p.active), [players])
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const activeIds = useMemo(() => new Set(activePlayers.map((p) => p.id)), [activePlayers])

  const rows = useMemo(
    () =>
      entries
        .filter((e) => e.date === date && activeIds.has(e.playerId))
        .map((e) => assessWellness(e, entries))
        .sort(
          (a, b) =>
            LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
            a.total.value - b.total.value ||
            (playerById.get(a.entry.playerId)?.displayName ?? '').localeCompare(playerById.get(b.entry.playerId)?.displayName ?? ''),
        ),
    [entries, date, activeIds, playerById],
  )
  const answered = new Set(rows.map((r) => r.entry.playerId))
  const missing = activePlayers.filter((p) => !answered.has(p.id))
  const flagged = rows.filter((r) => r.level !== 'ok').length
  const teamMean = rows.length ? rows.reduce((s, r) => s + r.total.value, 0) / rows.length : undefined

  const trend = useMemo(() => {
    const points = []
    for (let i = BASELINE_DAYS - 1; i >= 0; i--) {
      const d = addDaysIso(date, -i)
      const day = entries.filter((e) => e.date === d && activeIds.has(e.playerId))
      if (day.length) points.push({ x: fmt(SHORT_DATE, d), value: day.reduce((s, e) => s + wellnessTotal(e), 0) / day.length })
    }
    return points
  }, [entries, date, activeIds])

  if (isLoading) return null

  return (
    <div className="flex flex-col gap-6">
      <LinkPanel />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Giorno precedente" onClick={() => setDate(addDaysIso(date, -1))} className="rounded-md border border-border p-2">
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink"
        />
        <button
          type="button"
          aria-label="Giorno successivo"
          disabled={date >= today}
          onClick={() => setDate(addDaysIso(date, 1))}
          className="rounded-md border border-border p-2 disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="text-sm capitalize text-ink-secondary">{fmt(DAY_LABEL, date)}</span>
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="text-sm text-primary underline-offset-2 hover:underline">
            Oggi
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Hanno risposto" value={`${rows.length}/${activePlayers.length}`} />
        <StatTile label="Wellness medio squadra" value={teamMean === undefined ? '—' : formatNumber(teamMean, 1)} unit="/ 25" accent />
        <StatTile label="Da attenzionare" value={String(flagged)} hint="Almeno una voce in giallo o rosso" />
      </div>

      <section className="panel overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
            <Moon className="size-4 text-primary" />
            Risposte del giorno
          </p>
          <p className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
            <span>1 = peggio · 5 = meglio · ore di sonno: giallo &lt; 6 h, rosso &lt; 5 h</span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-status-warning" />2, o ≥1 DS sotto la sua media
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-status-critical" />1, o ≥2 DS sotto la sua media
            </span>
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Nessuna risposta per questo giorno.</p>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-2 py-2">Giocatore</th>
                  <th className="px-2 py-2 text-center">Ore sonno</th>
                  {WELLNESS_ITEMS.map((i) => (
                    <th key={i.key} className="px-2 py-2 text-center">
                      {i.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">Totale</th>
                  <th className="px-2 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entry.playerId} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-2 font-medium text-ink">
                      {playerById.get(r.entry.playerId)?.displayName ?? r.entry.playerId}
                      {!r.baseline && (
                        <span className="ml-1.5 text-[11px] font-normal text-ink-muted" title={`Servono ${MIN_BASELINE_ENTRIES} risposte negli ultimi ${BASELINE_DAYS} giorni per confrontarlo con la sua media`}>
                          · storico breve
                        </span>
                      )}
                    </td>
                    <td className={cn('px-2 py-2 text-center tabular-nums', r.sleepHours && LEVEL_CELL[r.sleepHours.level])}>
                      {r.sleepHours ? <span className="font-semibold">{formatNumber(r.sleepHours.value, 1)} h</span> : <span className="text-ink-muted">—</span>}
                    </td>
                    {WELLNESS_ITEMS.map((i) => (
                      <ScoreCell key={i.key} a={r.items[i.key]} />
                    ))}
                    <td className={cn('px-2 py-2 text-center tabular-nums', LEVEL_CELL[r.total.level])}>
                      <span className="font-display text-base font-bold">{r.total.value}</span>
                      {r.total.delta !== undefined && (
                        <span className="ml-1 text-[11px] text-ink-muted" title="Rispetto alla sua media degli ultimi 28 giorni">
                          {r.total.delta >= 0 ? '+' : '−'}
                          {formatNumber(Math.abs(r.total.delta), 1)}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[16rem] px-2 py-2 text-xs text-ink-secondary">{r.entry.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {missing.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Non hanno ancora risposto ({missing.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((p) => (
                <span key={p.id} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink-secondary">
                  {p.displayName}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {trend.length > 1 && (
        <section className="panel p-4">
          <p className="font-display mb-1 text-base font-medium text-ink">Wellness medio squadra · ultimi {BASELINE_DAYS} giorni</p>
          <p className="mb-2 text-xs text-ink-muted">Media del totale (5–25) di chi ha risposto ogni giorno.</p>
          <TrendLine data={trend} height={180} valueFormatter={(v) => `${formatNumber(v, 1)} / 25`} />
        </section>
      )}
    </div>
  )
}
