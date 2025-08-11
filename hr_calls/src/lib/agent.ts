// /lib/agent.ts

import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

// Tipi di dati utili

type User = {
  id: number;
  nome: string;
  email: string;
  tipo: string; // "recuiter", "esterno"
};

type Call = {
  id: string;
  data_creazione: Date;
  data_call: Date | null;
  data_deadline: Date | null;
  stato_avanzamento: string; // "processing", "scheduled", "canceled", "ended"
  tipo: string;
  durata: number; // in minuti
  note: string | null;
  link_meet: string | null;
  titolo: string;
};

type UsersCalls = {
  call_id: string;
  user_id: number;
  calendario: boolean; // true se ha Google Calendar
  stato: string; // e.g., "in attesa", "confermato"
  token: string | null; // token per conferma disponibilità
  created_at: Date;
  lastmail_sent_at: Date | null;
  mails_sent: number; // conteggio delle email inviate
  user: User; // dettagli dell'utente
};

// Helper stati
const FINAL_STATES = new Set(["accepted", "unavailable", "canceled", "ended"]);
const ACCEPTED_STATES = new Set(["accepted"]);
const WAITING_STATES = new Set(["waiting", "", null as any]);

const HOURS_8 = 8 * 60 * 60 * 1000;
const HOURS_24 = 24 * 60 * 60 * 1000;

function now(): Date {
  return new Date();
}

function diffMs(
  a: Date | null | undefined,
  b: Date | null | undefined
): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.getTime() - b.getTime());
}

function needsReminder(part: UsersCalls): boolean {
  if (FINAL_STATES.has((part.stato || "").toLowerCase())) return false;
  if (!WAITING_STATES.has((part.stato || "").toLowerCase() as any)) return true; // stato indefinito -> sollecita
  if (part.mails_sent >= 3) return false;
  if (!part.lastmail_sent_at) return true;
  return now().getTime() - new Date(part.lastmail_sent_at).getTime() >= HOURS_8;
}

function shouldCancelForNoResponses(
  call: Call,
  externals: UsersCalls[]
): boolean {
  // Se almeno un partecipante esterno ha stato "canceled" -> cancella subito
  const hasCanceled = externals.some(
    (p) =>
      (p.stato || "").toLowerCase() === "canceled"
  );
  if (hasCanceled) {
    return true;
  }

  // cancella se:
  // - esistono ancora partecipanti esterni NON in stato finale/accepted
  // - sono già state mandate 3 email a tutti quelli ancora in attesa
  // - è passata la deadline
  const stillWaiting = externals.filter(
    (p) =>
      !FINAL_STATES.has((p.stato || "").toLowerCase()) &&
      !ACCEPTED_STATES.has((p.stato || "").toLowerCase())
  );
  if (stillWaiting.length === 0) return false;

  const all3 = stillWaiting.every((p) => (p.mails_sent ?? 0) >= 3);
  if (!all3) return false;

    if (!call.data_deadline) return false;
    return now().getTime() - new Date(call.data_deadline).getTime() >= 0; // deadline passata
}

// Funzione che ci conferma se tutti hanno accettato!
function everyoneAccepted(externals: UsersCalls[]): boolean {
  if (externals.length === 0) return false;
  return externals.every((p) =>
    ACCEPTED_STATES.has((p.stato || "").toLowerCase())
  );
}

