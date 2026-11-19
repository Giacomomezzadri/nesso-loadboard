import { SLEEP_HOURS_MAX, WELLNESS_FACES, WELLNESS_ITEMS, WELLNESS_NOTE_MAX } from '../../src/lib/metrics/wellness'
import type { WellnessEntry } from '../../src/types/domain'
import { escapeHtml } from './auth'
import type { Env } from './mappers'

/**
 * Same statements as migrations/0017_wellness.sql, run before every wellness query so the
 * feature works even if the migration was never applied by hand (Pages never auto-applies
 * migrations). IF NOT EXISTS makes them no-ops once the tables exist.
 */
export async function ensureWellnessTables(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS wellness_entries (
        workspace_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        date TEXT NOT NULL,
        sleep INTEGER NOT NULL,
        stress INTEGER NOT NULL,
        fatigue INTEGER NOT NULL,
        soreness INTEGER NOT NULL,
        mood INTEGER NOT NULL,
        sleep_hours REAL,
        note TEXT,
        submitted_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, player_id, date)
      )`,
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_wellness_entries_date ON wellness_entries(workspace_id, date)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS wellness_links (
        workspace_id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )`,
    ),
  ])
}

export function rowToWellness(r: Record<string, unknown>): WellnessEntry {
  return {
    playerId: r.player_id as string,
    date: r.date as string,
    sleep: r.sleep as number,
    stress: r.stress as number,
    fatigue: r.fatigue as number,
    soreness: r.soreness as number,
    mood: r.mood as number,
    sleepHours: (r.sleep_hours as number | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
    submittedAt: r.submitted_at as string,
  }
}

/** The public form path for a token — the only thing the athletes ever see of the app. */
export const WELLNESS_FORM_PREFIX = '/q/'

// ---------------------------------------------------------------------------
// Public pages. Self-contained HTML (inline CSS, a few lines of inline JS that the form
// does not depend on): the React bundle sits behind the login gate, so these can't use it.
// The palette is the one of the login page in auth.ts.
// ---------------------------------------------------------------------------

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  // The token is in the URL — never leak it to another site via Referer.
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
}

