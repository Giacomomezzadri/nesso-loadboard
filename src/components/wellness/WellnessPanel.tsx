import { Moon } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  addDaysIso,
  assessWellness,
  BASELINE_DAYS,
  WELLNESS_FACES,
  WELLNESS_ITEMS,
  wellnessTotal,
  type WellnessLevel,
} from '../../lib/metrics/wellness'
import { cn, formatNumber } from '../../lib/utils'
import type { WellnessEntry } from '../../types/domain'

export const LEVEL_CELL: Record<WellnessLevel, string> = {
  ok: 'bg-page',
  warning: 'bg-status-warning/20',
  critical: 'bg-status-critical/15 text-status-critical',
}

const DATE = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const SHORT_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmt = (f: Intl.DateTimeFormat, iso: string) => f.format(new Date(iso + 'T00:00:00Z'))

/**
 * Player Profile panel: the latest morning questionnaire (coloured against the athlete's own
 * 28-day baseline) and the last 28 days of wellness next to the day's training distance, so a
 * dip after a heavy day is visible at a glance.
 */
export function WellnessPanel({
  playerId,
  entries,
  dailyDistanceM,
}: {
  playerId: string
  entries: WellnessEntry[]
  /** Total distance of the player's full sessions per ISO date. */
  dailyDistanceM: Map<string, number>
}) {
  const own = useMemo(() => entries.filter((e) => e.playerId === playerId).sort((a, b) => a.date.localeCompare(b.date)), [entries, playerId])
  const latest = own[own.length - 1]
  const assessment = latest ? assessWellness(latest, own) : null

  const chart = useMemo(() => {
    if (!latest) return []
    const byDate = new Map(own.map((e) => [e.date, e]))
    const points = []
    for (let i = BASELINE_DAYS - 1; i >= 0; i--) {
      const d = addDaysIso(latest.date, -i)
      const e = byDate.get(d)
      const km = dailyDistanceM.get(d)
      points.push({ x: fmt(SHORT_DATE, d), wellness: e ? wellnessTotal(e) : null, km: km !== undefined ? km / 1000 : null })
    }
    return points
  }, [own, latest, dailyDistanceM])

  const notes = own.filter((e) => e.note).slice(-3).reverse()

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
          <Moon className="size-4 text-primary" />
          Wellness mattutino
        </p>
        {latest && <p className="text-xs capitalize text-ink-muted">Ultima risposta {fmt(DATE, latest.date)}</p>}
      </div>

      {!latest || !assessment ? (
        <p className="text-sm text-ink-muted">Nessuna risposta al questionario. Il link per la squadra si crea dalla pagina Wellness.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <div className={cn('flex flex-col gap-1 rounded-lg px-3 py-2.5', LEVEL_CELL[assessment.sleepHours?.level ?? 'ok'])}>
              <span className="text-xs text-ink-secondary">Ore di sonno</span>
              <span className="font-display text-2xl font-bold tabular-nums leading-none">
                {assessment.sleepHours ? formatNumber(assessment.sleepHours.value, 1) : '—'}
              </span>
              <span className="text-[11px] text-ink-muted">{assessment.sleepHours ? 'ore' : 'non indicate'}</span>
            </div>
            {WELLNESS_ITEMS.map((item) => {
              const a = assessment.items[item.key]
              return (
                <div key={item.key} className={cn('flex flex-col gap-1 rounded-lg px-3 py-2.5', LEVEL_CELL[a.level])}>
                  <span className="text-xs text-ink-secondary">{item.label}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span aria-hidden>{WELLNESS_FACES[a.value - 1]}</span>
                    <span className="font-display text-2xl font-bold tabular-nums leading-none">{a.value}</span>
                  </span>
                  <span className="text-[11px] text-ink-muted">{item.answers[a.value - 1]}</span>
                </div>
              )
            })}
            <div className={cn('flex flex-col gap-1 rounded-lg px-3 py-2.5', LEVEL_CELL[assessment.total.level])}>
              <span className="text-xs text-ink-secondary">Totale</span>
              <span className="font-display text-2xl font-bold tabular-nums leading-none">{assessment.total.value}</span>
              <span className="text-[11px] text-ink-muted">
                {assessment.total.delta !== undefined
                  ? `${assessment.total.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(assessment.total.delta), 1)} vs sua media`
                  : 'storico breve'}
              </span>
            </div>
          </div>

          {chart.some((p) => p.wellness !== null) && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Ultimi {BASELINE_DAYS} giorni · wellness (linea) e distanza in allenamento (barre)</span>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} axisLine={{ stroke: 'var(--color-baseline)' }} tickLine={false} minTickGap={16} />
                  <YAxis yAxisId="w" domain={[5, 25]} ticks={[5, 10, 15, 20, 25]} tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} axisLine={false} tickLine={false} width={28} />
                  <YAxis yAxisId="km" orientation="right" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} axisLine={false} tickLine={false} width={32} unit=" km" />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'km' ? [`${formatNumber(Number(value), 1)} km`, 'Distanza'] : [`${value} / 25`, 'Wellness']
                    }
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
                  />
                  <Bar yAxisId="km" dataKey="km" name="km" fill="var(--color-ink-muted)" fillOpacity={0.25} radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="w"
                    type="monotone"
                    dataKey="wellness"
                    name="wellness"
                    stroke="var(--color-series-blue)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-series-blue)', strokeWidth: 0 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {notes.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Note recenti</span>
              {notes.map((e) => (
                <p key={e.date} className="text-sm text-ink-secondary">
                  <span className="mr-2 text-xs capitalize text-ink-muted">{fmt(DATE, e.date)}</span>
                  {e.note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
