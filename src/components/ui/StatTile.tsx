import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface StatTileProps {
  label: string
  value: string
  unit?: string
  hint?: string
  accent?: boolean
  icon?: ReactNode
  /** Extra content under the value, e.g. a small breakdown table. */
  footer?: ReactNode
}

export function StatTile({ label, value, unit, hint, accent, icon, footer }: StatTileProps) {
  return (
    <div className={cn('flex flex-col gap-2 p-5', accent ? 'panel-accent glow-accent' : 'panel')}>
      <div className="flex items-center justify-between text-sm text-ink-secondary">
        <span>{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-display text-4xl font-bold tabular-nums leading-none text-ink',
            accent && 'text-accent text-glow-accent',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {footer}
    </div>
  )
}
