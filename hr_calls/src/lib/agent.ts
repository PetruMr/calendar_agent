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
    (p) => (p.stato || "").toLowerCase() === "canceled"
  );
  if (hasCanceled) {
    return true;
  }

  // cancella se:
  // - è passata la deadline
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

  // Se invece la chiamata è in stato "processing" ed è passata la dead_line, allora la imposto a "canceled"
  // Se invece la chiamata è in stato "scheduled" e la data della chiamata è passata, allora la imposto a "ended"
  if (
    callData.stato_avanzamento === "processing" &&
    callData.data_deadline &&
    now().getTime() >= new Date(callData.data_deadline).getTime()
  ) {
    const { error } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "canceled" })
      .eq("id", callId);
    if (error) {
      console.error(
        "Errore nel cancellare la chiamata (processing + deadline superata):",
        error
      );
      return;
    }
    console.log(
      `Chiamata ${callId} cancellata per superamento della deadline.`
    );
    return;
  } else if (
    callData.stato_avanzamento === "scheduled" &&
    callData.data_call &&
    now().getTime() >= new Date(callData.data_call).getTime()
  ) {
    const { error } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "ended" })
      .eq("id", callId);
    if (error) {
      console.error(
        "Errore nel terminare la chiamata (scheduled + data_passata):",
        error
      );
      return;
    }
    console.log(
      `Chiamata ${callId} terminata per superamento della data prevista.`
    );
    return;
  }

  // Recupera i partecipanti
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

  // Gestione email per partecipanti non connessi a Google Calendar
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

  // Se sono la deadline è passata o almeno un utente ha sengato "cancel" -> cancella
  if (shouldCancelForNoResponses(callData as Call, externals)) {
    console.log(
      "Cancellazione della chiamata in quanto non è stata ancora organizzata ed è passata la deadline."
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
            <h3 style="margin: 0 0 10px; font-size: 18px; color: #111827;">${
              callData.titolo
            }</h3>
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
    return; // Esci dopo la cancellazione
  }

  // Se tutto è tutto è andato bene e tutti gli esterni sono "accepted", procedi con la creazione slot
  if (externals.length > 0 && everyoneAccepted(externals)) {
    console.log(
      "Tutti i partecipanti esterni hanno accettato. Avvio creazione evento."
    );
    await agent_CallCreation_EntryPoint(callId);
  } else if (externals.length == 0) {
    console.log(
      "Non ci sono utenti esterni. Tutti gli utenti hanno google calendar connesso."
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
        <p>Ciao <strong>${
          participant.user?.nome || "partecipante"
        }</strong>,</p>
        <p>ti invitiamo a confermare la tua disponibilità per la chiamata:</p>
        <h3 style="margin: 0 0 10px; font-size: 18px; color: #111827;">${
          callData.titolo
        }</h3>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tbody>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; width: 40%;">Creata il:</td>
              <td style="padding: 6px 0; color: #111827;">${new Date(
                callData.data_creazione
              ).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Data chiamata:</td>
              <td style="padding: 6px 0; color: #111827;">${
                callData.data_call
                  ? new Date(callData.data_call).toLocaleString()
                  : "Non ancora programmata"
              }</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Scadenza risposta:</td>
              <td style="padding: 6px 0; color: #111827;">${
                callData.data_deadline
                  ? new Date(callData.data_deadline).toLocaleString()
                  : "N/A"
              }</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Durata prevista:</td>
              <td style="padding: 6px 0; color: #111827;">${
                callData.durata
              } minuti</td>
            </tr>
            ${
              callData.note
                ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Note:</td>
              <td style="padding: 6px 0; color: #111827;">${callData.note}</td>
            </tr>`
                : ""
            }
          </tbody>
        </table>

        ${
          availabilityUrl
            ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${availabilityUrl}" style="background-color: #111827; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Conferma disponibilità
          </a>
        </div>
        `
            : `
        <p>Rispondi a questa email indicando le tue disponibilità nelle prossime 2-3 giornate utili.</p>
        `
        }
        
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

// Parte dedicata alla funzione per generare il meeting calcolando gli slot compatibili
// e creando l'evento su Google Calendar con il link Meet

// Utils

import { getOAuthClientManager, getOAuthClient } from "@/lib/googleOAuthClient";
import {
  getFreshGoogleAccessTokenManager,
  getFreshGoogleAccessToken,
} from "@/lib/googleTokens"; // nuovo metodo "manager"
import { OAuthTokenError } from "@/lib/errors";
import { google } from "googleapis";
import { randomBytes } from "crypto";

// Tipo di input per la funzione "generate meeting and event"
type BodyMeeting = {
  summary?: string;
  start?: string; // ISO datetime
  end?: string; // ISO datetime
  attendees?: string[]; // array di email
};

type MeetingResponse = {
  meetLink: string | null;
  eventId: string | null;
  htmlLink: string | null;
  addToCalendarUrl: string; // URL per aggiungere l'evento al calendario
};

export async function generate_meetingAndEvent(body: BodyMeeting) {
  const now = new Date();
  const startDate = body.start ? new Date(body.start) : now;
  const endDate = body.end
    ? new Date(body.end)
    : new Date(startDate.getTime() + 30 * 60 * 1000);

  const attendees =
    body.attendees
      ?.map((e) => String(e).trim())
      .filter(Boolean)
      .map((email) => ({ email })) ?? [];

  // ID univoco per la richiesta di creazione Meet
  const requestId =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  // Struttura della richiesta
  const insertParams = {
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: body.summary ?? "Quick Meet",
      // Nota: uso ISO; se vuoi un fuso specifico imposta timeZone qui.
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
      attendees,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  } as const;

  try {
    // Ottengo SEMPRE un access token fresco del "manager" (user_id = null)
    const accessToken = await getFreshGoogleAccessTokenManager();

    // Preparo client OAuth2 SENZA refresh automatico (gestito a monte)
    const oAuth2 = getOAuthClientManager();
    oAuth2.setCredentials({ access_token: accessToken });

    // Client Calendar
    const calendar = google.calendar({ version: "v3", auth: oAuth2 });

    // Primo tentativo: creazione evento con Meet
    try {
      // Provo a creare l'evento con Meet
      const res = await calendar.events.insert(insertParams);
      const event = res.data;
      const meetLink =
        event.hangoutLink ||
        event.conferenceData?.entryPoints?.find(
          (p) => p.entryPointType === "video"
        )?.uri ||
        null;

      // Genero l'URL per aggiungere l'evento al calendario
      const pad = (n: number) => String(n).padStart(2, "0");
      const toGCalUTC = (d: Date) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
          d.getUTCDate()
        )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
          d.getUTCSeconds()
        )}Z`;

      const addToCalendarUrl = new URL(
        "https://calendar.google.com/calendar/render"
      );
      addToCalendarUrl.searchParams.set("action", "TEMPLATE");
      addToCalendarUrl.searchParams.set("text", body.summary ?? "Quick Meet");
      addToCalendarUrl.searchParams.set(
        "dates",
        `${toGCalUTC(startDate)}/${toGCalUTC(endDate)}`
      );
      if (meetLink) {
        addToCalendarUrl.searchParams.set("details", `Join: ${meetLink}`);
      }
      for (const a of attendees) {
        if (a.email) addToCalendarUrl.searchParams.append("add", a.email); // prefill guests
      }

      const response: MeetingResponse = {
        meetLink,
        eventId: event.id ?? null,
        htmlLink: event.htmlLink ?? null,
        addToCalendarUrl: addToCalendarUrl.toString(), // sharable add link
      };

      // Rispondo con i dettagli dell'evento creato
      return response;
    } catch (err: any) {
      // Se Google segnala problema di autenticazione, faccio UN SOLO retry
      const status = err?.response?.status ?? err?.code;
      const reason =
        err?.errors?.[0]?.reason ||
        err?.response?.data?.error ||
        err?.message ||
        "";

      const looksLikeAuthError =
        status === 401 ||
        /invalid[_ ]credentials|unauthorized|login required/i.test(reason);

      if (!looksLikeAuthError) throw err;

      // Retry con nuovo token fresco dal "manager"
      const freshAccess = await getFreshGoogleAccessTokenManager();
      oAuth2.setCredentials({ access_token: freshAccess });

      const res2 = await calendar.events.insert(insertParams);
      const event2 = res2.data;
      const meetLink2 =
        event2.hangoutLink ||
        event2.conferenceData?.entryPoints?.find(
          (p) => p.entryPointType === "video"
        )?.uri ||
        null;

      const pad = (n: number) => String(n).padStart(2, "0");
      const toGCalUTC = (d: Date) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
          d.getUTCDate()
        )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
          d.getUTCSeconds()
        )}Z`;

      const addToCalendarUrl = new URL(
        "https://calendar.google.com/calendar/render"
      );
      addToCalendarUrl.searchParams.set("action", "TEMPLATE");
      addToCalendarUrl.searchParams.set("text", body.summary ?? "Quick Meet");
      addToCalendarUrl.searchParams.set(
        "dates",
        `${toGCalUTC(startDate)}/${toGCalUTC(endDate)}`
      );
      if (meetLink2) {
        addToCalendarUrl.searchParams.set("details", `Join: ${meetLink2}`);
      }
      for (const a of attendees) {
        if (a.email) addToCalendarUrl.searchParams.append("add", a.email); // prefill guests
      }

      const response: MeetingResponse = {
        meetLink: meetLink2,
        eventId: event2.id ?? null,
        htmlLink: event2.htmlLink ?? null,
        addToCalendarUrl: addToCalendarUrl.toString(), // sharable add link
      };

      // Rispondo con i dettagli dell'evento creato
      return response;
    }
  } catch (err: any) {
    // 7) Gestione errori: distinguo quelli dei token da quelli Google
    if (err instanceof OAuthTokenError) {
      const statusMap: Record<typeof err.code, number> = {
        NO_TOKENS: 401, // Non hai collegato Google per il manager
        MISSING_REFRESH_TOKEN: 401, // Non posso rinnovare -> chiedi re-login
        REFRESH_REVOKED: 401, // Token revocato -> chiedi re-login
        NETWORK: 503, // Temporaneo (rete/rate limit)
        UNKNOWN: 500, // Generico
      };
      return null;
    }

    const status = err?.response?.status ?? 500;
    const message =
      err?.response?.data?.error_description ||
      err?.message ||
      "Errore sconosciuto durante la creazione dell'evento";
    return null;
  }
}

type ExtendedUsersCalls = UsersCalls & {
  // Dettagli dell'oauth token
  oauth_token: {
    id: number;
    access_token: string;
    refresh_token: string;
    expiry_date: Date;
  } | null; // null se non ha Google Calendar
};

type AllCallData = {
  call: Call;
  participants: ExtendedUsersCalls[];
};

// Funzione per recuperare i dettagli della chiamata e dei partecipanti
async function getAllCallData(callId: string): Promise<AllCallData> {
  // 1) Dettagli della chiamata
  const { data: callData, error: callError } = await supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .single();

  if (callError || !callData) {
    throw new Error(
      `Errore nel recupero della chiamata: ${callError?.message}`
    );
  }

  // 2) Partecipanti + utente + (token OAuth ANNDATI sotto users)
  const { data: participantsData, error: participantsError } = await supabase
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
      user:users (
        id,
        nome,
        email,
        tipo,
        oauth_tokens:user_oauth_tokens (
          id,
          access_token,
          refresh_token,
          expiry_date
        )
      )
    `
    )
    .eq("call_id", callId);

  if (participantsError || !participantsData) {
    throw new Error(
      `Errore nel recupero dei partecipanti alla chiamata: ${participantsError?.message}`
    );
  }

  // 3) Normalizzazione: porta il primo token (se esiste) a livello del partecipante
  const participants: ExtendedUsersCalls[] = participantsData.map((p: any) => {
    const tok = p.user?.oauth_tokens?.[0]; // in caso di più token, prendi il primo o filtra per provider
    return {
      ...p,
      // rinomina/espone come ti serve:
      user: p.user
        ? {
            id: p.user.id,
            nome: p.user.nome,
            email: p.user.email,
            tipo: p.user.tipo,
          }
        : null,
      oauth_token: tok
        ? {
            access_token: tok.access_token,
            refresh_token: tok.refresh_token,
            expiry_date: tok.expiry_date ? new Date(tok.expiry_date) : null,
          }
        : null,
    };
  });

  return {
    call: callData as Call,
    participants,
  };
}

// Funzione per avviare l'organizzazione della chiamata
//export async function agent_CallCreation_EntryPoint(callId: string) {
//  // Recupera i dettagli della chiamata e di tutti i partecipanti
//
//  // Dopo aver recuperato i token, controllo se sono validi utilizzando getFreshGoogleAccessToken di googleTokens.ts
//  // Utilizzo i messaggi di errore per capire cosa devo fare
//
//  // Adesso che ho tutti i token, ottengo tutti gli eventi che hanno gli utenti su google calendar attraverso
//  // la chiamata "calendar.events.freebusy"
//
//  // Poi per ogni utente che non ha calendario, ne ottengo le disponibilità tramite la tabella "disponibilita" che include
//  // call_id, user_id, inizio e durata_minuti per ogni disponibilità data dagli utenti
//
//  // Adesso che ho tutti gli eventi di google + tutti le disponibilità dei partecipanti, creo uno slot di chiamata
//  // cercando un momento dove tutti sono disponibili allo stesso tempo
//
//  // Creo l'evento su Google Calendar utilizando il token di google del mio server (OAuth2Client)
//  // e così ottengo il link di Google Meet e l'evento che tutti possono aggiungere al loro calendario
//  // Invia l'email di conferma a tutti i partecipanti con i dettagli della chiamata
//
//  return;
//}

export async function agent_CallCreation_EntryPoint(callId: string) {
  // 1) Recupero dati completi di call e partecipanti (con token normalizzati)
  let all: AllCallData;
  try {
    all = await getAllCallData(callId);
  } catch (err) {
    console.error("agent_CallCreation_EntryPoint/getAllCallData error:", err);
    return;
  }

  const { call, participants } = all;

  // Se già schedulata o scaduta, esci
  if (
    call.stato_avanzamento === "canceled" ||
    call.stato_avanzamento === "ended"
  ) {
    return;
  }

  // Se call scheduled già passata, allora imposta lo stato a "ended"
  if (
    call.stato_avanzamento === "scheduled" &&
    call.data_call &&
    new Date(call.data_call) < new Date()
  ) {
    const { error: updateError } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "ended" })
      .eq("id", callId);
    if (updateError) {
      console.error("Errore aggiornamento stato a 'ended':", updateError);
      return;
    }
    console.log(`Chiamata ${callId} terminata per data passata.`);
    return;
  }

  // Se call in stato "processing" e deadline passata, allora imposta lo stato a "canceled"
  if (
    call.stato_avanzamento === "processing" &&
    call.data_deadline &&
    new Date(call.data_deadline) < new Date()
  ) {
    const { error: updateError } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "canceled" })
      .eq("id", callId);
    if (updateError) {
      console.error("Errore aggiornamento stato a 'canceled':", updateError);
      return;
    }
    console.log(`Chiamata ${callId} cancellata per deadline passata.`);
    return;
  }

  // Finestra di ricerca: da adesso fino a deadline (se presente) oppure +14 giorni
  const windowStart = new Date(
    Math.max(Date.now(), new Date(call.data_creazione).getTime())
  );
  const windowEnd = call.data_deadline
    ? new Date(call.data_deadline)
    : new Date(windowStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (windowEnd <= windowStart) {
    console.warn("Finestra di scheduling non valida (deadline <= now).");
    return;
  }

  // 2) Per ogni utente con calendario: verifica/ottieni access token fresco
  //    Se un token è mancante o revocato => avvisa l'utente e interrompi (verranno riprovati i run successivi)
  const calendarUsers = participants.filter((p) => !!p.calendario);

  for (const p of calendarUsers) {
    try {
      await getFreshGoogleAccessToken(p.user_id);
    } catch (e) {
      if (e instanceof OAuthTokenError) {
        // | "NO_TOKENS"
        // | "MISSING_REFRESH_TOKEN"
        // | "REFRESH_REVOKED"      // Nel caso in cui il refresh token sia stato revocato
        // | "NETWORK"              // Problemi di rete durante il refresh
        // | "UNKNOWN";
        // Se l'errore è "NETWORK" o "UNKNOWN", interrompo l'esecuzione di questa funzione
        if (e.code === "NETWORK" || e.code === "UNKNOWN") {
          console.warn(
            `Errore di rete o sconosciuto per user_id=${p.user_id}: riproverò più tardi.`
          );
          return; // riprova al prossimo run
        }


        const user = p.user!;
        // Notifica all'utente che deve ricollegare Google Calendar
        const text = `Ciao ${
          user.nome || "utente"
        },\n\nnon riusciamo ad accedere al tuo Google Calendar per pianificare la chiamata "${
          call.titolo
        }" in quanto il tuo token OAuth è scaduto o revocato.\n\n`;
        const html = `
          <div style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px">
            <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px">
              <h2 style="margin:0 0 10px">Azione richiesta: collega Google Calendar</h2>
              <p>Ciao <strong>${user.nome || "utente"}</strong>,</p>
              <p>non riusciamo ad accedere al tuo Google Calendar per pianificare la chiamata <strong>"${
                call.titolo
              }"</strong> in quanto lo hai cancellato oppure è stato revocato.</p>
              <p>La chiamata verrà cancellata. Il recuiter procederà a creare una nuova chiamata prossimamente.</p>
            </div>
          </div>
        `.trim();
        try {
          await sendEmail(user.email, "Ricollega Google Calendar", html, text);
        } catch (_) {
          /* non bloccare ulteriormente */
        }
        console.warn(
          `Interrompo scheduling: utente ${user.email} senza token valido (${e.code}). Ne cancello la chiamata.`
        );

        // Imposta l'utente a "canceled" e la chiamata a "canceled"
        const { error: cancelErr } = await supabase
          .from("users_calls")
          .update({ stato: "canceled" })
          .eq("call_id", callId)
          .eq("user_id", p.user_id);
        if (cancelErr) {
          console.error(
            `Errore aggiornamento stato a 'canceled' per user_id=${p.user_id}:`,
            cancelErr
          );
        }

        const { error: callCancelErr } = await supabase
          .from("calls")
          .update({ stato_avanzamento: "canceled" })
          .eq("id", callId);
        if (callCancelErr) {
          console.error(
            `Errore aggiornamento stato chiamata a 'canceled' per call_id=${callId}:`,
            callCancelErr
          );
        }

        return; // interrompi: serve azione utente
      }
      console.error("Errore inatteso token Google:", e);
      return; // errore non classificato: riproveremo al prossimo run
    }
  }

  // 3) Raccogli occupato Google (freebusy) per calendari connessi
  type Interval = { start: Date; end: Date };
  const busyByUser = new Map<number, Interval[]>();

  async function fetchBusyForUser(p: ExtendedUsersCalls): Promise<Interval[]> {
    try {
      const accessToken = await getFreshGoogleAccessToken(p.user_id);
      const oAuth2 = getOAuthClient();
      oAuth2.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oAuth2 });

      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: windowStart.toISOString(),
          timeMax: windowEnd.toISOString(),
          items: [{ id: "primary" }],
        },
      });

      const calBusy =
        res.data.calendars?.primary?.busy?.map((b) => ({
          start: new Date(b.start!),
          end: new Date(b.end!),
        })) || [];

      return calBusy.filter((i) => i.end > i.start);
    } catch (e) {
      console.error(`freebusy error for user_id=${p.user_id}:`, e);
      // In caso di errore temporaneo, assumiamo "nessun busy" per non bloccare per sempre
      // (lo scheduling sarà comunque vincolato dagli altri partecipanti)
      return [];
    }
  }

  for (const p of calendarUsers) {
    const busy = await fetchBusyForUser(p);
    busyByUser.set(p.user_id, busy);
  }

  // 4) Disponibilità manuali per chi NON ha calendario (tabella "disponibilita")
  //    struttura attesa: { call_id, user_id, inizio (ISO), durata_minuti (number) }
  const nonCalendarUsers = participants.filter((p) => !p.calendario);
  type DisponRow = {
    call_id: string;
    user_id: number;
    inizio: string;
    durata_minuti: number;
  };
  let disponibilitaRows: DisponRow[] = [];
  if (nonCalendarUsers.length > 0) {
    const { data: disp, error: dispErr } = await supabase
      .from("disponibilita")
      .select("call_id, user_id, inizio, durata_minuti")
      .eq("call_id", callId);

    if (dispErr) {
      console.error("Errore lettura disponibilita:", dispErr);
      return;
    }
    disponibilitaRows = (disp || []) as DisponRow[];
  }

  // 5) Costruisci disponibilità per ogni partecipante come lista di intervalli
  //    - Per utenti con calendario: disponibilità = finestra [windowStart, windowEnd] meno i busy
  //    - Per utenti senza calendario: disponibilità = intervalli dichiarati
  function invertBusyToFree(
    busy: Interval[],
    start: Date,
    end: Date
  ): Interval[] {
    const sorted = [...busy].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
    const free: Interval[] = [];
    let cursor = new Date(start);

    for (const b of sorted) {
      const bs = new Date(Math.max(b.start.getTime(), start.getTime()));
      const be = new Date(Math.min(b.end.getTime(), end.getTime()));
      if (be <= start || bs >= end) continue;
      if (bs > cursor) {
        free.push({ start: new Date(cursor), end: new Date(bs) });
      }
      if (be > cursor) {
        cursor = new Date(be);
      }
      if (cursor >= end) break;
    }
    if (cursor < end)
      free.push({ start: new Date(cursor), end: new Date(end) });
    return free.filter((i) => i.end > i.start);
  }

  const availabilityByUser = new Map<number, Interval[]>();

  // Calendario connesso -> free slots
  for (const p of calendarUsers) {
    const busy = busyByUser.get(p.user_id) || [];
    const free = invertBusyToFree(busy, windowStart, windowEnd);
    availabilityByUser.set(p.user_id, free);
  }

  // Senza calendario -> usa disponibilita
  for (const p of nonCalendarUsers) {
    const rows = disponibilitaRows.filter((r) => r.user_id === p.user_id);
    const free = rows
      .map((r) => {
        const s = new Date(r.inizio);
        const e = new Date(s.getTime() + r.durata_minuti * 60 * 1000);
        // clamp nella finestra
        const start = new Date(Math.max(s.getTime(), windowStart.getTime()));
        const end = new Date(Math.min(e.getTime(), windowEnd.getTime()));
        return { start, end };
      })
      .filter((i) => i.end > i.start);
    availabilityByUser.set(p.user_id, free);
  }

  console.log(`Disponibilità per ${availabilityByUser.size} partecipanti:`);
  availabilityByUser.forEach((slots, userId) => {
    console.log(`Utente ${userId}: ${slots.length} slot disponibili`);
    slots.forEach((slot) => {
      console.log(
        `  - ${slot.start.toISOString()} a ${slot.end.toISOString()}`
      );
    });
  });

  // Per ogni disponibilità:
  // - Se inizia prima del sabato e continua durante un sabato, allora separa in due parti: una prima di sabato e una dopo
  // - Se inizia un sabato e continua fino a oltre lunedì, allora separala in due parti: una prima di lunedì e una dopo lunedì
  // - Se essa inizia e finisce un giorno tra <sabato> oppure <domenica> allora scarta
  const ROME_TZ_WK = "Europe/Rome";

  function romeIsWeekend(d: Date): boolean {
    // "lun, mar, mer, gio, ven, sab, dom"
    const wd = new Intl.DateTimeFormat("it-IT", {
      timeZone: ROME_TZ_WK,
      weekday: "short",
    })
      .format(d)
      .toLowerCase();
    return wd.startsWith("sab") || wd.startsWith("dom");
  }

  // Restituisce il primo istante (UTC) in cui cambia il giorno di calendario italiano
  // rispetto a `t` (cioè la mezzanotte locale successiva in Europe/Rome).
  function nextRomeDayBoundaryUTC(t: Date): Date {
    const romeDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: ROME_TZ_WK,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(t);

    // Trova via bisezione l'istante minimo in cui cambia il giorno "Rome"
    let lo = t.getTime();
    let hi = lo + 48 * 60 * 60 * 1000; // entro 48h cambia sicuramente giorno
    while (hi - lo > 60 * 1000) {
      // precisione ~1 minuto
      const mid = new Date((lo + hi) / 2);
      const midRomeDay = new Intl.DateTimeFormat("en-CA", {
        timeZone: ROME_TZ_WK,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(mid);
      if (midRomeDay === romeDay) lo = mid.getTime();
      else hi = mid.getTime();
    }
    return new Date(hi);
  }

  function excludeWeekendFromInterval(iv: Interval): Interval[] {
    const pieces: Interval[] = [];
    let cursor = new Date(iv.start);
    const end = iv.end;
    while (cursor < end) {
      const boundary = nextRomeDayBoundaryUTC(cursor);
      const segEnd = new Date(Math.min(boundary.getTime(), end.getTime()));
      if (!romeIsWeekend(cursor)) {
        // Tieni solo la parte del giorno che NON è weekend
        if (segEnd > cursor)
          pieces.push({ start: new Date(cursor), end: segEnd });
      }
      cursor = segEnd;
    }
    return pieces;
  }

  // Applica il filtro a TUTTI i partecipanti
  for (const uid of Array.from(availabilityByUser.keys())) {
    const slots = availabilityByUser.get(uid) || [];
    const filtered: Interval[] = [];
    for (const iv of slots) {
      const weekdayPieces = excludeWeekendFromInterval(iv);
      for (const p of weekdayPieces) {
        if (p.end > p.start) filtered.push(p);
      }
    }
    availabilityByUser.set(uid, filtered);
  }

  console.log(
    `Disponibilità filtrate per ${availabilityByUser.size} partecipanti:`
  );
  availabilityByUser.forEach((slots, userId) => {
    console.log(
      `Utente ${userId}: ${slots.length} slot disponibili dopo il filtro`
    );
    slots.forEach((slot) => {
      console.log(
        `  - ${slot.start.toISOString()} a ${slot.end.toISOString()}`
      );
    });
  });

  // 6) Intersezione multi-partecipante per ottenere uno slot >= durata call
  //    + vincolo fascia oraria italiana (07:00–20:00)
  //    + finestra di ricerca a tre passaggi come da specifica
  function intersectTwo(a: Interval[], b: Interval[]): Interval[] {
    const res: Interval[] = [];
    let i = 0,
      j = 0;
    const sa = a.slice().sort((x, y) => x.start.getTime() - y.start.getTime());
    const sb = b.slice().sort((x, y) => x.start.getTime() - y.start.getTime());
    while (i < sa.length && j < sb.length) {
      const start = new Date(
        Math.max(sa[i].start.getTime(), sb[j].start.getTime())
      );
      const end = new Date(Math.min(sa[i].end.getTime(), sb[j].end.getTime()));
      if (end > start) res.push({ start, end });
      if (sa[i].end < sb[j].end) i++;
      else j++;
    }
    return res;
  }

  // Parti dalla disponibilità del primo partecipante e interseca via via
  const allUserIds = participants.map((p) => p.user_id);
  if (allUserIds.length === 0) return;

  let current = availabilityByUser.get(allUserIds[0]) ?? [
    { start: windowStart, end: windowEnd },
  ];
  for (let k = 1; k < allUserIds.length; k++) {
    const av = availabilityByUser.get(allUserIds[k]) ?? [];
    current = intersectTwo(current, av);
    if (current.length === 0) break;
  }

  // --- Vincoli temporali e logica finestra ---

  const neededMs = Math.max(5, Number(call.durata || 0)) * 60 * 1000;
  const nowUtc = new Date();

  // Bound di controllo: min(3 giorni, deadline)
  const threeDays = new Date(nowUtc.getTime() + 3 * 24 * 60 * 60 * 1000);
  const min3OrDeadline = new Date(
    Math.min(threeDays.getTime(), windowEnd.getTime())
  );
  const tomorrowUtc = new Date(nowUtc.getTime() + 24 * 60 * 60 * 1000);

  const ROME_TZ = "Europe/Rome";

  function romeDayStr(d: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ROME_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const dd = parts.find((p) => p.type === "day")!.value;
    return `${y}-${m}-${dd}`;
  }
  function romeTODMinutes(d: Date): number {
    const parts = new Intl.DateTimeFormat("it-IT", {
      timeZone: ROME_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const hh = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
    const mm = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
    return hh * 60 + mm;
  }
  const todayRomeStr = romeDayStr(nowUtc);
  const tomorrowRomeStr = romeDayStr(tomorrowUtc);

  function isWithinRomeHours(start: Date, durationMs: number): boolean {
    const end = new Date(start.getTime() + durationMs);
    // tutta la riunione nello stesso giorno italiano e tra 07:00 e 20:00
    if (romeDayStr(start) !== romeDayStr(end)) return false;
    const s = romeTODMinutes(start);
    const e = romeTODMinutes(end);
    return s >= 7 * 60 && e <= 20 * 60;
  }

  // Helpers: ritaglia un intervallo su [lo, hi]
  function clip(iv: Interval, lo?: Date, hi?: Date): Interval | null {
    const s = lo
      ? new Date(Math.max(iv.start.getTime(), lo.getTime()))
      : iv.start;
    const e = hi ? new Date(Math.min(iv.end.getTime(), hi.getTime())) : iv.end;
    if (e <= s) return null;
    return { start: s, end: e };
  }

  // Candidato più "tardo" possibile entro i limiti (ricerca all'indietro)
  function candidateBackward(iv: Interval, hi: Date): Date | null {
    let endCap = new Date(Math.min(iv.end.getTime(), hi.getTime()));
    // Primo tentativo: usa lo start più tardo possibile che ci sta
    let start = new Date(
      Math.max(iv.start.getTime(), endCap.getTime() - neededMs)
    );
    if (
      start.getTime() + neededMs <= endCap.getTime() &&
      isWithinRomeHours(start, neededMs)
    ) {
      return start;
    }
    // Secondo tentativo: se endCap sfora dopo le 20, "ancorati" alle 20 locali
    const endTOD = romeTODMinutes(endCap);
    if (endTOD > 20 * 60) {
      endCap = new Date(endCap.getTime() - (endTOD - 20 * 60) * 60000);
      start = new Date(
        Math.max(iv.start.getTime(), endCap.getTime() - neededMs)
      );
      if (
        start.getTime() + neededMs <= endCap.getTime() &&
        isWithinRomeHours(start, neededMs)
      ) {
        return start;
      }
    }
    // Terzo tentativo: prova il bordo esatto dell'intervallo (fine - durata)
    endCap = new Date(Math.min(iv.end.getTime(), hi.getTime()));
    start = new Date(endCap.getTime() - neededMs);
    if (start >= iv.start && isWithinRomeHours(start, neededMs)) return start;
    return null;
  }

  // Candidato più "presto" possibile entro i limiti (ricerca in avanti)
  function candidateForward(iv: Interval, lo: Date): Date | null {
    let start = new Date(Math.max(iv.start.getTime(), lo.getTime()));
    // Primo tentativo: bordo sinistro
    if (
      start.getTime() + neededMs <= iv.end.getTime() &&
      isWithinRomeHours(start, neededMs)
    ) {
      return start;
    }
    // Secondo tentativo: se prima delle 7, salta alle 07 locali dello stesso giorno (approssimazione)
    const sTOD = romeTODMinutes(start);
    if (sTOD < 7 * 60) {
      const delta = (7 * 60 - sTOD) * 60000;
      start = new Date(start.getTime() + delta);
      if (
        start.getTime() + neededMs <= iv.end.getTime() &&
        isWithinRomeHours(start, neededMs)
      ) {
        return start;
      }
    }
    return null;
  }

  // Ordina gli intervalli (utile per priorità temporale)
  current = current
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let chosen: Interval | null = null;

  // PASSO 1: cerca tra [domani, min(3 giorni, deadline)] andando all'indietro
  // (priorità alla soluzione più "tarda" in quella piccola finestra)
  if (!chosen) {
    let bestStart: Date | null = null;
    for (const iv of current) {
      const c = clip(iv, windowStart, min3OrDeadline);
      if (!c) continue;
      const cand = candidateBackward(c, min3OrDeadline);
      if (!cand) continue;
      // deve essere almeno domani in tempo italiano
      if (romeDayStr(cand) < tomorrowRomeStr) continue;
      if (!bestStart || cand.getTime() > bestStart.getTime()) {
        bestStart = cand;
      }
    }
    if (bestStart) {
      chosen = {
        start: bestStart,
        end: new Date(bestStart.getTime() + neededMs),
      };
    }
  }

  // PASSO 2: poi cerca tra [min(3 giorni, deadline), deadline] andando in avanti
  if (!chosen) {
    let bestStart: Date | null = null;
    for (const iv of current) {
      const c = clip(iv, min3OrDeadline, windowEnd);
      if (!c) continue;
      const cand = candidateForward(c, min3OrDeadline);
      if (!cand) continue;
      if (romeDayStr(cand) < tomorrowRomeStr) continue; // niente "oggi" qui
      if (!bestStart || cand.getTime() < bestStart.getTime()) {
        bestStart = cand;
      }
    }
    if (bestStart) {
      chosen = {
        start: bestStart,
        end: new Date(bestStart.getTime() + neededMs),
      };
    }
  }

  // PASSO 3: infine cerca tra [ORA, domani) andando all'indietro (non prima di ORA)
  if (!chosen) {
    let bestStart: Date | null = null;
    for (const iv of current) {
      const c = clip(iv, nowUtc, tomorrowUtc);
      if (!c) continue;
      const cand = candidateBackward(c, c.end);
      if (!cand) continue;
      if (cand < nowUtc) continue; // non prima di ORA
      // solo "oggi" in ora italiana
      if (romeDayStr(cand) !== todayRomeStr) continue;
      if (!bestStart || cand.getTime() > bestStart.getTime()) {
        bestStart = cand;
      }
    }
    if (bestStart) {
      chosen = {
        start: bestStart,
        end: new Date(bestStart.getTime() + neededMs),
      };
    }
  }

  if (!chosen) {
    // Nessuno slot compatibile trovato: cancella la call e avvisa i partecipanti
    console.log(
      "Nessuno slot comune trovato entro i vincoli (07-20 ora italiana). Cancello la chiamata."
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

    // (opzionale) marca anche le righe users_calls come "canceled"
    await supabase
      .from("users_calls")
      .update({ stato: "canceled" })
      .eq("call_id", callId);

    // Invia email informativa
    for (const p of participants) {
      const user = p.user!;
      const textEmailContent = `
Ciao ${user.nome || "partecipante"},

non è stato possibile trovare un momento in cui tutti fossero disponibili tra le 07:00 e le 20:00 (ora italiana) entro la finestra richiesta.
Per questo motivo la chiamata "${call.titolo}" è stata annullata.

Vi invitiamo a organizzarvi autonomamente oppure ad aggiornare i calendari e riprovare a fare una nuova richiesta per l'organizzazione della call.
`.trim();

      const htmlEmailContent = `
<div style="font-family: Arial, sans-serif; background-color:#f9fafb; padding:20px;">
  <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <div style="padding:20px;border-bottom:1px solid #f0f0f0;">
      <h2 style="margin:0;font-size:20px;color:#111827;">Impossibile pianificare la chiamata</h2>
    </div>
    <div style="padding:20px;font-size:14px;color:#374151;">
      <p>Ciao <strong>${user.nome || "partecipante"}</strong>,</p>
      <p>non è stato possibile trovare un momento in cui tutti fossero disponibili tra le <strong>07:00</strong> e le <strong>20:00</strong> (ora italiana) entro la finestra richiesta.</p>
      <p>Per questo motivo la chiamata <strong>"${
        call.titolo
      }"</strong> è stata <strong>annullata</strong>.</p>
      <p>Vi invitiamo a organizzarvi autonomamente oppure ad aggiornare i calendari e riprovare a fare una nuova richiesta per l'organizzazione della call.</p>
    </div>
  </div>
</div>
`.trim();

      try {
        await sendEmail(
          user.email,
          `Chiamata "${call.titolo}" annullata – nessun orario compatibile trovato`,
          htmlEmailContent,
          textEmailContent
        );
      } catch (e) {
        console.error(`Errore invio email annullamento a ${user.email}:`, e);
      }
    }
    return; // stop qui
  }

  const startISO = chosen.start.toISOString();
  const endISO = new Date(chosen.start.getTime() + neededMs).toISOString();

  // 7) Crea evento + Meet usando l'account manager
  const attendeesEmails = participants
    .map((p) => p.user?.email)
    .filter(Boolean) as string[];

  const meeting = await generate_meetingAndEvent({
    summary: call.titolo || "Call",
    start: startISO,
    end: endISO,
    attendees: attendeesEmails,
  });

  if (!meeting) {
    console.error("Creazione evento/Meet fallita.");
    return;
  }

  // 8) Aggiorna DB call + (opzionale) stati partecipanti
  const { error: upCallErr } = await supabase
    .from("calls")
    .update({
      data_call: startISO,
      link_meet: meeting.meetLink,
      stato_avanzamento: "scheduled",
    })
    .eq("id", callId);

  if (upCallErr) {
    console.error("Errore aggiornamento call a scheduled:", upCallErr);
    return;
  }

  // 9) Invia email di conferma a tutti
  // ...
  for (const p of participants) {
    const user = p.user!;
    const modificaDisponibilitaUrl = p.token
      ? (process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "http://localhost:3000") + `availability/${encodeURIComponent(p.token)}`
      : null;

    const textEmailContent = `
Ciao ${user.nome || "partecipante"},

abbiamo pianificato la chiamata "${call.titolo}".

Dettagli:
- Quando: ${new Date(startISO).toLocaleString()}
- Durata: ${call.durata} minuti
- Link Meet: ${meeting.meetLink || "verrà condiviso a breve"}

Ti verrà anche inoltrata un'invito per aggiungere quest'evento al calendario.
${
  modificaDisponibilitaUrl
    ? `Puoi modificare la tua disponibilità qui: ${modificaDisponibilitaUrl}`
    : ""
}

Puoi aggiungere l'evento al tuo calendario da qui:
${meeting.addToCalendarUrl}

A presto!
`.trim();

    const htmlEmailContent = `
<div style="font-family: Arial, sans-serif; background-color:#f9fafb; padding:20px;">
  <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
    <div style="padding:20px;border-bottom:1px solid #f0f0f0;">
      <h2 style="margin:0;font-size:20px;color:#111827;">Chiamata pianificata</h2>
    </div>
    <div style="padding:20px;font-size:14px;color:#374151;">
      <p>Ciao <strong>${user.nome || "partecipante"}</strong>,</p>
      <p>abbiamo pianificato la chiamata:</p>
      <h3 style="margin: 0 0 10px; font-size: 18px; color: #111827;">${
        call.titolo
      }</h3>
      <table style="width:100%;border-collapse:collapse;margin:12px 0 20px;">
        <tbody>
          <tr>
            <td style="padding:6px 0;color:#6b7280;width:40%;">Quando:</td>
            <td style="padding:6px 0;color:#111827;">${new Date(
              startISO
            ).toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Durata:</td>
            <td style="padding:6px 0;color:#111827;">${call.durata} minuti</td>
          </tr>
          ${
            meeting.meetLink
              ? `<tr>
                   <td style="padding:6px 0;color:#6b7280;">Link Meet:</td>
                   <td style="padding:6px 0;"><a href="${meeting.meetLink}">${meeting.meetLink}</a></td>
                 </tr>`
              : ""
          }
        </tbody>
      </table>

      <p>
        Ti verrà anche inoltrata un'invito di google meet. Utilizzando quello potrai accedere effettivamente all'evento.
        <strong>Se non hai ricevuto l'invito e/o non riesci ad accettare l'evento, contattaci a questa <a href="mailto:streetreports.app@gmail.com">email</a>.</strong>
      </p>

      <div style="text-align:center;margin:24px 0;">
        <a href="${
          meeting.addToCalendarUrl
        }" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Aggiungi al calendario</a>
      </div>

      ${
        modificaDisponibilitaUrl
          ? `
      <div style="text-align:center;margin:12px 0;">
        <a href="${modificaDisponibilitaUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Modifica disponibilità</a>
      </div>
      `
          : ""
      }
    </div>
  </div>
</div>
`.trim();

    try {
      await sendEmail(
        user.email,
        `Conferma chiamata: "${call.titolo}"`,
        htmlEmailContent,
        textEmailContent
      );
    } catch (e) {
      console.error(`Errore invio email conferma a ${user.email}:`, e);
    }
  }

  console.log(
    `Chiamata ${callId} schedulata per ${startISO}. Meet: ${
      meeting.meetLink || "n/a"
    }`
  );
}
