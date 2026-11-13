import { createSession, loginPage, safeReturnPath, schemaNotReady } from '../../_lib/auth'
import type { Env } from '../../_lib/mappers'
import { verifyPassword } from '../../_lib/passwords'
import { recordTermsAcceptance } from '../../_lib/terms'

/** Blunt brute-force tax: a slow guess is a dead guess. */
const FAILED_ATTEMPT_DELAY_MS = 500

interface UserRow {
  id: string
  email: string
  password_hash: string
  active: number
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const returnPath = safeReturnPath(String(form.get('next') ?? '/'))
  const userAgent = request.headers.get('user-agent')

  // The checkbox is `required` in the form, but the browser is not the gate.
  if (form.get('terms') !== 'accepted') {
    return loginPage(returnPath, email, 'Per accedere devi accettare i Termini di utilizzo e l’Informativa privacy.')
  }

  let user: UserRow | null
  try {
    user = await env.DB.prepare('SELECT id, email, password_hash, active FROM users WHERE email = ? COLLATE NOCASE')
      .bind(email)
      .first<UserRow>()
  } catch {
    return schemaNotReady()
  }

  const passwordOk = user ? await verifyPassword(password, user.password_hash) : false
  const active = user ? Boolean(user.active) : false
  const success = passwordOk && active

  await env.DB.prepare(
    'INSERT INTO login_audit (id, user_id, email_attempted, success, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), user?.id ?? null, email, success ? 1 : 0, userAgent, new Date().toISOString())
    .run()

  if (!success) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS))
    return loginPage(returnPath, email, 'Email o password errati.')
  }

  // No session without a stored acceptance: if this write fails, so does the login.
  await recordTermsAcceptance(env, user!.id, userAgent)

  return new Response(null, {
    status: 303,
    headers: {
      location: returnPath,
      'set-cookie': await createSession(env, user!.id, userAgent),
      'cache-control': 'no-store',
    },
  })
}

/** Someone landing here directly gets the form, not a 405. */
export const onRequestGet: PagesFunction<Env> = async ({ request }) =>
  loginPage(safeReturnPath(new URL(request.url).searchParams.get('next')))
