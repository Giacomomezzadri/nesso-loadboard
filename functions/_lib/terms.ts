import type { Env } from './mappers'

/**
 * Terms of use + privacy notice shown at /termini and accepted on every login.
 *
 * Bump TERMS_VERSION whenever the text changes in substance: each acceptance
 * is stored with the version it was given against (`terms_acceptances`), so
 * the record proves who accepted which text and when.
 *
 * The [PLACEHOLDER] values below must be filled in by the club before the
 * text is meaningful — and the whole text should be reviewed by whoever
 * handles the club's GDPR compliance. It is a starting template, not legal advice.
 */
export const TERMS_VERSION = '2026-10-13'
export const TERMS_PATH = '/termini'

const CLUB_NAME = '[NOME DEL CLUB]'
const CLUB_ADDRESS = '[SEDE LEGALE DEL CLUB]'
const CLUB_EMAIL = '[EMAIL DI CONTATTO PRIVACY]'

function formatVersionDate(version: string): string {
  const [y, m, d] = version.split('-')
  return `${d}/${m}/${y}`
}

/** Append-only log of acceptances. Created on demand, same self-healing idea as ensureColumns. */
export async function recordTermsAcceptance(env: Env, userId: string, userAgent: string | null): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS terms_acceptances (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id),
       terms_version TEXT NOT NULL,
       accepted_at TEXT NOT NULL,
       user_agent TEXT
     )`,
  ).run()
  await env.DB.prepare(
    'INSERT INTO terms_acceptances (id, user_id, terms_version, accepted_at, user_agent) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), userId, TERMS_VERSION, new Date().toISOString(), userAgent)
    .run()
}

/** Public, self-contained page (no React bundle — it must render before login, like the login page). */
export function termsPage(): Response {
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>LozioBoard — Termini e privacy</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  :root {
    color-scheme: light dark;
    --page: #faf8f3; --surface: #ffffff; --ink: #12172b;
    --ink-secondary: #4b5468; --ink-muted: #8991a3;
    --border: rgba(29, 78, 216, 0.14); --primary: #1d4ed8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #070c10; --surface: #101820; --ink: #f4f6f9;
      --ink-secondary: #9aabbd; --ink-muted: #5c6b7d;
      --border: rgba(74, 156, 235, 0.22); --primary: #3b82f6;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px; background: var(--page); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6;
  }
  main {
    max-width: 760px; margin: 0 auto; padding: 32px 28px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  }
  h1 { margin: 0 0 4px; color: var(--primary); font-size: 28px; line-height: 1.2; }
  h2 { margin: 36px 0 8px; font-size: 20px; color: var(--primary); }
  h3 { margin: 22px 0 4px; font-size: 15px; }
  p, li { font-size: 14px; color: var(--ink-secondary); }
  .meta { margin: 0 0 24px; font-size: 13px; color: var(--ink-muted); }
  a { color: var(--primary); }
  ul { padding-left: 20px; }
</style>
</head>
<body>
<main>
  <h1>Termini di utilizzo e Informativa privacy</h1>
  <p class="meta">LozioBoard · versione del ${formatVersionDate(TERMS_VERSION)}</p>

  <h2>Parte A — Termini di utilizzo</h2>

  <h3>1. Oggetto</h3>
  <p>LozioBoard è una piattaforma ad accesso riservato messa a disposizione da ${CLUB_NAME} (di seguito «il Club») al proprio staff tecnico per il monitoraggio del carico di allenamento e di gara degli atleti (dati GPS, sforzo percepito, test fisici, riatletizzazione). Accedendo alla piattaforma l'utente accetta i presenti Termini.</p>

  <h3>2. Account e credenziali</h3>
  <ul>
    <li>L'account è personale e non cedibile. Le credenziali non vanno comunicate a nessuno.</li>
    <li>L'utente è responsabile delle attività svolte con il proprio account e deve segnalare subito al Club ogni sospetto di accesso non autorizzato.</li>
    <li>Su dispositivi condivisi l'utente deve effettuare il logout al termine dell'utilizzo.</li>
    <li>Il Club può sospendere o revocare un account in qualsiasi momento, in particolare alla cessazione del rapporto con l'utente.</li>
  </ul>

  <h3>3. Uso consentito</h3>
  <ul>
    <li>I dati presenti nella piattaforma possono essere usati solo per finalità di preparazione atletica, prevenzione degli infortuni e gestione sportiva per conto del Club.</li>
    <li>È vietato copiare, esportare, fotografare o condividere i dati degli atleti con soggetti esterni al Club senza autorizzazione.</li>
    <li>È vietato inserire i dati degli atleti in servizi di terzi non autorizzati dal Club, inclusi chatbot e strumenti di intelligenza artificiale generativa, fogli di calcolo o archivi cloud personali.</li>
    <li>È vietato tentare di accedere a dati di squadre o account diversi dal proprio, o eludere le misure di sicurezza.</li>
    <li>I dati inseriti devono essere pertinenti e limitati a quanto necessario. Non vanno inseriti diagnosi mediche o dati sanitari non richiesti dalla piattaforma.</li>
  </ul>

  <h3>4. Riservatezza</h3>
  <p>I dati trattati riguardano anche la salute degli atleti e, in alcuni casi, atleti minorenni. L'utente si impegna a mantenerli strettamente riservati anche dopo la fine del rapporto con il Club.</p>

  <h3>5. Disponibilità e responsabilità</h3>
  <p>La piattaforma è fornita come strumento di supporto. Le elaborazioni (medie, indici di carico, avvisi) sono calcoli automatici e non sostituiscono la valutazione professionale dello staff tecnico o medico. Il Club non garantisce la disponibilità ininterrotta del servizio.</p>

  <h3>6. Violazioni</h3>
  <p>L'uso non conforme ai presenti Termini può comportare la sospensione immediata dell'account, ferme restando le ulteriori responsabilità previste dalla legge.</p>

  <h3>7. Modifiche</h3>
  <p>Il Club può aggiornare questi Termini. La versione in vigore è sempre consultabile a questo indirizzo e va accettata a ogni accesso.</p>

  <h2>Parte B — Informativa privacy (art. 13 e 14 GDPR)</h2>

  <h3>1. Titolare del trattamento</h3>
  <p>${CLUB_NAME}, ${CLUB_ADDRESS}. Contatto per la privacy: <a href="mailto:${CLUB_EMAIL}">${CLUB_EMAIL}</a>.</p>

  <h3>2. Dati trattati</h3>
  <ul>
    <li><strong>Dati degli utenti (staff):</strong> email, ruolo, password in forma cifrata (hash), data e ora degli accessi, browser utilizzato, accettazione dei presenti Termini.</li>
    <li><strong>Dati degli atleti:</strong> nome, ruolo in campo, altezza, peso, dati GPS di allenamento e di gara (distanze, velocità, accelerazioni), sforzo percepito (RPE), test di sprint, sessioni di riatletizzazione. Alcuni di questi dati riguardano la salute (art. 9 GDPR).</li>
  </ul>

  <h3>3. Finalità e base giuridica</h3>
  <ul>
    <li>Gestione degli account e sicurezza della piattaforma: legittimo interesse del Club (art. 6.1.f GDPR).</li>
    <li>Monitoraggio del carico, prevenzione degli infortuni e programmazione dell'allenamento: esecuzione del rapporto sportivo (art. 6.1.b) e, per i dati relativi alla salute, consenso esplicito dell'atleta o di chi esercita la responsabilità genitoriale (art. 9.2.a) raccolto dal Club.</li>
  </ul>

  <h3>4. Atleti minorenni</h3>
  <p>Per gli atleti minorenni il trattamento avviene solo con il consenso di chi esercita la responsabilità genitoriale, raccolto dal Club al momento del tesseramento.</p>

  <h3>5. Chi accede ai dati</h3>
  <ul>
    <li>Ogni membro dello staff vede solo i dati della propria squadra. I dati di un atleta presente in due squadre vengono collegati solo con il consenso di entrambi gli allenatori responsabili.</li>
    <li>Gli amministratori della piattaforma, solo per la gestione tecnica.</li>
    <li>Cloudflare, Inc., fornitore dell'infrastruttura (hosting e database), in qualità di responsabile del trattamento. Cloudflare può trattare i dati anche fuori dall'Unione Europea, con le garanzie previste dagli artt. 44 e seguenti del GDPR (clausole contrattuali standard e EU-US Data Privacy Framework).</li>
  </ul>
  <p>I dati non vengono venduti, non sono usati per pubblicità e non sono inviati a servizi di intelligenza artificiale.</p>

  <h3>6. Sicurezza</h3>
  <p>L'accesso richiede autenticazione personale. Le password sono conservate solo in forma cifrata (hash), le connessioni sono protette con HTTPS, ogni accesso viene registrato e i dati di ciascuna squadra sono separati da quelli delle altre.</p>

  <h3>7. Conservazione</h3>
  <p>I dati degli atleti sono conservati per la durata del rapporto sportivo con il Club e per [PERIODO DI CONSERVAZIONE] dopo la sua conclusione, poi cancellati. I registri degli accessi sono conservati per [PERIODO] a fini di sicurezza.</p>

  <h3>8. Diritti degli interessati</h3>
  <p>Gli interessati possono chiedere al Titolare l'accesso ai propri dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e la revoca del consenso, senza pregiudizio per la liceità del trattamento già svolto, scrivendo a <a href="mailto:${CLUB_EMAIL}">${CLUB_EMAIL}</a>. Hanno inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" rel="noopener">www.garanteprivacy.it</a>).</p>

  <p class="meta" style="margin-top:32px"><a href="/">← Torna all'accesso</a></p>
</main>
</body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
