import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminCreateUser,
  adminListLoginAudit,
  adminListUsers,
  adminUpdateUser,
  type AdminUser,
  changeOwnPassword,
  type Role,
} from '../lib/db/repo'
import { useAuth } from '../state/AuthContext'

const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' }

function formatDateTime(iso: string | null): string {
  if (!iso) return 'mai'
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
}

function ChangePasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setOpen(false)
    },
  })

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        Cambia la tua password
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-ink-secondary">Password attuale</span>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-ink-secondary">Nuova password (min. 8 caratteri)</span>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {mutation.isPending ? 'Salvataggio…' : 'Salva'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs text-ink-secondary hover:bg-ink/5">
        Annulla
      </button>
      {mutation.isError && <p className="w-full text-xs text-status-critical">{(mutation.error as Error).message}</p>}
    </form>
  )
}

function CreateUserForm({ editors }: { editors: AdminUser[] }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminCreateUser({ email, password, role, workspaceOwnerId: role === 'viewer' ? workspaceOwnerId : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setEmail('')
      setPassword('')
      setWorkspaceOwnerId('')
    },
  })

  return (
    <div className="panel p-4">
      <p className="font-display mb-3 text-base font-medium text-ink">Nuovo account</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-secondary">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-56 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-secondary">Password iniziale (min. 8 caratteri)</span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-secondary">Ruolo</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          >
            <option value="editor">{ROLE_LABEL.editor}</option>
            <option value="viewer">{ROLE_LABEL.viewer}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </select>
        </label>
        {role === 'viewer' && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-secondary">Editor a cui associarlo</span>
            <select
              required
              value={workspaceOwnerId}
              onChange={(e) => setWorkspaceOwnerId(e.target.value)}
              className="w-56 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="" disabled>
                Scegli un Editor…
              </option>
              {editors.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={mutation.isPending || (role === 'viewer' && editors.length === 0)}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
        >
          <UserPlus className="size-4" /> {mutation.isPending ? 'Creazione…' : 'Crea account'}
        </button>
      </form>
      {mutation.isError && <p className="mt-2 text-xs text-status-critical">{(mutation.error as Error).message}</p>}
    </div>
  )
}

function UserRow({ user, editors, isSelf }: { user: AdminUser; editors: AdminUser[]; isSelf: boolean }) {
  const queryClient = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  const roleMutation = useMutation({
    mutationFn: (role: Role) => adminUpdateUser(user.id, { role }),
    onSuccess: invalidate,
  })
  const activeMutation = useMutation({
    mutationFn: (active: boolean) => adminUpdateUser(user.id, { active }),
    onSuccess: invalidate,
  })
  const workspaceMutation = useMutation({
    mutationFn: (workspaceOwnerId: string) => adminUpdateUser(user.id, { workspaceOwnerId }),
    onSuccess: invalidate,
  })
  const resetMutation = useMutation({
    mutationFn: () => adminUpdateUser(user.id, { newPassword }),
    onSuccess: () => {
      invalidate()
      setResetOpen(false)
      setNewPassword('')
    },
  })

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2 font-medium text-ink">
        {user.email}
        {isSelf && <span className="ml-1.5 text-xs text-ink-muted">(tu)</span>}
      </td>
      <td className="px-4 py-2">
        <select
          value={user.role}
          disabled={isSelf}
          onChange={(e) => roleMutation.mutate(e.target.value as Role)}
          className="rounded-md border border-border bg-page px-2 py-1 text-sm text-ink disabled:opacity-60"
        >
          <option value="editor">{ROLE_LABEL.editor}</option>
          <option value="viewer">{ROLE_LABEL.viewer}</option>
          <option value="admin">{ROLE_LABEL.admin}</option>
        </select>
      </td>
      <td className="px-4 py-2 text-xs text-ink-secondary">
        {user.role === 'viewer' ? (
          <select
            value={user.workspaceOwnerId ?? ''}
            onChange={(e) => workspaceMutation.mutate(e.target.value)}
            className="rounded-md border border-border bg-page px-2 py-1 text-sm text-ink"
          >
            <option value="" disabled>
              Scegli un Editor…
            </option>
            {editors.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.email}
              </option>
            ))}
          </select>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={user.active}
          disabled={isSelf}
          onChange={(e) => activeMutation.mutate(e.target.checked)}
          className="size-4 accent-accent disabled:opacity-60"
        />
      </td>
      <td className="px-4 py-2 tabular-nums text-xs text-ink-secondary">{formatDateTime(user.lastLoginAt)}</td>
      <td className="px-4 py-2">
        {resetOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              resetMutation.mutate()
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              required
              minLength={8}
              placeholder="nuova password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-36 rounded-md border border-border bg-page px-2 py-1 text-xs text-ink"
            />
            <button type="submit" className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-ink hover:opacity-90">
              Salva
            </button>
            <button type="button" onClick={() => setResetOpen(false)} className="rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5">
              Annulla
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setResetOpen(true)} className="text-xs font-medium text-accent hover:underline">
            Reimposta password
          </button>
        )}
      </td>
    </tr>
  )
}

