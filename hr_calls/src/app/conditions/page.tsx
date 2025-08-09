// /conditions/page.tsx
// Condizioni d'uso basilari trascritte per HR Calls, in quanto progetto dimostrativo che però andrà online
// NOTA: Queste condizioni sono un esempio e non devono essere considerate per un effettivo utilizzo commerciale.

export default function ConditionsPage() {
  return (
    <main className="min-h-screen w-full relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-white to-indigo-50" />
      <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.06),transparent_60%)]" />

      <section className="mx-auto flex max-w-3xl flex-col items-stretch justify-center p-6 md:p-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Condizioni d&rsquo;uso di <span className="text-blue-400">HR Calls</span>
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Ultimo aggiornamento: 9 agosto 2025 • Progetto dimostrativo realizzato per una posizione lavorativa.
          </p>
        </header>

        <article className="space-y-8 rounded-3xl border bg-white/80 p-6 shadow-sm backdrop-blur md:p-8">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">1. Introduzione</h2>
            <p className="text-gray-700">
              Queste Condizioni d&rsquo;uso (&ldquo;Condizioni&rdquo;) regolano l&rsquo;utilizzo
              dell&rsquo;applicazione <strong>HR Calls</strong> (l&rsquo;&ldquo;App&rdquo;). L&rsquo;App è
              un prototipo a scopo dimostrativo e di valutazione tecnica. Non è destinata a uso
              commerciale o di produzione. Utilizzando l&rsquo;App, accetti queste Condizioni.
            </p>
            <p className="text-xs text-gray-500">
              Nota: questo testo ha finalità informative
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">2. Requisiti d&rsquo;uso</h2>
            <p className="text-gray-700">
              Devi avere la capacità di stipulare un contratto e usare l&rsquo;App solo per scopi leciti
              e nel rispetto delle leggi applicabili. L&rsquo;App è fornita &ldquo;così com&rsquo;è&rdquo;
              senza garanzie di disponibilità o accuratezza.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">3. Account nell&rsquo;App</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              <li>Puoi creare un account all&rsquo;interno dell&rsquo;App per accedere alle funzionalità.</li>
              <li>Sei responsabile di mantenere riservate le tue credenziali.</li>
              <li>
                Al momento <strong>non è disponibile</strong> la cancellazione autonoma dell&rsquo;account
                dall&rsquo;App. Puoi comunque disconnettere le integrazioni esterne come descritto sotto.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">4. Integrazione con Google Calendar</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-2">
              <li>
                Puoi collegare il tuo account Google per consentire all&rsquo;App la <strong>sola lettura</strong>{' '}
                degli eventi di calendario (in base ai consensi richiesti).
              </li>
              <li>
                L&rsquo;App memorizza in modo sicuro il tuo identificativo Google e i token OAuth necessari
                a leggere i dati autorizzati. I token di accesso sono temporanei; i token di refresh possono essere
                conservati finché mantieni il collegamento.
              </li>
              <li>
                Puoi <strong>revocare</strong> in qualsiasi momento il collegamento a Google dall&rsquo;App
                (es. pulsante &ldquo;Disconnetti&rdquo;) e/o dalle impostazioni del tuo account Google
                (Permessi di terze parti). Dopo la revoca, l&rsquo;App non potrà più accedere ai tuoi dati Google.
              </li>
              <li>
                L&rsquo;App non vende i tuoi dati a terze parti e non condivide i token con soggetti esterni.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">5. Cookie</h2>
            <p className="text-gray-700">
              L&rsquo;App utilizza cookie e tecnologie simili per autenticazione, sicurezza, preferenze e
              funzionalità di base. I cookie sono usati <strong>solo internamente</strong> per far funzionare
              l&rsquo;App e non sono venduti a terze parti.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">6. Dati trattati</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              <li>Dati di registrazione dell&rsquo;account (es. username, email opzionale, nome).</li>
              <li>
                Dati relativi a Google Calendar secondo i consensi concessi (es. eventi, disponibilità).
              </li>
              <li>
                <strong>Log delle chiamate/attività organizzate</strong> dall&rsquo;utente all&rsquo;interno
                dell&rsquo;App (per finalità di funzionamento e diagnostica).
              </li>
              <li>Dati tecnici (IP, tipo di dispositivo, orari di accesso) per sicurezza e monitoraggio.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">7. Finalità d&rsquo;uso dei dati</h2>
            <p className="text-gray-700">
              Utilizziamo i dati per fornire e migliorare l&rsquo;App, garantire sicurezza, risolvere
              problemi tecnici, e mostrare informazioni di calendario se autorizzate.
              Non effettuiamo vendita di dati a terzi.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">8. Conservazione</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              <li>
                I token OAuth e l&rsquo;identificativo del tuo account Google sono conservati finché mantieni
                il collegamento o fino a revoca manuale.
              </li>
              <li>
                I log tecnici e delle attività possono essere conservati per un periodo ragionevole ai fini di
                sicurezza, audit e diagnostica dell&rsquo;App.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">9. Sicurezza</h2>
            <p className="text-gray-700">
              Adottiamo misure tecniche e organizzative proporzionate a un progetto dimostrativo per proteggere
              i dati. Tuttavia, nessun sistema è completamente sicuro: utilizzi l&rsquo;App a tuo rischio.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">10. Terze parti</h2>
            <p className="text-gray-700">
              L&rsquo;App può interagire con servizi di terzi (ad es. Google). L&rsquo;uso di tali servizi è
              soggetto ai relativi termini e informative privacy dei fornitori terzi.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">11. Limitazioni di responsabilità</h2>
            <p className="text-gray-700">
              L&rsquo;App è fornita a titolo dimostrativo, senza garanzie esplicite o implicite. Nei limiti
              consentiti dalla legge, escludiamo responsabilità per danni indiretti, incidentali o consequenziali
              derivanti dall&rsquo;uso o impossibilità d&rsquo;uso dell&rsquo;App.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">12. Modifiche</h2>
            <p className="text-gray-700">
              Possiamo aggiornare queste Condizioni. Le modifiche diventano efficaci quando pubblicate su questa
              pagina. L&rsquo;uso continuato dell&rsquo;App dopo gli aggiornamenti implica accettazione.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">13. Contatti</h2>
            <p className="text-gray-700">
              Per domande su queste Condizioni o per richieste relative ai dati, contatta:
              <br />
              <span className="font-medium">Email:</span> streetreports.app@gmail.com
            </p>
          </section>

          <footer className="pt-4 border-t text-sm text-gray-600">
            Usando l&rsquo;App dichiari di aver letto e accettato queste Condizioni.
          </footer>
        </article>
      </section>
    </main>
  );
}
