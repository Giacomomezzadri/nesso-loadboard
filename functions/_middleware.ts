import { loginPage, resolveSession, safeReturnPath, schemaNotReady, type AppData } from './_lib/auth'
import { forbidden, json } from './_lib/json'
import type { Env } from './_lib/mappers'
import { TERMS_PATH } from './_lib/terms'

/**
 * Whole-site auth gate.
 *
 * A root-level `_middleware.ts` runs ahead of static assets on every path, so
 * this covers the SPA shell, the JS/CSS bundle and the D1-backed API alike —
 * there is no route that reaches a client-side check first. (Keep it that
 * way: adding a `_routes.json` that excludes paths would punch a hole
 * straight through this.)
 *
 * Beyond "is this a valid, active session", every /api/* request is also
 * checked against a role policy here — one chokepoint, not a check
 * duplicated in every handler:
 *   - /api/admin/*        → admin only (account management, login registry)
 *   - /api/auth/me|password → any signed-in user (self-service)
 *   - everything else      → admin/editor read-write, viewer read-only (GET)
 *
 * An Admin is a superuser: it owns a workspace like an Editor AND holds the
 * account registry, so it reaches both buckets. It used to be refused the
 * second one outright. The SPA shell itself (non-/api/
 * paths) is only gated on "signed in" — which screen renders for which role
 * is a client-side routing concern (see src/App.tsx), since Pages serves the
 * same bundle for every path in a client-routed app.
 */
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/favicon.svg', TERMS_PATH])
const SELF_SERVICE_AUTH_PATHS = new Set(['/api/auth/me', '/api/auth/password'])

export const onRequest: PagesFunction<Env, string, AppData> = async ({ request, env, next, data }) => {
  const url = new URL(request.url)

  // The login endpoint has to stay reachable or there is no way back in.
  if (PUBLIC_PATHS.has(url.pathname)) return next()

  let auth
  try {
    auth = await resolveSession(request, env)
  } catch {
    // Most likely cause: migration 0007 (users/auth_sessions/login_audit,
    // workspace_id columns) hasn't been applied to this database yet, so the
    // lookup query itself fails. Every request runs through here, so an
    // unguarded throw would take the whole site down with an opaque
    // Cloudflare "Worker threw exception" — fail loudly with an actionable
    // message instead.
    return schemaNotReady()
  }

  if (!auth) {
    // An unauthenticated XHR should fail as data, not as a login page the
    // fetch caller would try to parse as JSON.
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
    }
    return loginPage(safeReturnPath(url.pathname + url.search))
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (auth.role !== 'admin') return forbidden()
  } else if (!SELF_SERVICE_AUTH_PATHS.has(url.pathname) && url.pathname.startsWith('/api/')) {
    if (auth.role === 'viewer' && request.method !== 'GET') return forbidden()
  }

  data.auth = auth
  return next()
}