const STYLE = `
  :root {
    color-scheme: light dark;
    --page: #faf8f3; --surface: #ffffff; --ink: #12172b;
    --ink-secondary: #4b5468; --ink-muted: #8991a3;
    --border: rgba(29, 78, 216, 0.14);
    --primary: #1d4ed8; --primary-soft: rgba(29, 78, 216, 0.10);
    --accent: #fbbf24; --accent-ink: #12172b;
    --critical: #d03b3b; --good: #0ca30c;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #070c10; --surface: #101820; --ink: #f4f6f9;
      --ink-secondary: #9aabbd; --ink-muted: #5c6b7d;
      --border: rgba(74, 156, 235, 0.22);
      --primary: #3b82f6; --primary-soft: rgba(59, 130, 246, 0.18);
      --accent: #f4c430; --accent-ink: #070c10;
      --critical: #e66767; --good: #3fbf5a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px 16px 40px; background: var(--page); color: var(--ink);
    font-family: "Work Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 480px; margin: 0 auto; }
  h1 {
    margin: 0; color: var(--primary);
    font-family: "Big Shoulders Display", "Work Sans", system-ui, sans-serif;
    font-size: 30px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.05; text-transform: uppercase;
  }
  p.sub { margin: 6px 0 20px; font-size: 14px; color: var(--ink-secondary); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  label.lbl, legend { display: block; font-size: 15px; font-weight: 600; margin-bottom: 10px; padding: 0; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  select, textarea, input[type=number] {
    width: 100%; padding: 12px; font: inherit; font-size: 16px; color: var(--ink);
    background: var(--page); border: 1px solid var(--border); border-radius: 8px;
  }
  textarea { min-height: 70px; resize: vertical; }
  select:focus, textarea:focus, input[type=number]:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
  .scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .opt { position: relative; }
  .opt input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .opt span {
    display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 2px 8px;
    border: 1px solid var(--border); border-radius: 10px; background: var(--page);
    font-size: 11px; line-height: 1.15; text-align: center; color: var(--ink-secondary);
  }
  .opt span b { font-size: 26px; line-height: 1; font-weight: 400; }
  .opt input:checked + span { border-color: var(--primary); background: var(--primary-soft); color: var(--ink); box-shadow: 0 0 0 1px var(--primary); }
  .opt input:focus-visible + span { outline: 2px solid var(--primary); outline-offset: 2px; }
  button {
    width: 100%; margin-top: 8px; padding: 15px 12px; font: inherit; font-size: 16px; font-weight: 600;
    cursor: pointer; border-radius: 10px; color: var(--accent-ink); background: var(--accent); border: 0;
  }
  .hint { font-size: 12px; color: var(--ink-muted); margin: 6px 0 0; }
  .error { margin: 0 0 14px; padding: 10px 12px; font-size: 14px; border-radius: 8px; color: var(--critical); border: 1px solid var(--critical); }
  .done { text-align: center; padding: 28px 16px; }
  .done .big { font-size: 48px; line-height: 1; }
  a { color: var(--primary); }
`

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`
  return new Response(html, { status, headers: PAGE_HEADERS })
}

export function invalidLinkPage(): Response {
  return page(
    'Link non valido',
    `<h1>Wellness</h1>
     <div class="card done"><p class="big">🔒</p>
       <p>Questo link non è più attivo.</p>
       <p class="hint">Chiedi al preparatore il link aggiornato.</p></div>`,
    404,
  )
}

export function wellnessFormPage(opts: {
  formAction: string
  players: { id: string; name: string }[]
  dateLabel: string
  error?: string
}): Response {
  const options = opts.players.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')
  const items = WELLNESS_ITEMS.map(
    (item) => `
    <fieldset class="card">
      <legend>${escapeHtml(item.question)}</legend>
      <div class="scale">
        ${item.answers
          .map(
            (answer, i) => `<label class="opt">
          <input type="radio" name="${item.key}" value="${i + 1}" required aria-label="${i + 1} – ${escapeHtml(answer)}" />
          <span><b aria-hidden="true">${WELLNESS_FACES[i]}</b>${escapeHtml(answer)}</span>
        </label>`,
          )
          .join('')}
      </div>
    </fieldset>`,
  ).join('')

  return page(
    'Wellness mattutino',
    `<h1>Wellness</h1>
     <p class="sub">Questionario del mattino · ${escapeHtml(opts.dateLabel)}<br />Rispondi appena sveglio, ci vuole meno di un minuto.</p>
     ${opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : ''}
     <form method="POST" action="${escapeHtml(opts.formAction)}">
       <div class="card">
         <label class="lbl" for="player">Chi sei?</label>
         <select id="player" name="player" required>
           <option value="" disabled selected>Scegli il tuo nome</option>
           ${options}
         </select>
       </div>
       <div class="card">
         <label class="lbl" for="sleep_hours">Quante ore hai dormito?</label>
         <input id="sleep_hours" name="sleep_hours" type="number" inputmode="decimal" min="0" max="${SLEEP_HOURS_MAX}" step="0.5" required placeholder="Es. 7.5" />
         <p class="hint">Ore effettive di sonno, a mezz'ora (7.5 = sette ore e mezza).</p>
       </div>
       ${items}
       <div class="card">
         <label class="lbl" for="note">Note <span style="font-weight:400;color:var(--ink-muted)">(facoltativo)</span></label>
         <textarea id="note" name="note" maxlength="${WELLNESS_NOTE_MAX}" placeholder="Es. dolore al polpaccio destro, dormito poco per il viaggio…"></textarea>
       </div>
       <button type="submit">Invia</button>
       <p class="hint">Le risposte sono visibili solo allo staff. Se invii di nuovo oggi, sostituisci le risposte precedenti.</p>
     </form>
     <script>
       // Remember who filled it in on this phone, so tomorrow the name is already chosen.
       (function () {
         var sel = document.getElementById('player');
         try {
           var last = localStorage.getItem('wellness_player');
           if (last && sel.querySelector('option[value="' + CSS.escape(last) + '"]')) sel.value = last;
           sel.addEventListener('change', function () { localStorage.setItem('wellness_player', sel.value); });
         } catch (e) {}
       })();
     </script>`,
  )
}

export function wellnessThanksPage(opts: { playerName: string; dateLabel: string; formAction: string }): Response {
  return page(
    'Risposte inviate',
    `<h1>Wellness</h1>
     <div class="card done"><p class="big">✅</p>
       <p>Grazie <strong>${escapeHtml(opts.playerName)}</strong>, risposte registrate per ${escapeHtml(opts.dateLabel)}.</p>
       <p class="hint"><a href="${escapeHtml(opts.formAction)}">Hai sbagliato qualcosa? Compila di nuovo</a></p></div>`,
  )
}

export function wellnessErrorPage(message: string, formAction: string): Response {
  return page(
    'Errore',
    `<h1>Wellness</h1>
     <p class="error" role="alert">${escapeHtml(message)}</p>
     <p><a href="${escapeHtml(formAction)}">Torna al questionario</a></p>`,
    400,
  )
}
