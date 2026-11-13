import type { Env } from './mappers'
import { TERMS_PATH } from './terms'

/**
 * Multi-user auth: email + password accounts with three roles, backed by D1.
 *
 * Session tokens are opaque and random — the cookie carries the raw token,
 * D1 stores only its SHA-256 hash (`auth_sessions.token_hash`), so a leaked
 * database dump never hands out valid sessions. This also means sessions are
 * revocable server-side (logout deletes the row; deactivating a user makes
 * every one of their sessions fail the next lookup), unlike the old
 * single-password scheme where the password itself was the signing key.
 *
 * `__Host-` prefix is not decoration: the site is served on
 * nesso-loadboard.pages.dev, so every OTHER Pages project in the world is a
 * sibling subdomain of pages.dev and could set a `Domain=pages.dev` cookie
 * our origin would receive. Browsers refuse a `__Host-` cookie carrying a
 * Domain attribute, so a sibling cannot forge this one.
 */

export type Role = 'viewer' | 'editor' | 'admin'

export interface AuthContext {
  userId: string
  email: string
  role: Role
  /**
   * The workspace this user's requests are scoped to. Editors own their own
   * workspace (their user id); Viewers are bound to one Editor's workspace;
   * Admins have none — they never touch workspace-scoped data, only account
   * management and the login registry.
   */
  workspaceId: string | null
}

export interface AppData extends Record<string, unknown> {
  auth: AuthContext
}

const COOKIE_NAME = '__Host-loadboard_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * An Editor and an Admin each own the workspace keyed by their own user id; a
 * Viewer borrows the one it is bound to. Admin used to return null — account
 * management and nothing else — but it is now a superuser: the same data access
 * an Editor has, plus the account registry.
 */
function effectiveWorkspaceId(role: Role, userId: string, workspaceOwnerId: string | null): string | null {
  if (role === 'editor' || role === 'admin') return userId
  if (role === 'viewer') return workspaceOwnerId
  return null
}

export async function createSession(env: Env, userId: string, userAgent: string | null): Promise<string> {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)

  await env.DB.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(tokenHash, userId, now.toISOString(), expiresAt.toISOString(), now.toISOString(), userAgent)
    .run()

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
}

