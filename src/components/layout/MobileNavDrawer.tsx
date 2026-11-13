import { X } from 'lucide-react'
import { Sidebar } from './Sidebar'

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Chiudi menu"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-page p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold tracking-tight text-ink">LozioBoard</span>
          <button
            type="button"
            aria-label="Chiudi menu"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-secondary hover:bg-ink/5"
          >
            <X className="size-4" />
          </button>
        </div>
        <Sidebar />
      </div>
    </div>
  )
}
