# Architettura e flusso delle operazioni

Questo documento si occupa di delineare l'architettura che verrà utilizzata per la creazione dell'agente AI dedicato all'automazione della pianificazione delle call e descrive il flusso end-to-end: dall'inserimento richiesta, alla raccolta disponibilità, fino alla conferma e gestione modifiche.

## Richieste architetturali del progetto

In particolare, si cercherà di rispondere alle seguenti richieste:
- Utilizzo di **Typescript** come linguaggi di programmazione principali.
- **Node.js** sarà utilizzato per la creazione del server e la gestione delle **API RESTful**, attraverso **Next.js**. Inoltre si utilizzerà **React** e **Tailwind CSS** per la creazione dell'interfaccia utente.
- Utilizzo di **PostgreSQL** come database per la gestione dei dati. In particolare si farà uso di **Supabase**, in quanto rientra tra le tecnologie utilizzate da Mastro HR.

Queste sono tecnologie incluse come "skill tecniche minime" richieste per la posizione di **Full Stack Developer** all'interno di Mastro HR, pertanto cercheremo di utilizzarle al fine di dimostrare il possedimento delle stesse.

Non verrà considerato l'utilizzo di **Kubernetes** in quanto aggiungerebbe complessità eccessiva a questo progetto, ma in un contesto reale al fine della scalabilità dell'applicazione sarebbe sicuramente una scelta da considerare.

Inoltre si considerano anche i requisiti tecnici specificati, ovvero:
- Backend scalabile (no-code/low-code ammesso)
- Integrazione con Google Calendar API
- Email con oggetto personalizzato e link per confermare disponibilità o rispondere
- Link Meet univoco e condivisibile, tracciabile nella dashboard
- Tracciabilità completa del processo
  - Ogni step verrà loggato sul DB con timestamp e dettagli dell'azione eseguita

## Richieste funzionali del progetto

1. **Trigger iniziale**: 
     - Recuiter **compila form** contenente:
        - Nome + email dei partecipanti
        - Tipo di call (screening/validazione/finale)
        - Durata preferita (30/45/60 minuti)
        - Deadline entro cui la call deve avvenire
      - **Validazione form** delle informazioni inserite
      - **Invio form** attraverso richiesta HTTP POST al server
      - **Salvataggio dei dati** nel database PostgreSQL in modo da mantenere uno storico delle richieste effettuate
      - **Validazione** della richiesta inserita
        - Se non valida, invia una risposta 400 Bad Request con un messaggio di errore
        - Se valida, salva la richiesta con **COLLECTING** come stato iniziale e procede
      - **Invio di una risposta 200 OK** con un messaggio di conferma che la richiesta è stata ricevuta correttamente, insieme a un **ID univoco per tracciare la richiesta**
2. **Raccolta disponibilità**: 
    - Se i partecipanti hanno calendari collegati (OAuth Google/Outlook):
      - Lettura delle disponiblità (usando il fuso orario di ciascuno)
    - Altrimenti
      - Invio **email personalizzata** con link a pagina di disponibilità (con **token univoco**)
      - La pagina permette di selezionare gli slot disponibili (UI con time-zone locale del partecipante)
      - Oppure si può segnalare indiponibilità e pertanto annullare la call
      - Invia reminder se non riceve risposta entro 8 ore
    - L'angente unifica le disponibilità in **UTC**, applica filtri (orari, durata, ecc.) e aggiorna lo stato **REASONING**
3. **Conferma appuntamento**:
    - Una volta che tutti i partecipanti hanno selezionato i propri slot, confermando la propria disponibilità, l'agente:
      - Calcola gli slot compatibili
      - Seleziona lo slot migliore (es. il primo disponibile)
      - Aggiorna lo stato a **CONFIRMED**
      - Invia email di conferma a tutti i partecipanti con:
        - Giorno/orario fissato
        - Link Meet univoco generato attraverso Google Meet API
        - Agenda sintetica (testo precompilato o generato da AI)
        - Link dal quale poter salvare l'evento nel calendario dei partecipanti
        - Salva l'appuntamento nel sistema (log o dashboard)
        - Link dal quale poter modificare la propria disponibilità
          - Per utenti con OAuth, il link fa sì che si apra il calendario dell'utente e si verifichino le disponibilità
          - Per utenti senza OAuth, il link porta alla pagina di modifica disponibilità utilizzato precedentemente con il token univoco
    - Nel caso tutti hanno selezionato uno slot ma non c'è compatibilità, l'agente:
      - Invia email di notifica con richiesta di nuove disponibilità
        - In questo caso l'agente aggiorna lo stato a **COLLECTING** e invia una nuova email di richiesta disponibilità
      - Aggiorna lo stato a **COLLECTING**
