import type { Env } from './mappers'

/**
 * Terms of use + privacy notice shown at /termini and accepted on every login.
 *
 * Bump TERMS_VERSION whenever the text changes in substance: each acceptance
 * is stored with the version it was given against (`terms_acceptances`), so
 * the record proves who accepted which text and when.
 */
export const TERMS_VERSION = '2026-11-18'
export const TERMS_PATH = '/termini'

const CONTACT_EMAIL = 'mezzadrigiacomo8@gmail.com'
const MAIL = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`

/** Label of the separate approval required by artt. 1341–1342 c.c. for the onerous clauses. */
export const CLAUSES_CHECKBOX_LABEL =
  'Approvo specificamente, ai sensi degli artt. 1341 e 1342 c.c., le clausole: 2 (Uso consentito e divieti), ' +
  '3 (Dati sensibili e autorizzazione, Limitazione di responsabilità, Sospensione e chiusura dell’account), ' +
  '4 (Modifiche ai Termini, Legge applicabile e foro competente).'

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
<title>LozioBoard — Termini e Privacy</title>
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
  .toc { margin: -12px 0 8px; font-size: 13px; }
  .table-wrap { overflow-x: auto; margin: 8px 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; vertical-align: top; border: 1px solid var(--border); color: var(--ink-secondary); }
  th { color: var(--ink); font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Termini e Condizioni d'uso e Informativa Privacy</h1>
  <p class="meta">LozioBoard · ultimo aggiornamento: ${formatVersionDate(TERMS_VERSION)}</p>
  <nav class="toc"><a href="#termini">Termini e Condizioni d'uso</a> · <a href="#privacy">Informativa Privacy</a></nav>

  <h2 id="termini">Termini e Condizioni d'uso</h2>

  <h3>1. Oggetto e accettazione</h3>
  <p>I presenti Termini e Condizioni regolano l'accesso e l'uso della piattaforma web nesso-loadboard («la Piattaforma»), gestita da Giacomo Mezzadri, contattabile all'indirizzo ${MAIL} («il Gestore»). La Piattaforma consente di importare dati di allenamento e di prestazione e di elaborarli in statistiche e grafici per lo staff tecnico e sportivo.</p>
  <p>Per «Cliente» si intende l'organizzazione che ha concordato l'uso della Piattaforma con il Gestore. Per «Utente» si intende la persona autorizzata dal Cliente ad accedere con un account personale.</p>
  <p>Selezionando la casella «Accetto i Termini e Condizioni» e accedendo alla Piattaforma, l'Utente dichiara di aver letto e di accettare questi Termini e l'Informativa Privacy. Chi non li accetta non può usare la Piattaforma.</p>
  <p><strong>Requisiti.</strong> La Piattaforma è destinata a un uso professionale. L'Utente deve avere almeno 18 anni, essere stato autorizzato dal Cliente e usare i dati forniti in fase di registrazione in modo veritiero. L'accesso avviene con le credenziali personali e con il ruolo assegnato, Viewer (sola lettura), Editor (caricamento e modifica dei dati) o Admin (gestione di account e impostazioni). Il ruolo definisce le funzioni disponibili.</p>

  <h3>2. Uso consentito, credenziali e riservatezza</h3>
  <p><strong>Uso consentito.</strong> La Piattaforma può essere usata solo per scopi professionali legati all'attività sportiva del Cliente: monitoraggio del carico di lavoro, analisi delle prestazioni e pianificazione degli allenamenti.</p>
  <p><strong>Credenziali.</strong> Le credenziali sono personali e non cedibili. L'Utente deve conservarle con cura, non condividerle con colleghi o terzi e scegliere una password robusta. L'Utente è responsabile delle azioni compiute con il proprio account. Se sospetta un accesso non autorizzato, deve avvisare subito il Gestore.</p>
  <p><strong>Riservatezza.</strong> I dati visualizzati nella Piattaforma, in particolare quelli degli atleti, sono riservati. L'Utente si impegna a non copiarli, esportarli, fotografarli o comunicarli a persone non autorizzate dal Cliente e a rispettare gli obblighi di riservatezza previsti dal proprio contratto con il Cliente. Questo obbligo continua anche dopo la chiusura dell'account.</p>
  <p><strong>Divieti.</strong> È vietato:</p>
  <ul>
    <li>caricare dati senza averne il diritto o senza avere informato gli interessati come richiede la legge;</li>
    <li>usare la Piattaforma per finalità illecite o diverse da quelle sopra indicate;</li>
    <li>tentare di aggirare le misure di sicurezza, accedere ad account altrui o a dati per cui non si è autorizzati;</li>
    <li>fare reverse engineering, copiare, rivendere o distribuire la Piattaforma o il suo codice;</li>
    <li>caricare file contenenti virus, codice dannoso o dati non pertinenti;</li>
    <li>inserire nella Piattaforma dati reali di atleti in strumenti esterni, come chatbot o servizi di intelligenza artificiale, senza autorizzazione scritta del Cliente.</li>
  </ul>

  <h3>3. Dati, proprietà intellettuale, disponibilità e responsabilità</h3>
  <p><strong>Dati caricati.</strong> I dati caricati restano di proprietà del Cliente. Per ragioni tecniche il Gestore, in quanto amministratore della Piattaforma e dei database che la ospitano, può avere accesso ai dati caricati, anche se non li consulta nell'uso ordinario. Vi accede solo per manutenzione, assistenza, sicurezza e correzione di malfunzionamenti, oppure su richiesta del Cliente. Non li usa per altri scopi, non li vende, non li cede a terzi per fini propri e non li usa per addestrare sistemi di intelligenza artificiale. Il trattamento avviene secondo l'Informativa Privacy e l'eventuale atto di nomina a Responsabile del trattamento concordato con il Cliente. Il Cliente e l'Utente garantiscono di avere il diritto di caricarli e di aver adempiuto agli obblighi di informativa verso gli interessati, in particolare verso gli atleti e i genitori degli atleti minorenni.</p>
  <p><strong>Dati sensibili e autorizzazione.</strong> I dati degli atleti possono contenere informazioni sulla condizione fisica o sulla salute, che la legge tutela in modo rafforzato (art. 9 GDPR). L'Utente si impegna a caricare solo i dati necessari alle finalità indicate e a non inserire diagnosi, referti medici o altre informazioni sanitarie dettagliate, salvo che il Cliente le abbia autorizzate e la Piattaforma sia predisposta per gestirle. Caricando dati, l'Utente dichiara di essere stato autorizzato dal Cliente, che il Cliente ha una base giuridica valida per il trattamento e che gli interessati (e i genitori dei minori) sono stati informati. L'Utente tiene indenne il Gestore da pretese di terzi e da danni derivanti da dati caricati senza autorizzazione o in violazione di questi obblighi. Il Gestore può sospendere l'account e bloccare i dati interessati se ha fondati dubbi sull'autorizzazione al caricamento.</p>
  <p><strong>Proprietà intellettuale.</strong> La Piattaforma, il suo codice, la grafica, la struttura e i metodi di calcolo restano di esclusiva proprietà del Gestore. L'uso della Piattaforma concede solo un diritto personale, non esclusivo e non trasferibile di utilizzo per la durata del rapporto. Nessun diritto di proprietà viene trasferito.</p>
  <p><strong>Disponibilità del servizio.</strong> Il Gestore si impegna a mantenere la Piattaforma operativa con ragionevole diligenza, ma non garantisce un funzionamento ininterrotto o privo di errori. Possono verificarsi interruzioni per manutenzione, aggiornamenti o cause esterne, come guasti dei fornitori di hosting. I malfunzionamenti segnalati vengono gestiti con tempi ragionevoli, secondo quanto concordato con il Cliente.</p>
  <p><strong>Natura delle elaborazioni.</strong> Le statistiche e le segnalazioni prodotte dalla Piattaforma sono un supporto alle valutazioni dello staff e non sostituiscono il giudizio professionale, né una valutazione medica. Le decisioni su allenamento, carichi e salute degli atleti restano di responsabilità del Cliente e dei suoi professionisti. L'accuratezza dei risultati dipende anche dalla qualità dei dati caricati.</p>
  <p><strong>Limitazione di responsabilità.</strong> Nei limiti consentiti dalla legge, il Gestore non risponde di danni indiretti, perdita di profitto o danni derivanti da dati errati caricati dall'Utente, da uso non conforme dei Termini, da interruzioni di servizi di terzi o da cause di forza maggiore. Restano ferme le responsabilità che non possono essere escluse per legge, in particolare in caso di dolo o colpa grave. Per eventuali danni diretti, la responsabilità del Gestore è limitata all'importo effettivamente pagato dal Cliente al Gestore nei 12 mesi precedenti l'evento dannoso.</p>
  <p><strong>Sospensione e chiusura dell'account.</strong> Il Gestore può sospendere o chiudere l'account, anche senza preavviso, in caso di violazione dei Termini, uso illecito, rischi per la sicurezza o su richiesta del Cliente. L'Utente può chiedere la chiusura del proprio account in qualsiasi momento. Alla cessazione dei rapporti con il Cliente, i dati sono restituiti e cancellati come indicato nell'Informativa Privacy.</p>

  <h3>4. Modifiche, legge applicabile e contatti</h3>
  <p><strong>Modifiche ai Termini.</strong> Il Gestore può aggiornare questi Termini per esigenze tecniche, organizzative o normative. Le modifiche sostanziali vengono comunicate agli Utenti e, se richiesto, accettate di nuovo al primo accesso successivo. L'uso continuato della Piattaforma dopo la comunicazione vale come accettazione, salvo diversa previsione di legge.</p>
  <p><strong>Legge applicabile e foro competente.</strong> I Termini sono regolati dalla legge italiana. Per ogni controversia è competente in via esclusiva il foro del luogo di residenza del Gestore, salvo diversa disposizione inderogabile di legge.</p>
  <p><strong>Contatti.</strong> Per assistenza, segnalazioni e richieste: ${MAIL}.</p>

  <h2 id="privacy">Informativa Privacy</h2>

  <h3>1. Chi siamo e quali ruoli ricopriamo</h3>
  <p>Questa informativa spiega come vengono trattati i dati personali attraverso la piattaforma web nesso-loadboard (di seguito «la Piattaforma»), ai sensi del Regolamento (UE) 2016/679 («GDPR») e del D.Lgs. 196/2003 e successive modifiche. La Piattaforma serve a importare i dati di allenamento e di prestazione raccolti con dispositivi di monitoraggio (ad esempio GPS) e a trasformarli in statistiche e grafici per lo staff tecnico e sportivo.</p>
  <p>I ruoli privacy sono distribuiti così:</p>
  <ul>
    <li><strong>Gestore della Piattaforma:</strong> Giacomo Mezzadri, contattabile all'indirizzo ${MAIL}. Gestisce e mantiene la Piattaforma. Per i dati degli account degli utenti agisce come titolare del trattamento. Per i dati sportivi caricati dalle organizzazioni che usano la Piattaforma agisce come responsabile del trattamento, secondo le istruzioni dell'organizzazione.</li>
    <li><strong>Organizzazione che utilizza la Piattaforma («Cliente»):</strong> società sportiva, centro di preparazione o altro ente che decide quali dati caricare e per quali scopi. È titolare del trattamento dei dati degli atleti e degli altri soggetti che inserisce.</li>
    <li><strong>Utenti:</strong> le persone autorizzate dal Cliente ad accedere alla Piattaforma con un account personale (ad esempio preparatori atletici, allenatori, staff tecnico).</li>
    <li><strong>Atleti:</strong> le persone i cui dati di allenamento e di prestazione vengono caricati dal Cliente.</li>
  </ul>

  <h3>2. Quali dati trattiamo, perché e su quale base</h3>
  <p><strong>Dati degli utenti.</strong> Email, ruolo assegnato, password conservata solo in forma cifrata (hash), data e ora degli accessi e dei tentativi di accesso, browser e dispositivo utilizzati (registrati a fini di sicurezza), data, ora e versione dei Termini accettati.</p>
  <p><strong>Dati degli atleti caricati dal Cliente.</strong> Nome o codice identificativo, squadra e ruolo in campo, dati prodotti dai dispositivi di monitoraggio GPS (durata, distanza percorsa, velocità, sprint, accelerazioni e decelerazioni, distanze per zona di intensità), peso e altezza, test di sprint e di salto, misure antropometriche e di composizione corporea (ad esempio pliche, massa grassa e massa muscolare), valutazioni soggettive dello sforzo (RPE) e carico interno, stato dell'atleta nelle singole sessioni (ad esempio assente, palestra, riatletizzazione), note sulle sessioni. Alcuni di questi dati possono fornire indicazioni sulla condizione fisica o sullo stato di salute dell'atleta e vanno quindi trattati come dati di categoria particolare (art. 9 GDPR), con le tutele rafforzate che la legge prevede.</p>
  <p><strong>Finalità e basi giuridiche.</strong></p>
  <div class="table-wrap"><table>
    <thead><tr><th>Finalità</th><th>Base giuridica</th><th>Dati</th></tr></thead>
    <tbody>
      <tr><td>Creare e gestire gli account, consentire l'accesso e assegnare i ruoli</td><td>Esecuzione del contratto o della collaborazione con l'utente o con il Cliente (art. 6.1.b)</td><td>Dati degli utenti</td></tr>
      <tr><td>Garantire la sicurezza della Piattaforma, prevenire accessi non autorizzati, tenere il registro degli accessi</td><td>Legittimo interesse alla sicurezza (art. 6.1.f)</td><td>Dati degli utenti, registro degli accessi</td></tr>
      <tr><td>Elaborare i dati di allenamento per statistiche, grafici e monitoraggio del carico</td><td>Stabilita dal Cliente come titolare, ad esempio contratto con l'atleta, consenso o altra base valida (art. 6 e art. 9.2)</td><td>Dati degli atleti</td></tr>
      <tr><td>Assistenza tecnica e correzione di malfunzionamenti</td><td>Esecuzione del contratto di servizio con il Cliente</td><td>Dati degli utenti e, se strettamente necessario, degli atleti</td></tr>
      <tr><td>Adempiere a obblighi di legge</td><td>Obbligo legale (art. 6.1.c)</td><td>Dati necessari</td></tr>
    </tbody>
  </table></div>
  <p>I dati non sono usati per profilazione commerciale, non sono venduti e non sono usati per addestrare sistemi di intelligenza artificiale.</p>
  <p><strong>Atleti minorenni.</strong> Quando i dati riguardano atleti minorenni, il Cliente è responsabile di informare chi esercita la responsabilità genitoriale e di raccogliere gli eventuali consensi necessari. Il Gestore tratta questi dati con particolare cautela e solo per le finalità indicate.</p>
  <p><strong>Natura del conferimento.</strong> Per gli utenti, il conferimento dei dati dell'account è necessario per usare la Piattaforma. Senza di essi non è possibile creare l'account.</p>

  <h3>3. A chi comunichiamo i dati, per quanto tempo e come li proteggiamo</h3>
  <p><strong>Destinatari.</strong> I dati sono accessibili solo agli utenti autorizzati dal Cliente, secondo il ruolo assegnato (Viewer: sola lettura, Editor: caricamento e modifica dei dati, Admin: amministrazione), e al Gestore per manutenzione e assistenza. Il Gestore, in quanto amministratore tecnico della Piattaforma e dei database, ha tecnicamente la possibilità di accedere ai dati caricati, ma lo fa solo per manutenzione, assistenza, sicurezza e correzione di malfunzionamenti, oppure su richiesta del titolare, e non li usa per altri scopi. I dati non sono diffusi né ceduti a terzi per fini propri.</p>
  <p><strong>Fornitori di servizi.</strong> Per far funzionare la Piattaforma ci avvaliamo di fornitori che trattano i dati per nostro conto come sub-responsabili, vincolati da un contratto conforme all'art. 28 GDPR:</p>
  <ul>
    <li><strong>Cloudflare, Inc.</strong>, per l'hosting del sito, le funzioni lato server e il database.</li>
    <li>eventuali altri fornitori tecnici (ad esempio servizi di pagamento o di posta elettronica), se attivati, indicati nell'elenco aggiornato disponibile su richiesta.</li>
  </ul>
  <p>L'elenco aggiornato è disponibile su richiesta.</p>
  <p><strong>Trasferimenti fuori dallo Spazio Economico Europeo.</strong> Alcuni fornitori possono trattare dati in Paesi extra UE. In tal caso il trasferimento avviene sulla base di una decisione di adeguatezza della Commissione europea o di garanzie adeguate, come le clausole contrattuali standard.</p>
  <p><strong>Strumenti di intelligenza artificiale.</strong> I dati reali degli atleti non vengono inseriti in chatbot o servizi di intelligenza artificiale esterni senza l'autorizzazione scritta del Cliente. Per sviluppo e assistenza si usano dati fittizi.</p>
  <p><strong>Conservazione.</strong></p>
  <div class="table-wrap"><table>
    <thead><tr><th>Dati</th><th>Periodo di conservazione</th></tr></thead>
    <tbody>
      <tr><td>Dati dell'account</td><td>Fino alla chiusura dell'account, poi cancellati entro 30 giorni</td></tr>
      <tr><td>Registro degli accessi</td><td>12 mesi, poi cancellato o anonimizzato</td></tr>
      <tr><td>Dati degli atleti</td><td>Per la durata del rapporto con il Cliente. Alla cessazione sono restituiti e cancellati entro 30 giorni, salvo obblighi di legge. Il Cliente può chiederne prima la cancellazione</td></tr>
      <tr><td>Copie di backup</td><td>Fino a 30 giorni dalla cancellazione dai sistemi principali</td></tr>
    </tbody>
  </table></div>
  <p><strong>Misure di sicurezza.</strong> Adottiamo misure tecniche e organizzative adeguate al rischio, tra cui:</p>
  <ul>
    <li>connessione cifrata HTTPS;</li>
    <li>password conservate solo in forma cifrata;</li>
    <li>account personali e ruoli distinti, con accesso limitato a ciò che serve a ciascun utente;</li>
    <li>chiavi e segreti conservati come variabili protette e mai nel codice pubblico;</li>
    <li>accesso amministrativo all'infrastruttura limitato al minimo necessario;</li>
    <li>backup periodici e procedura di gestione delle violazioni dei dati.</li>
  </ul>
  <p>In caso di violazione dei dati personali informiamo senza ritardo il Cliente, che valuta la notifica al Garante entro 72 ore e, se necessario, la comunicazione agli interessati.</p>

  <h3>4. Cookie, diritti e contatti</h3>
  <p><strong>Cookie.</strong> La Piattaforma usa solo un cookie tecnico di sessione, necessario per mantenere l'accesso dopo il login. Il cookie è di tipo HttpOnly e Secure e scade dopo 30 giorni o alla disconnessione. Non usiamo cookie di profilazione né strumenti di analisi o pubblicità di terze parti, quindi non è richiesto il consenso preventivo. Se in futuro ne introdurremo, aggiorneremo questa informativa e chiederemo il consenso dove necessario.</p>
  <p><strong>I tuoi diritti.</strong> In base al GDPR puoi esercitare in qualsiasi momento i seguenti diritti:</p>
  <ul>
    <li>accesso ai tuoi dati e copia degli stessi (art. 15);</li>
    <li>rettifica dei dati inesatti o incompleti (art. 16);</li>
    <li>cancellazione, nei casi previsti (art. 17);</li>
    <li>limitazione del trattamento (art. 18);</li>
    <li>portabilità dei dati in formato strutturato (art. 20);</li>
    <li>opposizione al trattamento fondato sul legittimo interesse (art. 21);</li>
    <li>revoca del consenso, ove il trattamento si basi su di esso, senza pregiudicare i trattamenti già effettuati.</li>
  </ul>
  <p><strong>Come esercitarli.</strong> Scrivi a ${MAIL}. Se i tuoi dati sono stati caricati da un'organizzazione sportiva (sei un atleta o un genitore di un atleta minorenne), rivolgiti in primo luogo a quell'organizzazione, che è il titolare del trattamento. Se ci scrivi per errore, inoltreremo la richiesta al titolare competente. Rispondiamo entro un mese dalla richiesta, prorogabile di due mesi nei casi complessi.</p>
  <p><strong>Reclamo all'autorità di controllo.</strong> Hai il diritto di presentare reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" rel="noopener">www.garanteprivacy.it</a>) se ritieni che il trattamento violi la normativa.</p>
  <p><strong>Processi decisionali automatizzati.</strong> La Piattaforma produce statistiche e segnalazioni a supporto dello staff, ma non prende decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici sugli interessati.</p>
  <p><strong>Modifiche a questa informativa.</strong> Possiamo aggiornare questo testo per cambiamenti normativi o della Piattaforma. La versione in vigore è sempre quella pubblicata sul sito, con indicata la data dell'ultimo aggiornamento.</p>

  <p class="meta" style="margin-top:32px">Ultimo aggiornamento: ${formatVersionDate(TERMS_VERSION)} · <a href="/">← Torna all'accesso</a></p>
</main>
</body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
