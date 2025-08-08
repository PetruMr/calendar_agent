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
      - **Salvataggio dei dati** nel database PostgreSQL tramite API RESTful in modo da mantenere uno storico delle richieste effettuate
      - **Validazione** della richiesta inserita
        - Se non valida, invia una risposta 400 Bad Request con un messaggio di errore
        - Se valida, salva la richiesta con **COLLECTING** come stato iniziale e procede
      - **Invio di una risposta 200 OK** con un messaggio di conferma che la richiesta è stata ricevuta correttamente, insieme a un **ID univoco per tracciare la richiesta**
2. **Raccolta disponibilità**: 
    - Se i partecipanti hanno calendari collegati (OAuth Google/Outlook):
      - Lettura delle disponiblità (usando il fuso orario di ciascuno)
    - Altrimenti
      - Invio **email personalizzata** con link a pagina di disponibilità (con **token univoco**, scadenza 8 ore)
      - La pagina permette di selezionare gli slot disponibili (UI con time-zone locale del partecipante)
      - Oppure si può segnalare indiponibilità ed aggiungere delle note
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
    - Nel caso tutti hanno selezionato uno slot ma non c'è compatibilità, l'agente:
      - Invia email di notifica con richiesta di nuove disponibilità
      - Aggiorna lo stato a **COLLECTING**
4. **Gestione modifiche last-minute**:
    - Un partecipante può cambiare la propria disponibilità in qualsiasi momento:
      - Nell'email ricevuta come conferma, cliccando sul link per modificare la disponibilità
      - L'agente ricalcola e ripropone nuovi slot compatibili
      - Inoltre lascia altre due possibili azioni
        - **Rifiuta** la call, in questo caso l'agente aggiorna lo stato a **CANCELED**
        - **Non disponibile** per la call, in questo caso l'agente aggiorna lo stato a **COLLECTING** e invia una nuova email di richiesta disponibilità 

## Interfaccia utente recuiter

Ogni recuiter ha accesso ad un interfaccia di login o registrazione.

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
    - Pulsante dal quale si può accedere alla pagina di gestione, dove si andrà a visualizzare lo stato della call e le azioni che si possono compiere, come per esempio "modifica disponibilità" oppure "annulla call".
    - Log con eventuali errori riscontrati durante il processo di scheduling
  - [... Dettagli da definire in base alle necessità che emergeranno durante lo sviluppo ...]