4. **Gestione modifiche last-minute**:
    - Un partecipante può cambiare la propria disponibilità in qualsiasi momento:
      - Nell'email ricevuta come conferma, cliccando sul link per modificare la disponibilità
      - L'agente ricalcola e ripropone nuovi slot compatibili
      - Inoltre lascia altre due possibili azioni
        - **Rifiuta** la call, in questo caso l'agente aggiorna lo stato a **CANCELED**
        - **Non disponibile** per la call, in questo caso l'agente aggiorna lo stato a **COLLECTING** e invia una nuova email di richiesta disponibilità 

## Interfaccia utente recuiter

Ogni recuiter ha accesso ad un interfaccia di login (e registrazione nel nostro caso di testing)

Dopo aver effettuato il login, si accede alla zona dove si possono organizzare le call oppure gestire quelle già organizzate.

Vi saranno quindi due parti fondamentali:
- **Form di richiesta call**: 
  - Permette di inserire i dati richiesti per organizzare una call
  - Farà partire il processo di scheduling
- **Dashboard di gestione call**:
  - Mostra lo stato delle call organizzate e dove si è inclusi come indirizzo email
  - Permette di visualizzare i seguenti dettagli:
    - Data della richiesta
    - Partecipanti (nomi e/o email e a chi è arrivata la richiesta / chi ha confermato)
    - Tipo di call (screening/validazione/finale)
    - Dettagli della call (già confermata o ancora in attesa)
    - Log con eventuali errori riscontrati durante il processo di scheduling

## Interfaccia utente partecipanti

Per gli utenti partecipanti, essi entreranno utilizzando un token univoco ad una pagina dedicata.

Da questa pagina potranno aggiungere le proprie disponibilità riguardanti la call. Potranno aggiungere un insieme di slot con data, ora e durata, oppure indicare di non essere disponibili e quindi annullare la call.


## NOTE PROGETTUALI FINALI - Su Google Meet

Per questo progetto, la parte riguardanti al link di Google Meet è un po' un problema:
- Per generare un link di meet da mandare a tutti, devo avere un account Google con OAuth 2.0 configurato
  - Se collego questo profilo, e il profilo NON è un profilo Google Workspace, non posso modificare i permessi di accesso al link Meet
- Invece potrei non generarlo in generale e mandare solo l'evento che si può creare su calendario, dal quale si possono invitare le altre persone
  - Questa opzione va in contrasto con le richieste funzionali del progetto, pertanto non è stata presa in considerazione la sua implementazion

Essenzialmente, se si dovesse rilasciare effettivamente, bisognerebbe o andare a generare un account Google Workspace per il bot, oppure non generare il link Meet e mandare solo l'evento di calendario.

A scopo dimostrativo abbiamo scelto di mandarli entrambi.

Per il profilo BOT si andrà a creare un account di Google, nel nostro caso "streetreport.app@gmail.com", un account che avevo precedentemente usato per un altro progetto.
Utilizzando questo profilo si dovrà andare sulla pagina "/api/agent/meet/auth/\[token\]" dove il token è una variabile di ambiente del server nota unicamente agli amministratori. Dando i permessi al profilo di google, si predispone un token OAuth che potrà essere utilizzato per generare i link Meet e gli eventi di calendario.

D'altro canto questo vuol dire che dovrà venire manualmente configurato e ogni tanto aggiornato (in produzione ogni 6 mesi circa), quindi questo processo sarebbe da automatizzare.

## NOTE PROGETTUALI FINALI - Su Agent

L'agent è una funzione che viene eseguita periodicamente, la quale controlla tutte le chiamate che sono nel DB e cerca quelle che deve gestire.

Per eseguire questo tipo di funzione, in un normale server, utilizzeremmo un cron job. Tuttavia Vercel permette l'uso di soli 2 cron job che avvengono una volta al giorno, pertanto per avere una migliore interattività con il sito, esso utilizzerà altri metodi.

Il metodo trovato è stato quello di aprire una porta, la quale sarà "/api/agent/" alla quale si dovrà fare una richiesta di tipo POST con un Bearer Token che sarà una variabile di ambiente del server.
Solo amministratori potranno fare questa chiamata.

Si delega la responsabilità periodica, quindi, di eseguire tale chiamata, a un servizio esterno, chiamato "UPstash" che attraverso il QStash permette di eseguire fino a 500 chiamate HTTPS al giorno.
Questo fa sì che ci possano essere update ogni 5 minuti, durante tutto il giorno.