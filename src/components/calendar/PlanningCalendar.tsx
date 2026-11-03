import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
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
// at a glance; the match keeps the brand accent and the day off stays neutral. A planned day
// tints its whole cell (`cell`) and gets a solid left edge (`bar`); `chip`/`dot` are for the
// editor's type picker and the legend.
interface DayStyle {
  cell: string
  bar: string
  chip: string
  dot: string
  short: string
}
const TRAINING_STYLE: Record<TrainingType, DayStyle> = {
  ripresa: {
    cell: 'bg-series-aqua/10 border-series-aqua/35',
    bar: 'bg-series-aqua',
    chip: 'bg-series-aqua/12 text-ink border-series-aqua/40',
    dot: 'bg-series-aqua',
    short: 'RIP',
  },
  forza: {
    cell: 'bg-series-red/10 border-series-red/35',
    bar: 'bg-series-red',
    chip: 'bg-series-red/12 text-ink border-series-red/40',
    dot: 'bg-series-red',
    short: 'FOR',
  },
  metabolico_alte_velocita: {
    cell: 'bg-series-orange/10 border-series-orange/35',
    bar: 'bg-series-orange',
    chip: 'bg-series-orange/12 text-ink border-series-orange/40',
    dot: 'bg-series-orange',
    short: 'MET',
  },
  rifinitura: {
    cell: 'bg-series-violet/10 border-series-violet/35',
    bar: 'bg-series-violet',
    chip: 'bg-series-violet/12 text-ink border-series-violet/40',
    dot: 'bg-series-violet',
    short: 'RIF',
  },
  recupero_attivo: {
    cell: 'bg-series-green/10 border-series-green/35',
    bar: 'bg-series-green',
    chip: 'bg-series-green/12 text-ink border-series-green/40',
    dot: 'bg-series-green',
    short: 'REC',
  },
  mix: {
    cell: 'bg-series-blue/10 border-series-blue/35',
    bar: 'bg-series-blue',
    chip: 'bg-series-blue/12 text-ink border-series-blue/40',
    dot: 'bg-series-blue',
    short: 'MIX',
  },
  amichevole: {
    cell: 'bg-series-magenta/12 border-series-magenta/35',
    bar: 'bg-series-magenta',
    chip: 'bg-series-magenta/14 text-ink border-series-magenta/40',
    dot: 'bg-series-magenta',
    short: 'AMI',
  },
}
const GENERIC_TRAINING_STYLE: DayStyle = {
  cell: 'bg-primary/6 border-primary/25',
  bar: 'bg-primary',
  chip: 'bg-primary/8 text-ink border-primary/30',
  dot: 'bg-primary',
  short: 'ALL',
}
const MATCH_STYLE: DayStyle = {
  cell: 'bg-accent/20 border-accent/70',
  bar: 'bg-accent',
  chip: 'bg-accent/25 text-ink border-accent',
  dot: 'bg-accent',
  short: 'GARA',
}
// Diagonal hatching reads as "nothing on" without competing with the coloured days.
const DAY_OFF_STYLE: DayStyle = {
  cell: 'border-border bg-[repeating-linear-gradient(135deg,var(--color-grid)_0_5px,transparent_5px_10px)]',
  bar: 'bg-ink-muted/40',
  chip: 'bg-ink/5 text-ink-muted border-transparent',
  dot: 'bg-ink-muted',
  short: 'OFF',
}

function styleFor(day: PlannedDay): DayStyle {
  if (day.kind === 'match') return MATCH_STYLE
  if (day.kind === 'day_off') return DAY_OFF_STYLE
  return day.trainingType ? TRAINING_STYLE[day.trainingType] : GENERIC_TRAINING_STYLE
}

