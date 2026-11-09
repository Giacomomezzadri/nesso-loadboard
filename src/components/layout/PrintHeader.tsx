import { useLocation } from 'react-router-dom'
import { useCurrentSession } from '../../state/CurrentSessionContext'
import { TRAINING_TYPE_LABEL } from '../../types/domain'
import { NAV_ITEMS } from './navItems'

/** Only visible when printing (see .print-page-title in index.css) — the
 * TopBar/session-picker chrome is hidden on print, so this stands in for it. */
export function PrintHeader() {
  const { pathname } = useLocation()
  const { currentSession } = useCurrentSession()
  const match = NAV_ITEMS.find((item) => (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)))
  if (pathname.startsWith('/report')) return null

  return (
    <div className="print-page-title mb-4 border-b border-border pb-2">
      <p className="font-display text-lg font-medium text-ink">
        LoadBoard <span className="text-ink-secondary">{match?.label ?? ''}</span>
      </p>
      {currentSession && (
        <p className="text-sm text-ink-secondary">
          {currentSession.label}, {currentSession.date}
          {', '}
          {currentSession.type === 'match' ? 'Partita' : 'Allenamento'}
          {currentSession.trainingType ? ` (${TRAINING_TYPE_LABEL[currentSession.trainingType]})` : ''}
        </p>
      )}
    </div>
  )
}
