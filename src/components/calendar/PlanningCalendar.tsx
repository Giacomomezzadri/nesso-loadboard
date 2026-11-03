import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Check, X } from 'lucide-react'
import { useState } from 'react'
import { deletePlannedDay, putPlannedDay } from '../../lib/db/repo'
import { cn } from '../../lib/utils'
import { useInvalidatePlannedDays, usePlannedDaysQuery } from '../../state/queries'
import {
  MATCH_LOCATION_LABEL,
  TRAINING_TYPE_LABEL,
  opponentInitials,
  type MatchLocation,
  type PlannedDay,
  type PlannedDayKind,
  type Session,
  type TrainingType,
} from '../../types/domain'

const DAYS_BEFORE = 10
const DAYS_AFTER = 20
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const KIND_LABEL: Record<PlannedDayKind, string> = {
  training: 'Allenamento',
  match: 'Partita',
  day_off: 'Day off',
}

// One categorical hue per training type (the dataviz palette in index.css), so a week reads
// at a glance; the match keeps the brand accent and the day off stays neutral.
const TRAINING_STYLE: Record<TrainingType, { chip: string; dot: string; short: string }> = {
  ripresa: { chip: 'bg-series-aqua/12 text-ink border-series-aqua/40', dot: 'bg-series-aqua', short: 'RIP' },
  forza: { chip: 'bg-series-red/12 text-ink border-series-red/40', dot: 'bg-series-red', short: 'FOR' },
  metabolico_alte_velocita: { chip: 'bg-series-orange/12 text-ink border-series-orange/40', dot: 'bg-series-orange', short: 'MET' },
  rifinitura: { chip: 'bg-series-violet/12 text-ink border-series-violet/40', dot: 'bg-series-violet', short: 'RIF' },
  recupero_attivo: { chip: 'bg-series-green/12 text-ink border-series-green/40', dot: 'bg-series-green', short: 'REC' },
  mix: { chip: 'bg-series-blue/12 text-ink border-series-blue/40', dot: 'bg-series-blue', short: 'MIX' },
  amichevole: { chip: 'bg-series-magenta/14 text-ink border-series-magenta/40', dot: 'bg-series-magenta', short: 'AMI' },
}
const GENERIC_TRAINING_STYLE = { chip: 'bg-primary/8 text-ink border-primary/30', dot: 'bg-primary', short: 'ALL' }
const MATCH_STYLE = { chip: 'bg-accent/25 text-ink border-accent', dot: 'bg-accent', short: 'GARA' }
const DAY_OFF_STYLE = { chip: 'bg-ink/5 text-ink-muted border-transparent', dot: 'bg-ink-muted', short: 'OFF' }

function styleFor(day: PlannedDay) {
  if (day.kind === 'match') return MATCH_STYLE
  if (day.kind === 'day_off') return DAY_OFF_STYLE
  return day.trainingType ? TRAINING_STYLE[day.trainingType] : GENERIC_TRAINING_STYLE
}

function labelFor(day: PlannedDay): { full: string; short: string } {
  if (day.kind === 'match') {
    const where = day.matchLocation ? (day.matchLocation === 'home' ? ' (C)' : ' (T)') : ''
    return day.opponentName
      ? { full: `${day.opponentName}${where}`, short: opponentInitials(day.opponentName) }
      : { full: `Partita${where}`, short: MATCH_STYLE.short }
  }
  if (day.kind === 'day_off') return { full: 'Day off', short: DAY_OFF_STYLE.short }
  return day.trainingType
    ? { full: TRAINING_TYPE_LABEL[day.trainingType], short: TRAINING_STYLE[day.trainingType].short }
    : { full: 'Allenamento', short: GENERIC_TRAINING_STYLE.short }
}

// All date math in UTC on "YYYY-MM-DD" strings, so a DST switch can never skip or repeat a day.
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}
function localTodayIso(): string {
  const now = new Date()
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}
/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7
}
const MONTH_SHORT = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' })
const LONG_DATE = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const RANGE_DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
function fmt(formatter: Intl.DateTimeFormat, iso: string): string {
  return formatter.format(new Date(iso + 'T00:00:00Z'))
}