/** `title` is the main line, `meta` the small caption under it, `short` the phone-width tag. */
function labelFor(day: PlannedDay): { title: string; meta: string; short: string } {
  if (day.kind === 'match') {
    const meta = day.matchLocation ? `Partita · ${MATCH_LOCATION_LABEL[day.matchLocation]}` : 'Partita'
    return day.opponentName
      ? { title: day.opponentName, meta, short: opponentInitials(day.opponentName) }
      : { title: 'Partita', meta: day.matchLocation ? MATCH_LOCATION_LABEL[day.matchLocation] : '', short: MATCH_STYLE.short }
  }
  if (day.kind === 'day_off') return { title: 'Day off', meta: 'Riposo', short: DAY_OFF_STYLE.short }
  return day.trainingType
    ? { title: TRAINING_TYPE_LABEL[day.trainingType], meta: 'Allenamento', short: TRAINING_STYLE[day.trainingType].short }
    : { title: 'Allenamento', meta: '', short: GENERIC_TRAINING_STYLE.short }
}

/** An imported session read as a calendar day — same shape as a manual plan, so it renders identically. */
function sessionToDay(session: Session): PlannedDay {
  return {
    date: session.date,
    kind: session.type,
    trainingType: session.type === 'training' ? session.trainingType : undefined,
    opponentName: session.type === 'match' ? session.opponentName : undefined,
    matchLocation: session.type === 'match' ? session.matchLocation : undefined,
    updatedAt: session.importedAt,
  }
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
 *
 * Imported GPS sessions fill the calendar on their own: a day with a session shows that
 * session (type, training type, opponent) whatever was planned for it, since it's what actually
 * happened — so importing is enough, nobody has to retype it here. Correcting such a day means
 * editing the session itself, which also fixes every stat built on it. A check marks these days.
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
  // A double session day keeps every session; the match (if any) leads, then import order.
  const sessionsByDate = new Map<string, Session[]>()
  for (const session of sessions) {
    if (session.date < from || session.date > to) continue
    const list = sessionsByDate.get(session.date) ?? []
    list.push(session)
    sessionsByDate.set(session.date, list)
  }
  for (const list of sessionsByDate.values()) {
    list.sort((a, b) => Number(b.type === 'match') - Number(a.type === 'match') || a.importedAt.localeCompare(b.importedAt))
  }
  // What each day shows: the imported session when there is one, otherwise the manual plan.
  const shownByDate = new Map(plannedByDate)
  for (const [date, list] of sessionsByDate) shownByDate.set(date, sessionToDay(list[0]))

  const selected = selectedDate ? shownByDate.get(selectedDate) : undefined
  const selectedSessions = selectedDate ? (sessionsByDate.get(selectedDate) ?? []) : []
  const selectedPlan = selectedDate ? plannedByDate.get(selectedDate) : undefined

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

  // Legend lists only what's on screen — nine entries for an empty month is just noise.
  const legend = new Map<string, { label: string; dot: string }>()
  for (const d of shownByDate.values()) {
    const label = d.kind === 'training' ? (d.trainingType ? TRAINING_TYPE_LABEL[d.trainingType] : 'Allenamento') : KIND_LABEL[d.kind]
    legend.set(label, { label, dot: styleFor(d).dot })
  }

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
            {' · le sessioni importate compaiono da sole'}
            {canEdit && ', tocca un giorno libero per pianificarlo'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {[...legend.values()].map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <span className={cn('size-2 rounded-full', l.dot)} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {w}
          </div>
        ))}

        {cells.map((date) => {
          const inWindow = date >= from && date <= to
          // Outside the 10+20 window: a faint numbered placeholder, so the weeks read as full rows, not gaps.
          if (!inWindow) {
            return (
              <div
                key={date}
                aria-hidden
                className="min-h-16 rounded-lg border border-dashed border-border/60 px-1.5 pt-1.5 sm:min-h-24 sm:px-2.5 sm:pt-2"
              >
                <span className="font-display text-sm font-semibold tabular-nums leading-none text-ink-muted/50 sm:text-lg">
                  {Number(date.slice(8, 10))}
                </span>
              </div>
            )
          }

          const planned = shownByDate.get(date)
          const imported = sessionsByDate.get(date) ?? []
          const isToday = date === today
          const isPast = date < today
          const isSelected = date === selectedDate
          const dayNumber = Number(date.slice(8, 10))
          const showMonth = dayNumber === 1 || date === from
          const base = planned ? labelFor(planned) : null
          const label =
            base && imported.length > 1 ? { ...base, meta: `${imported.length} sessioni`, short: `${base.short}+` } : base
          const style = planned ? styleFor(planned) : null

          return (
            <button
              key={date}
              type="button"
              onClick={() => openDay(date)}
              disabled={!canEdit && !planned}
              aria-pressed={isSelected}
              aria-label={`${fmt(LONG_DATE, date)}${label ? ` — ${label.title}${label.meta ? `, ${label.meta}` : ''}` : ''}`}
              className={cn(
                'group relative flex min-h-16 flex-col overflow-hidden rounded-lg border text-left transition sm:min-h-24',
                style ? style.cell : isPast ? 'border-border/60 bg-page' : 'border-border bg-surface',
                isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : 'enabled:hover:border-primary/50',
                !canEdit && !planned && 'cursor-default',
              )}
            >
              {style && <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', style.bar)} />}

              <span className={cn('flex items-center justify-between gap-1 px-1.5 pt-1.5 sm:px-2.5 sm:pt-2', isPast && 'opacity-60')}>
                <span
                  className={cn(
                    'font-display text-sm font-semibold tabular-nums leading-none sm:text-lg',
                    isToday
                      ? 'flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-ink sm:size-7 sm:text-sm'
                      : 'text-ink',
                  )}
                >
                  {dayNumber}
                </span>
                <span className="flex items-center gap-1">
                  {showMonth && (
                    <span className="hidden text-[10px] font-medium uppercase tracking-wide text-ink-muted sm:inline">
                      {fmt(MONTH_SHORT, date)}
                    </span>
                  )}
                  {imported.length > 0 && (
                    <Check className="size-3 shrink-0 text-status-good sm:size-3.5" aria-label="Sessione importata" />
                  )}
                </span>
              </span>

              {label ? (
                <span className={cn('flex flex-1 flex-col justify-end px-1.5 pb-1.5 sm:px-2.5 sm:pb-2', isPast && 'opacity-60')}>
                  {/* Phone: one bold tag that fills the narrow cell. */}
                  <span className="font-display text-center text-xs font-bold uppercase tracking-wide text-ink sm:hidden">
                    {label.short}
                  </span>
                  {/* Wider screens: the full name, wrapped over two lines, plus a caption. */}
                  <span className="hidden sm:block">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{label.title}</span>
                    {label.meta && (
                      <span className="mt-0.5 block truncate text-[11px] text-ink-secondary">{label.meta}</span>
                    )}
                  </span>
                </span>
              ) : (
                canEdit &&
                !isPast && (
                  <span
                    aria-hidden
                    className="flex flex-1 items-center justify-center text-lg font-light text-ink-muted opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    +
                  </span>
                )
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

          {selectedSessions.length > 0 ? (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5">
                {selectedSessions.map((session) => {
                  const day = labelFor(sessionToDay(session))
                  return (
                    <li key={session.id} className="flex items-center gap-2 text-sm">
                      <span className={cn('size-2 shrink-0 rounded-full', styleFor(sessionToDay(session)).dot)} />
                      <span className="font-medium text-ink">{session.label}</span>
                      <span className="truncate text-ink-secondary">
                        · {day.title}
                        {day.meta && day.meta !== day.title ? ` · ${day.meta}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="flex items-start gap-1.5 text-xs text-ink-muted">
                <Check className="mt-px size-3.5 shrink-0 text-status-good" />
                Giorno compilato dalla sessione importata.
                {canEdit && ' Per cambiarlo modifica la sessione: si aggiornano anche le statistiche.'}
              </p>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/sessions"
                    className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
                  >
                    Vai alle sessioni
                  </Link>
                  {selectedPlan && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => clear.mutate(selectedDate)}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-ink/5 hover:text-status-critical disabled:opacity-50"
                    >
                      {clear.isPending ? 'Rimozione…' : 'Elimina la pianificazione precedente'}
                    </button>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-status-critical">{(error as Error).message}</p>}
            </div>
          ) : !canEdit ? (
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
