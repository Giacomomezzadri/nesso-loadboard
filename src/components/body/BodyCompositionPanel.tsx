import { useMutation } from '@tanstack/react-query'
import { Scale, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { deleteBodyMeasurement, putBodyMeasurement } from '../../lib/db/repo'
import { cn, formatNumber } from '../../lib/utils'
import { useBodyMeasurementsQuery, useInvalidateBodyMeasurements } from '../../state/queries'
import type { BodyMeasurement } from '../../types/domain'

type MetricKey = 'fatMassPct' | 'skinfoldMm' | 'muscleMassKg'

const METRICS: { key: MetricKey; label: string; unit: string; decimals: number; higherIsBetter: boolean }[] = [
  { key: 'fatMassPct', label: 'Massa grassa', unit: '%', decimals: 1, higherIsBetter: false },
  { key: 'skinfoldMm', label: 'Plicometria (somma pliche)', unit: 'mm', decimals: 1, higherIsBetter: false },
  { key: 'muscleMassKg', label: 'Massa muscolare', unit: 'kg', decimals: 1, higherIsBetter: true },
]

const DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtDate = (iso: string) => DATE.format(new Date(iso + 'T00:00:00Z'))

function todayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

/** "12,4" / "12.4" → 12.4; empty → undefined. */
function parseInput(raw: string): number | undefined {
  const s = raw.trim().replace(',', '.')
  if (s === '') return undefined
  const v = Number(s)
  return Number.isFinite(v) ? v : undefined
}

/**
 * Latest value of one metric vs the previous measurement that has it. The arrow says better
 * or worse, not up or down: green ▲ = improved, red ▼ = worsened (for fat mass and skinfolds
 * a lower value is the improvement).
 */
function MetricTile({ def, history }: { def: (typeof METRICS)[number]; history: BodyMeasurement[] }) {
  const withValue = history.filter((m) => m[def.key] !== undefined)
  const latest = withValue[withValue.length - 1]
  const previous = withValue[withValue.length - 2]
  const value = latest?.[def.key]
  const prev = previous?.[def.key]
  const delta = value !== undefined && prev !== undefined ? value - prev : undefined
  const improved = delta !== undefined && delta !== 0 ? (delta > 0) === def.higherIsBetter : undefined
  const fmt = (v: number) => formatNumber(v, def.decimals)

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-page px-3 py-2.5">
      <span className="text-xs text-ink-secondary">{def.label}</span>
      <span className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold tabular-nums leading-none text-ink">{value === undefined ? '—' : fmt(value)}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{def.unit}</span>
      </span>
      {latest && <span className="text-[11px] text-ink-muted">{fmtDate(latest.date)}</span>}
      {delta !== undefined && prev !== undefined && (
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            improved === undefined ? 'text-ink-muted' : improved ? 'text-status-good' : 'text-status-critical',
          )}
        >
          {improved === undefined
            ? `= invariato (${fmt(prev)} ${def.unit})`
            : `${improved ? '▲ migliorato' : '▼ peggiorato'} di ${fmt(Math.abs(delta))} ${def.unit}`}
          {improved !== undefined && (
            <span className="ml-1 font-normal text-ink-muted">
              (da {fmt(prev)} a {fmt(value!)}, {fmtDate(previous.date)})
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/** Player Profile: body composition entered by hand, latest values and change since the previous measurement. */
export function BodyCompositionPanel({ playerId, canEdit }: { playerId: string; canEdit: boolean }) {
  const { data: all = [] } = useBodyMeasurementsQuery()
  const invalidate = useInvalidateBodyMeasurements()
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [draft, setDraft] = useState<Record<MetricKey, string>>({ fatMassPct: '', skinfoldMm: '', muscleMassKg: '' })

  const history = all.filter((m) => m.playerId === playerId).sort((a, b) => a.date.localeCompare(b.date))

  const save = useMutation({
    mutationFn: () =>
      putBodyMeasurement({
        playerId,
        date,
        fatMassPct: parseInput(draft.fatMassPct),
        skinfoldMm: parseInput(draft.skinfoldMm),
        muscleMassKg: parseInput(draft.muscleMassKg),
      }),
    onSuccess: () => {
      invalidate()
      setDraft({ fatMassPct: '', skinfoldMm: '', muscleMassKg: '' })
      setFormOpen(false)
    },
  })
  const remove = useMutation({
    mutationFn: (m: BodyMeasurement) => deleteBodyMeasurement(m.playerId, m.date),
    onSuccess: () => invalidate(),
  })
  const hasAnyInput = METRICS.some((m) => parseInput(draft[m.key]) !== undefined)
  const existingOnDate = history.find((m) => m.date === date)

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
          <Scale className="size-4 text-primary" />
          Composizione corporea
        </p>
        {canEdit && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
          >
            + Nuova misurazione
          </button>
        )}
      </div>

      {canEdit && formOpen && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-secondary">
              Data misurazione
              <input
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-border bg-page px-2 py-1 text-sm text-ink"
              />
            </label>
            {METRICS.map((m) => (
              <label key={m.key} className="flex flex-col gap-1 text-xs text-ink-secondary">
                {m.label} ({m.unit})
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft[m.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                  placeholder="—"
                  className="w-28 rounded-md border border-border bg-page px-2 py-1 text-right text-sm tabular-nums text-ink"
                />
              </label>
            ))}
          </div>
          {existingOnDate && (
            <p className="text-xs text-status-serious">C'è già una misurazione in questa data: verrà sostituita.</p>
          )}
          {save.error && <p className="text-xs text-status-critical">{(save.error as Error).message}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasAnyInput || !date || save.isPending}
              onClick={() => save.mutate()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Salvataggio…' : 'Salva misurazione'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs text-ink-secondary hover:bg-ink/5"
            >
              Annulla
            </button>
            <span className="text-xs text-ink-muted">Puoi compilare anche solo alcuni valori.</span>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nessuna misurazione registrata per questo giocatore. Si inseriscono qui o si importano da file ISAK dalla pagina Sessioni
          (Antropometria).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {METRICS.map((m) => (
              <MetricTile key={m.key} def={m} history={history} />
            ))}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-ink-secondary">
              Storico misurazioni ({history.length})
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="py-1.5 pr-3">Data</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="px-3 py-1.5 text-right">
                      {m.label} ({m.unit})
                    </th>
                  ))}
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row) => (
                  <tr key={row.date} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 tabular-nums text-ink">{fmtDate(row.date)}</td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-3 py-1.5 text-right tabular-nums text-ink">
                        {row[m.key] === undefined ? '—' : formatNumber(row[m.key]!, m.decimals)}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="py-1.5 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Eliminare la misurazione del ${fmtDate(row.date)}?`)) remove.mutate(row)
                          }}
                          aria-label="Elimina misurazione"
                          className="rounded p-1 text-ink-muted hover:bg-status-critical/10 hover:text-status-critical"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  )
}