function UsersSection() {
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminListUsers })
  const { user: currentUser } = useAuth()
  // Anyone who owns a workspace can have a Viewer bound to them — Admins included.
  const editors = users.filter((u) => u.role === 'editor' || u.role === 'admin')

  return (
    <div className="flex flex-col gap-4">
      <CreateUserForm editors={editors} />

      <div className="overflow-x-auto panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Ruolo</th>
              <th className="px-4 py-2">Editor associato</th>
              <th className="px-4 py-2">Attivo</th>
              <th className="px-4 py-2">Ultimo accesso</th>
              <th className="px-4 py-2">Password</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              users.map((u) => <UserRow key={u.id} user={u} editors={editors} isSelf={u.id === currentUser?.id} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LoginAuditSection() {
  const { data: entries = [], isLoading } = useQuery({ queryKey: ['admin', 'login-audit'], queryFn: () => adminListLoginAudit() })

  return (
    <div className="overflow-x-auto panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2">Quando</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Esito</th>
            <th className="px-4 py-2">Dispositivo</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading &&
            entries.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 tabular-nums text-ink">{formatDateTime(e.createdAt)}</td>
                <td className="px-4 py-2 text-ink-secondary">{e.email}</td>
                <td className="px-4 py-2">
                  {e.success ? (
                    <span className="rounded-full bg-status-good/15 px-2 py-0.5 text-xs font-medium text-status-good">Riuscito</span>
                  ) : (
                    <span className="rounded-full bg-status-critical/15 px-2 py-0.5 text-xs font-medium text-status-critical">Fallito</span>
                  )}
                </td>
                <td className="max-w-xs truncate px-4 py-2 text-xs text-ink-muted" title={e.userAgent ?? undefined}>
                  {e.userAgent ?? '—'}
                </td>
              </tr>
            ))}
          {!isLoading && entries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-muted">
                Nessun accesso registrato ancora.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function AdminPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-full bg-page">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-5">
        <ShieldCheck className="size-5 text-primary" />
        <h1 className="font-display text-base font-medium text-ink">LozioBoard — Admin</h1>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5"
          >
            <ArrowLeft className="size-3.5" /> Torna all'app
          </Link>
          <span className="text-xs text-ink-secondary">{user?.email}</span>
          <ChangePasswordPanel />
          <form method="POST" action="/api/auth/logout">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5"
            >
              <LogOut className="size-3.5" /> Esci
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <section>
          <p className="font-display mb-3 text-base font-medium text-ink">Account</p>
          <p className="mb-3 text-xs text-ink-muted">
            Ogni Editor e ogni Admin ha uno spazio dati isolato (giocatori, sessioni, impostazioni). Un Viewer
            vede in sola lettura solo lo spazio a cui è associato. L'Admin è un superuser: oltre al proprio
            spazio dati, gestisce gli account e il registro degli accessi.
          </p>
          <UsersSection />
        </section>

        <section>
          <p className="font-display mb-3 text-base font-medium text-ink">Registro accessi</p>
          <LoginAuditSection />
        </section>
      </main>
    </div>
  )
}