function buildAvailabilityUrl(token: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/availability/${encodeURIComponent(
    token
  )}`;
}

// Questo file contiene la logica per le funzionalità automatizzate per l'organizzazione delle chiamate:
// - Mandare email per confermare gli orari di disponibilità per la chiamata ogni 8 ore
// - Dopo 24 ore, se non è stata ancora organizzata, cancellare la chiamata
// - Dopo che tutte le risposte sono state ricevute, utilizzare Google Calendar API + Le disponibilità ricevute per la generazione dello slot di chiamata
// - Generazione del link di Google Meet, del link per aggiungere l'evento al calendario e invio dell'email di conferma

// La funzione agent_CallOrganizer_EntryPoint è la funzione che verrà eseguita per decidere le azioni da eseguire per una chiamata
// La sua logica è la seguente:
// 1. Recupera i dettagli della chiamata
//    - Se la chiamata non esiste, termina l'esecuzione
//    - Se la chiamata è in stato "ended" oppure "canceled", termina l'esecuzione
//    - Se la chiamata è in stato "processing", continua l'esecuzione
// 2. Recupera i partecipanti alla chiamata
// 3. Per ogni partecipante non connesso a Google Calendar:
//    - Controllo se il suo stato è "waiting", se è nello stato "accepted" oppure "unavailable" non inviare email, se invece è "canceled" non inviare email e segnala la chiamata come "canceled"
//    - Controllo quando è stata inviata l'ultima email
//      - Se è passato più di 8 ore dall'ultima email e non sono ancora state inviate 3 email, invia una email
//      - Aggiorna il conteggio delle email inviate
//    - Se sono state inviate 3 email ma non sono ancora state ricevute risposte da più di 24 ore allora
//      - Cancella la chiamata impostando lo stato "canceled"
//      - Invia un'email di cancellazione a tutti i partecipanti
// 4. Se tutti i partecipanti esterni sono nello stato "accepted", allora:
//    - Inizia la logica per l'organizzazione della chiamata, chiamando la funzione agent_CallCreation_EntryPoint
export async function agent_CallOrganizer_EntryPoint(callId: string) {
  // Inizio della logica per l'organizzazione della chiamata

  // Per prima cosa, si recuperano i dettagli della chiamata.
  const { data: callData, error: callError } = await supabase
    .from("calls")
    .select(
      `
            id,
            data_creazione,
            data_call,
            data_deadline,
            stato_avanzamento,
            tipo,
            durata,
            note,
            link_meet,
            titolo
        `
    )
    .eq("id", callId)
    .single();

  if (callError || !callData) {
    console.error("Errore nel recupero della chiamata:", callError);
    return;
  }

  if (
    callData.stato_avanzamento === "ended" ||
    callData.stato_avanzamento === "canceled" ||
    // Se la data della chiamata è già passata, non serve procedere
    (callData.data_call && new Date(callData.data_call) < now())
  ) {
    console.log(
      "La chiamata è già terminata o cancellata, non è necessario procedere."
    );
    return;
  }

  // 2) Recupera i partecipanti
  const { data: participants, error: participantsError } = await supabase
    .from("users_calls")
    .select(
      `
            call_id,
            user_id,
            calendario,
            stato,
            token,
            created_at,
            lastmail_sent_at,
            mails_sent,
            users ( id, nome, email, tipo )
        `
    )
    .eq("call_id", callId);

  if (participantsError || !participants) {
    console.error("Errore nel recupero dei partecipanti:", participantsError);
    return;
  }

  // Normalizza "user"
  const parts: UsersCalls[] = (participants as any[]).map((p) => ({
    ...p,
    user: p.users,
  }));

  console.log(
    `- Trovati ${parts.length} partecipanti per la chiamata ${callId}`
  );

  // 3) Gestione email per partecipanti non connessi a Google Calendar
  const externals = parts.filter((p) => !p.calendario); // "senza Google Calendar" indipendentemente dal tipo utente
  for (const p of externals) {
    const statoLower = (p.stato || "").toLowerCase();
    if (FINAL_STATES.has(statoLower) || ACCEPTED_STATES.has(statoLower)) {
      continue; // non inviare email
    }

    if (needsReminder(p)) {
      // Invia email
      await agent_sendAvailabilityEmail(callData as Call, p);

      // Aggiorna contatori
      const newCount = (p.mails_sent || 0) + 1;
      const nowIso = new Date().toISOString();
      const { error: upMailErr } = await supabase
        .from("users_calls")
        .update({ mails_sent: newCount, lastmail_sent_at: nowIso })
        .eq("call_id", callId)
        .eq("user_id", p.user_id);

      if (upMailErr) {
        console.error(
          `Errore aggiornando mails_sent per user_id=${p.user_id}`,
          upMailErr
        );
      } else {
        p.mails_sent = newCount;
        p.lastmail_sent_at = new Date(nowIso) as any;
      }
    }
  }

  // 3.b) Se sono state inviate 3 email la deadline è passata -> cancella
  if (shouldCancelForNoResponses(callData as Call, externals)) {
    console.log(
      "Cancellazione della chiamata per mancate risposte >24h dopo 3 solleciti."
    );
    const { error: cancelErr } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "canceled" })
      .eq("id", callId);

    if (cancelErr) {
      console.error(
        "Errore nell'aggiornare lo stato della chiamata a 'canceled':",
        cancelErr
      );
      return;
    }

    // marca anche le righe users_calls come "canceled" di tutti i partecipanti
    await supabase
      .from("users_calls")
      .update({ stato: "canceled" })
      .eq("call_id", callId);

    // Invia email di cancellazione a tutti i partecipanti
    for (const p of parts) {
      const user = p.user!;
      try {
        const textEmailContent = `
        Ciao ${user.nome || "partecipante"},

        la chiamata "${callData.titolo}" è stata cancellata.

        Ti terremo aggiornato per eventuali nuove pianificazioni.
        `.trim();

        const htmlEmailContent = `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 2px 6px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="padding: 20px; border-bottom: 1px solid #f0f0f0;">
            <h2 style="margin: 0; font-size: 20px; color: #111827;">Chiamata cancellata</h2>
            </div>
            <div style="padding: 20px; font-size: 14px; color: #374151;">
            <p>Ciao <strong>${user.nome || "partecipante"}</strong>,</p>
            <p>ti informiamo che la chiamata è stata cancellata:</p>
            <h3 style="margin: 0 0 10px; font-size: 18px; color: #111827;">${callData.titolo}</h3>
            <p style="margin-top: 16px;">Ti terremo aggiornato per eventuali nuove pianificazioni.</p>
            </div>
        </div>
        </div>
        `.trim();

        await sendEmail(
        user.email,
        `Chiamata "${callData.titolo}" cancellata`,
        htmlEmailContent,
        textEmailContent
        );
      } catch (e) {
        console.error(`Errore invio email cancellazione a ${user.email}:`, e);
      }
    }
    return; // termina qui
  }

  // 4) Se tutti gli esterni sono "accepted", procedi con la creazione slot
  if (externals.length > 0 && everyoneAccepted(externals)) {
    console.log(
      "Tutti i partecipanti esterni hanno accettato. Avvio creazione evento."
    );
    await agent_CallCreation_EntryPoint(callId);
  } else {
    console.log("In attesa di conferme dagli esterni o non ci sono esterni.");
  }
}

// Funzione per inviare email a un partecipante senza Google Calendar per ottenere la disponibilità
async function agent_sendAvailabilityEmail(
  callData: Call,
  participant: UsersCalls
) {  
    const availabilityUrl = participant.token
    ? buildAvailabilityUrl(participant.token)
    : null;

  const emailContent = `
    Ciao ${participant.user?.nome || "partecipante"},

    ti invitiamo a confermare la tua disponibilità per la chiamata **"${
        callData.titolo
    }"**.

    Dettagli:
    - Creata il: ${new Date(callData.data_creazione).toLocaleString()}
    - Data chiamata: ${
        callData.data_call
        ? new Date(callData.data_call).toLocaleString()
        : "Non ancora programmata"
    }
    - Scadenza risposta: ${
        callData.data_deadline
        ? new Date(callData.data_deadline).toLocaleString()
        : "N/A"
    }
    - Durata prevista: ${callData.durata} minuti
    - Note: ${callData.note || "Nessuna"}

    ${
    availabilityUrl
        ? `Per inserire le tue disponibilità, visita:\n${availabilityUrl}\n`
        : `Rispondi a questa email indicando le tue disponibilità nelle prossime 2–3 giornate utili.\n`
    }

    Grazie!
    `.trim();


  const htmlEmailContent = `
  <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 2px 6px rgba(0,0,0,0.05); overflow: hidden;">
      <div style="padding: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="margin: 0; font-size: 20px; color: #111827;">Conferma la tua disponibilità</h2>
      </div>
      <div style="padding: 20px; font-size: 14px; color: #374151;">
        <p>Ciao <strong>${participant.user?.nome || "partecipante"}</strong>,</p>
        <p>ti invitiamo a confermare la tua disponibilità per la chiamata:</p>
        <h3 style="margin: 0 0 10px; font-size: 18px; color: #111827;">${callData.titolo}</h3>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tbody>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; width: 40%;">Creata il:</td>
              <td style="padding: 6px 0; color: #111827;">${new Date(callData.data_creazione).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Data chiamata:</td>
              <td style="padding: 6px 0; color: #111827;">${callData.data_call ? new Date(callData.data_call).toLocaleString() : "Non ancora programmata"}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Scadenza risposta:</td>
              <td style="padding: 6px 0; color: #111827;">${callData.data_deadline ? new Date(callData.data_deadline).toLocaleString() : "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Durata prevista:</td>
              <td style="padding: 6px 0; color: #111827;">${callData.durata} minuti</td>
            </tr>
            ${callData.note ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Note:</td>
              <td style="padding: 6px 0; color: #111827;">${callData.note}</td>
            </tr>` : ""}
          </tbody>
        </table>

        ${availabilityUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${availabilityUrl}" style="background-color: #111827; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Conferma disponibilità
          </a>
        </div>
        ` : `
        <p>Rispondi a questa email indicando le tue disponibilità nelle prossime 2-3 giornate utili.</p>
        `}
        
        <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
        ${availabilityUrl || "(nessun link disponibile)"}</p>
      </div>
    </div>
  </div>
  `.trim();

  try {
    await sendEmail(
      participant.user!.email,
      "Conferma disponibilità chiamata",
      htmlEmailContent,
      emailContent
    );
    console.log(`Email inviata a ${participant.user!.email}`);
  } catch (error) {
    console.error(
      `Errore nell'invio dell'email a ${participant.user!.email}:`,
      error
    );
  }
}

// Funzione per avviare l'organizzazione della chiamata
export async function agent_CallCreation_EntryPoint(callId: string) {
  console.log("- Avvio organizzazione chiamata:", callId);
  return;
}
