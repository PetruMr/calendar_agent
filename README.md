# **Agente AI – Organizzazione automatica di videoconferenze**

## Obiettivo
Sviluppare un agente AI per automatizzare la pianificazione delle call tra recruiter, candidati e Mastro Expert, senza interventi manuali.

---

### 📅 Modalità e scadenza

*Data inizio sviluppo*: 07/08/2025

*Tempo stimato per completamento*: 5 giorni

*Consegna*: Demo funzionante.

---


### 🔹 **Trigger iniziale**

L’agente viene attivato quando un **recruiter** (tramite il proprio account) inserisce:

- Nomi + email dei partecipanti
- Tipo di call (screening / validazione / finale)
- Durata preferita (30/45/60 min)
- Deadline entro cui la call deve avvenire

✅ Questa azione deve essere lanciabile da un’interfaccia semplice (es. form).

---

### 🔹 **Step 1 – Raccolta disponibilità**

L’agente:

- legge i calendari (Google/Outlook) dei partecipanti se connessi
- altrimenti, invia email personalizzate con proposte di fasce orarie
- considera i fusi orari
- invia reminder se non riceve risposta entro 8h

---

### 🔹 **Step 2 – Conferma appuntamento**

L’agente:

- seleziona lo slot comune ottimale (entro 24h)
- invia email di conferma con:
    - giorno/orario fissato
    - link Google Meet (via API)
    - agenda sintetica (testo precompilato o AI-generated)
- crea link per salvare evento nel calendario dei partecipanti
- salva l’appuntamento nel sistema (log o dashboard)

---

### 🔹 **Step 3 – Gestione modifiche last-minute**

- Se un partecipante cambia disponibilità, l’agente ricalcola e ripropone nuovi slot compatibili

---

### ✅ **Output richiesto**

Dimostrare lo scheduling automatizzato di almeno **3 call reali**, ciascuna con:

- 3 partecipanti (es. recruiter + candidato + Mastro Expert)
- Nessun intervento manuale da parte dell’account che ha lanciato la richiesta
- Email inviata + link Meet generato + evento salvato

---

🧪 **Test & Verifica**

L’interfaccia deve permettere all’**account** di:

- Lanciare una richiesta di call
- Visualizzare lo stato dell’automazione:
    - data richiesta
    - invii email
    - conferme ricevute
    - slot selezionato
    - log con eventuali errori

---

### **Requisiti tecnici**

- Backend scalabile (no-code/low-code ammesso)
- Integrazione con:
    - Google Calendar API
- Email con:
    - Oggetto personalizzato (es. “Proposta colloquio con Mastro HR”)
    - Link per confermare disponibilità o rispondere
- Link Meet:
    - univoco e condivisibile
    - tracciabile nella dashboard
- Tracciabilità completa del processo

---

### **Criteri di valutazione**

- Completezza del flusso
- Qualità architettura e automazione
- Usabilità per utenti non tech
- Gestione delle eccezioni (assenza disponibilità, email fallite)
- Interfaccia semplice e tracciabile
- Documentazione

### Altre caratteristiche della richiesta

Skill richieste per la posizione di Full Stack Developer:
- Node.js & Python
- PostgreSQL & progettazione DB scalabili
- RESTful APIs
- Kubernetes (anche base)
- Esperienza con Supabase, OpenAI, Lovable, Unipile
- Buona autonomia su architettura, sicurezza, DevOps