interface Draft {
  kind: PlannedDayKind
  trainingType?: TrainingType
  opponentName: string
  matchLocation?: MatchLocation
}

function draftFrom(day: PlannedDay | undefined): Draft {
  return {
    kind: day?.kind ?? 'training',
    trainingType: day?.trainingType,
    opponentName: day?.opponentName ?? '',
    matchLocation: day?.matchLocation,
  }
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-page p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-border' : 'text-ink-secondary hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Planning calendar for Overview: the last 10 days, today and the next 20. Editors pick, per
 * day, a match, a training (optionally of a given type) or a day off; viewers see it read-only.
 * A small check marks days that already have an imported GPS session.
 */
export function PlanningCalendar({ sessions, canEdit }: { sessions: Session[]; canEdit: boolean }) {
  const today = localTodayIso()
  const from = addDays(today, -DAYS_BEFORE)
  const to = addDays(today, DAYS_AFTER)
  const { data: plannedDays = [], isLoading } = usePlannedDaysQuery(from, to)
  const invalidate = useInvalidatePlannedDays()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(draftFrom(undefined))

  const plannedByDate = new Map(plannedDays.map((d) => [d.date, d]))
  const importedDates = new Set(sessions.map((s) => s.date))
  const selected = selectedDate ? plannedByDate.get(selectedDate) : undefined

  // Full Monday–Sunday weeks around the window; days outside it keep the grid aligned but stay blank.
  const gridStart = addDays(from, -weekdayIndex(from))
  const gridEnd = addDays(to, 6 - weekdayIndex(to))
  const cells: string[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d)

  const save = useMutation({
    mutationFn: (d: Draft) =>
      putPlannedDay({
        date: selectedDate as string,
        kind: d.kind,
        trainingType: d.kind === 'training' ? d.trainingType : undefined,
        opponentName: d.kind === 'match' ? d.opponentName.trim() || undefined : undefined,
        matchLocation: d.kind === 'match' ? d.matchLocation : undefined,
      }),
    onSuccess: () => {
      invalidate()
      setSelectedDate(null)
    },
  })
  const clear = useMutation({
    mutationFn: (date: string) => deletePlannedDay(date),
    onSuccess: () => {
      invalidate()
      setSelectedDate(null)
    },
  })
  const busy = save.isPending || clear.isPending
  const error = save.error ?? clear.error

  const openDay = (date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null)
      return
    }
    setSelectedDate(date)
    setDraft(draftFrom(plannedByDate.get(date)))
    save.reset()
    clear.reset()
  }

  const legend = [
    { label: 'Partita', dot: MATCH_STYLE.dot },
    ...(Object.keys(TRAINING_TYPE_LABEL) as TrainingType[]).map((t) => ({ label: TRAINING_TYPE_LABEL[t], dot: TRAINING_STYLE[t].dot })),
    { label: 'Day off', dot: DAY_OFF_STYLE.dot },
  ]

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-display flex items-center gap-2 text-base font-medium text-ink">
            <CalendarDays className="size-4 text-primary" />
            Calendario
          </p>
          <p className="text-xs text-ink-muted">
            {fmt(RANGE_DATE, from)} – {fmt(RANGE_DATE, to)} · 10 giorni precedenti e 20 successivi
            {canEdit && ' · tocca un giorno per pianificarlo'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <span className={cn('size-2 rounded-full', l.dot)} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {w}
          </div>
        ))}

        {cells.map((date) => {
          const inWindow = date >= from && date <= to
          if (!inWindow) return <div key={date} aria-hidden className="min-h-14 sm:min-h-20" />

          const planned = plannedByDate.get(date)
          const isToday = date === today
          const isPast = date < today
          const isSelected = date === selectedDate
          const dayNumber = Number(date.slice(8, 10))
          const showMonth = dayNumber === 1 || date === from
          const label = planned ? labelFor(planned) : null
          const style = planned ? styleFor(planned) : null

          return (
            <button
              key={date}
              type="button"
              onClick={() => openDay(date)}
              disabled={!canEdit && !planned}
              aria-pressed={isSelected}
              aria-label={`${fmt(LONG_DATE, date)}${label ? ` — ${label.full}` : ''}`}
              className={cn(
                'group relative flex min-h-14 flex-col items-stretch gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-20 sm:p-1.5',
                isSelected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : 'border-border bg-surface enabled:hover:border-primary/40 enabled:hover:bg-surface-raised',
                isPast && !isSelected && 'bg-page',
                !canEdit && !planned && 'cursor-default',
              )}
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'font-display text-sm font-semibold tabular-nums leading-none sm:text-base',
                    isToday
                      ? 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-ink sm:size-6'
                      : isPast
                        ? 'text-ink-muted'
                        : 'text-ink',
                  )}
                >
                  {dayNumber}
                </span>
                {showMonth && !isToday && (
                  <span className="hidden text-[10px] uppercase tracking-wide text-ink-muted sm:inline">{fmt(MONTH_SHORT, date)}</span>
                )}
                {importedDates.has(date) && (
                  <Check className="size-3 shrink-0 text-status-good" aria-label="Sessione importata" />
                )}
              </span>

              {label && style && (
                <span
                  className={cn(
                    'mt-auto truncate rounded-md border px-1 py-0.5 text-center text-[10px] font-semibold leading-tight sm:px-1.5 sm:text-left sm:text-[11px] sm:font-medium',
                    style.chip,
                    isPast && 'opacity-70',
                  )}
                >
                  <span className="sm:hidden">{label.short}</span>
                  <span className="hidden sm:inline">{label.full}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isLoading && <p className="mt-3 text-xs text-ink-muted">Caricamento calendario…</p>}

      {selectedDate && (
        <div className="mt-4 rounded-xl border border-border bg-surface-raised p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <p className="font-display text-base font-medium capitalize text-ink">{fmt(LONG_DATE, selectedDate)}</p>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="rounded-md p-1 text-ink-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Chiudi"
            >
              <X className="size-4" />
            </button>
          </div>

          {!canEdit ? (
            <p className="text-sm text-ink-secondary">
              {selected
                ? [
                    KIND_LABEL[selected.kind],
                    selected.trainingType && TRAINING_TYPE_LABEL[selected.trainingType],
                    selected.opponentName,
                    selected.matchLocation && MATCH_LOCATION_LABEL[selected.matchLocation],
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Nessuna attività pianificata.'}
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate(draft)
              }}
            >
              <Segmented
                options={(Object.keys(KIND_LABEL) as PlannedDayKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                value={draft.kind}
                onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
              />

              {draft.kind === 'training' && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-ink-secondary">Tipo di allenamento</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(TRAINING_TYPE_LABEL) as TrainingType[]).map((t) => {
                      const active = draft.trainingType === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, trainingType: active ? undefined : t }))}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            active ? TRAINING_STYLE[t].chip : 'border-border text-ink-secondary hover:border-primary/40 hover:text-ink',
                          )}
                        >
                          <span className={cn('size-2 rounded-full', TRAINING_STYLE[t].dot)} />
                          {TRAINING_TYPE_LABEL[t]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {draft.kind === 'match' && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-ink-secondary">
                    Avversario
                    <input
                      value={draft.opponentName}
                      onChange={(e) => setDraft((d) => ({ ...d, opponentName: e.target.value }))}
                      maxLength={80}
                      placeholder="Es. Internazionale"
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-normal text-ink placeholder:text-ink-muted"
                    />
                  </label>
                  <Segmented
                    options={(Object.keys(MATCH_LOCATION_LABEL) as MatchLocation[]).map((l) => ({
                      value: l,
                      label: MATCH_LOCATION_LABEL[l],
                    }))}
                    value={draft.matchLocation}
                    onChange={(matchLocation) => setDraft((d) => ({ ...d, matchLocation }))}
                  />
                </div>
              )}

              {error && <p className="text-xs text-status-critical">{(error as Error).message}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? 'Salvataggio…' : 'Salva'}
                </button>
                {selected && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => clear.mutate(selectedDate)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-ink/5 hover:text-status-critical disabled:opacity-50"
                  >
                    {clear.isPending ? 'Rimozione…' : 'Rimuovi'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
                >
                  Annulla
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  )
}
