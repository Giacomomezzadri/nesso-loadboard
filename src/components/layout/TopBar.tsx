import { useMutation } from '@tanstack/react-query'
import { ChevronDown, KeyRound, LogOut, Menu, Printer, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { changeOwnPassword } from '../../lib/db/repo'
import { useAuth } from '../../state/AuthContext'
import { useCurrentSession } from '../../state/CurrentSessionContext'
import { NAV_ITEMS } from './navItems'

function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setOpen(false)
    },
  })

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Cambia password"
        className="hidden items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 md:flex"
      >
        <KeyRound className="size-3.5" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Chiudi" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
            className="panel absolute right-0 top-full z-50 mt-2 w-64 p-3"
          >
            <p className="mb-2 text-xs font-medium text-ink">Cambia password</p>
            <label className="mb-2 flex flex-col gap-1 text-xs">
              <span className="text-ink-secondary">Password attuale</span>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-md border border-border bg-page px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="mb-2 flex flex-col gap-1 text-xs">
              <span className="text-ink-secondary">Nuova password (min. 8 caratteri)</span>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-border bg-page px-2 py-1.5 text-sm text-ink"
              />
            </label>
            {mutation.isError && <p className="mb-2 text-xs text-status-critical">{(mutation.error as Error).message}</p>}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {mutation.isPending ? 'Salvataggio…' : 'Salva'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

function useCurrentPageLabel(): string {
  const { pathname } = useLocation()
  const match = NAV_ITEMS.find((item) => (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)))
  return match?.label ?? 'LozioBoard'
}

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pageLabel = useCurrentPageLabel()
  const { sessions, currentSessionId, currentSession, setCurrentSessionId } = useCurrentSession()
  const { user, canEdit } = useAuth()
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-secondary hover:bg-ink/5 md:hidden"
        onClick={onOpenMobileNav}
        aria-label="Apri menu"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="font-display truncate text-base font-medium text-ink">{pageLabel}</h1>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
        {sessions.length > 0 && (
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 sm:gap-1.5 sm:px-3"
            >
              <span className="max-w-24 truncate sm:max-w-44">
                {currentSession ? currentSession.label : 'Seleziona sessione'}
              </span>
              <ChevronDown className="size-3.5 shrink-0" />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 z-40 mt-1 w-64 border border-border bg-surface-raised py-1 shadow-lg">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setCurrentSessionId(s.id)
                      setPickerOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-ink/5 ${
                      s.id === currentSessionId ? 'text-accent' : 'text-ink-secondary'
                    }`}
                  >
                    <span className="truncate">{s.label}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-ink-muted">{s.date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => window.print()}
          aria-label="Stampa / esporta PDF"
          className="hidden items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 md:flex"
        >
          <Printer className="size-3.5" />
          Stampa / PDF
        </button>

        {canEdit && (
          <Link
            to="/sessions"
            aria-label="Importa sessione"
            className="glow-accent flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-accent-ink transition-opacity hover:opacity-90 sm:px-3"
          >
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">Importa sessione</span>
          </Link>
        )}

        <span className="hidden max-w-32 truncate text-xs text-ink-muted lg:inline" title={user?.email}>
          {user?.email}
        </span>

        <ChangePasswordButton />

        <form method="POST" action="/api/auth/logout" className="shrink-0">
          <button
            type="submit"
            aria-label="Esci"
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-ink/5 sm:px-3"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Esci</span>
          </button>
        </form>
      </div>
    </header>
  )
}