export const CLEARED_SESSION_COOKIE = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export async function resolveSession(request: Request, env: Env): Promise<AuthContext | null> {
  const token = readCookie(request, COOKIE_NAME)
  if (!token) return null
  const tokenHash = await sha256Hex(token)

  const row = await env.DB.prepare(
    `SELECT s.expires_at as expires_at, u.id as id, u.email as email, u.role as role,
            u.workspace_owner_id as workspace_owner_id, u.active as active
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<Record<string, unknown>>()

  if (!row || !row.active) return null
  if (new Date(row.expires_at as string).getTime() <= Date.now()) return null

  try {
    await env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?')
      .bind(new Date().toISOString(), tokenHash)
      .run()
  } catch {
    // Best-effort activity timestamp — never fail the request over it.
  }

  const role = row.role as Role
  const userId = row.id as string
  return {
    userId,
    email: row.email as string,
    role,
    workspaceId: effectiveWorkspaceId(role, userId, (row.workspace_owner_id as string | null) ?? null),
  }
}

export async function destroySession(request: Request, env: Env): Promise<void> {
  const token = readCookie(request, COOKIE_NAME)
  if (!token) return
  const tokenHash = await sha256Hex(token)
  await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run()
}

/** The gate cannot enforce anything if migration 0007 hasn't run yet — refuse, loudly, with a next step. */
export function schemaNotReady(): Response {
  return new Response(
    'Lo schema di autenticazione (tabelle users/auth_sessions/login_audit, colonne workspace_id) non risulta ancora applicato a questo database. ' +
      'Esegui `wrangler d1 migrations apply` e lo script di seed/backfill, poi ricarica.',
    { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

/**
 * Only same-origin absolute paths survive, so the login form cannot be turned
 * into an open redirect. `//evil.com` is a protocol-relative URL, not a path.
 */
export function safeReturnPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/')) return '/'
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return '/'
  return candidate
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Self-contained login page: inline CSS, no JS, no import of the React
 * bundle. The bundle is itself behind the gate, so a login screen that
 * depended on it could never render — this has to stand on its own.
 *
 * The palette is duplicated from src/index.css rather than imported, for the
 * same reason. Keep the two in step: the brand blue carries identity, the
 * yellow is reserved for the call to action.
 */
export function loginPage(returnPath: string, prefillEmail = '', error?: string): Response {
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>LozioBoard — Accesso</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    color-scheme: light dark;
    --page: #faf8f3; --surface: #ffffff; --ink: #12172b;
    --ink-secondary: #4b5468; --ink-muted: #8991a3;
    --border: rgba(29, 78, 216, 0.14);
    --primary: #1d4ed8;
    --accent: #fbbf24; --accent-ink: #12172b;
    --critical: #d03b3b;
    --cta-glow: none;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #070c10; --surface: #101820; --ink: #f4f6f9;
      --ink-secondary: #9aabbd; --ink-muted: #5c6b7d;
      --border: rgba(74, 156, 235, 0.22);
      --primary: #3b82f6;
      --accent: #f4c430; --accent-ink: #070c10;
      --critical: #e66767;
      --cta-glow: 0 6px 20px -4px rgba(244, 196, 48, 0.45);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px;
    display: flex; align-items: center; justify-content: center;
    background: var(--page); color: var(--ink);
    font-family: "Work Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main {
    width: 100%; max-width: 360px; padding: 36px 30px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px;
  }
  h1 {
    margin: 0; color: var(--primary);
    font-family: "Big Shoulders Display", "Work Sans", system-ui, sans-serif;
    font-size: 34px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.05;
    text-transform: uppercase;
  }
  p.sub { margin: 8px 0 26px; font-size: 13px; color: var(--ink-muted); }
  label { display: block; font-size: 12px; font-weight: 500; color: var(--ink-secondary); margin-bottom: 6px; }
  input {
    width: 100%; padding: 10px 12px; font: inherit; font-size: 14px;
    color: var(--ink); background: var(--page);
    border: 1px solid var(--border); border-radius: 6px;
  }
  input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
  .field { margin-bottom: 14px; }
  .terms { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 18px; }
  .terms input { width: 16px; height: 16px; margin: 2px 0 0; padding: 0; flex: none; accent-color: var(--primary); }
  .terms label { margin: 0; font-weight: 400; line-height: 1.45; }
  .terms a { color: var(--primary); }
  button {
    width: 100%; margin-top: 4px; padding: 11px 12px; font: inherit;
    font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px;
    color: var(--accent-ink); background: var(--accent); border: 0;
    box-shadow: var(--cta-glow); transition: opacity 0.15s;
  }
  button:hover { opacity: 0.9; }
  .error {
    margin: 0 0 18px; padding: 9px 11px; font-size: 13px; border-radius: 6px;
    color: var(--critical); border: 1px solid var(--critical);
  }
</style>
</head>
<body>
  <main>
    <h1>LozioBoard</h1>
    <p class="sub">Accesso riservato. Inserisci le tue credenziali per continuare.</p>
    ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/api/auth/login">
      <input type="hidden" name="next" value="${escapeHtml(returnPath)}" />
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(prefillEmail)}"
               autofocus required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <div class="terms">
        <input id="terms" name="terms" type="checkbox" value="accepted" required />
        <label for="terms">Ho letto e accetto i
          <a href="${TERMS_PATH}" target="_blank" rel="noopener">Termini di utilizzo e l'Informativa privacy</a>.</label>
      </div>
      <button type="submit">Entra</button>
    </form>
  </main>
</body>
</html>`

  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never let an intermediary cache the gate itself.
      'cache-control': 'no-store',
    },
  })
}
