// /api/calls/[token]
// Gestisce le chiamate che vengono fatte dalla schermata di "modifica"
// delle disponibilità dell'utente, valida sia per utenti che hanno un profilo che non
// e che permette di scegliere le disponibilità per una call oppure cancellare o annullare le disponibilità precedentemente inviate.
// Contine metodi GET, PUT, DELETE e PATCH per gestire le chiamate, ognuno con un suo scopo specifico.


import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Tipi utili
type CallRow = {
  id: number;
  data_creazione: string;
  data_call: string | null;
  data_deadline: string | null;
  stato_avanzamento: string;
  tipo: string;
  durata: number; // minuti
  note: string | null;
  link_meet: string | null;
  titolo: string;
};

type UsersCallsRow = {
  call_id: number;
  user_id: number;
  token: string | null;
  stato: string | null;
  calendario: boolean;
};

type Users = {
    nome: string;
    email: string;
    calendario: boolean;
    stato: string;
}

// Queste sono le date di quando si è disponibili
type AvailabilityDTO = { isotime: string; durata: number };

// La risposta che viene data alla GET
type GetResponse = CallRow & { disponibilita_consigliate: AvailabilityDTO[] } & { disponibilita_date: AvailabilityDTO[] } & { users: Users[] } & { user : Users };

// Utils
function json(data: any, init?: number | ResponseInit) {
  return NextResponse.json(data, init as any);
}

function isValidISO(s: string) {
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function atLeastOneBeforeDeadline(items: AvailabilityDTO[], deadlineISO: string | null): boolean {
  if (!deadlineISO) return true; // se non c'è deadline non blocchiamo
  const deadline = new Date(deadlineISO);
  return items.some((it) => new Date(it.isotime) < deadline);
}

// Questa funzione suggerisce disponibilità
// Per ora inseriti alcuni placeholder logici, ma si potrebbe rendere più intelligente, magari vedendo
// le disponibilità degli altri utenti oppure supponendo il migliore orario per tutti.
function computeSuggestedAvailabilities(call: CallRow, _userId: number): AvailabilityDTO[] {
  // Esempio minimal: se c'è una deadline, suggerisci fino a 3 slot oggi/pomeriggio prima della deadline
  try {
    const out: AvailabilityDTO[] = [];
    const baseDurata = Math.max(15, Math.min(120, Number(call.durata) || 30)); // durata di disponibilità minima 15, massima 120 minuti
    const now = new Date();
    const deadline = call.data_deadline ? new Date(call.data_deadline) : null;

    const candidates = [
      new Date(now.getTime() + 60 * 60 * 1000), // +1h
      new Date(now.getTime() + 4 * 60 * 60 * 1000), // +4h
      new Date(now.getTime() + 24 * 60 * 60 * 1000), // domani
    ];

    for (const c of candidates) {
      if (deadline && c >= deadline) continue;
      out.push({ isotime: c.toISOString(), durata: baseDurata });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function getUserCallByToken(token: string): Promise<UsersCallsRow | null> {
  const { data, error } = await supabase
    .from("users_calls")
    .select("call_id, user_id, token, stato, calendario")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getCall(callId: number): Promise<CallRow | null> {
  const { data, error } = await supabase
    .from("calls")
    .select(
      `id, data_creazione, data_call, data_deadline, stato_avanzamento, tipo, durata, note, link_meet, titolo`
    )
    .eq("id", callId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getAvailabilityDTOs(callId: number, userId: number): Promise<AvailabilityDTO[]> {
  const { data, error } = await supabase
    .from("disponibilita")
    .select("inizio, durata_minuti")
    .eq("call_id", callId)
    .eq("user_id", userId);

  if (error) throw error;
  return (data || []).map((it) => ({
    isotime: new Date(it.inizio).toISOString(),
    durata: it.durata_minuti,
  }));
}

// Ritorna tutti gli utenti e il loro stato per una call specifica
async function getUsers(callId: number): Promise<Users[]> {
    const { data, error } = await supabase
        .from("users_calls")
        .select("user_id, stato, calendario")
        .eq("call_id", callId);
    
    if (error) throw error;
    
    // Recupera i dettagli degli utenti
    const userIds = data?.map((uc) => uc.user_id) || [];
    if (userIds.length === 0) return [];
    
    const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("nome, email")
        .in("id", userIds);
    
    if (usersError) throw usersError;
    
    return (data || []).map((uc, index) => ({
        nome: usersData[index]?.nome || "Utente sconosciuto",
        email: usersData[index]?.email || "Email non disponibile",
        calendario: uc.calendario || false,
        stato: uc.stato || "unknown",
    }));
}

// Recupera i dettagli dell'utente corrente
async function getCurrentUser(userId: number): Promise<Users | null> {
  const { data, error } = await supabase
    .from("users")
    .select("nome, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}




// GET /calls/[token]
// Ritorna i dettagli della call + disponibilita_consigliate + disponibilità dell'utente + utenti e il loro stato
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = await params?.token;
    if (!token) return json({ error: "Token mancante" }, { status: 400 });

    const uc = await getUserCallByToken(token);
    if (!uc) return json({ error: "Token non valido" }, { status: 404 });

    const call = await getCall(uc.call_id);
    if (!call) return json({ error: "Chiamata non trovata" }, { status: 404 });

    const disponibilita_consigliate = computeSuggestedAvailabilities(call, uc.user_id);

    // Recupera le disponibilità dell'utente per questa call
    let disponibilita_date = await getAvailabilityDTOs(uc.call_id, uc.user_id);
    if (!disponibilita_date) {
        disponibilita_date = []; // se non ha disponibilità, ritorna un array vuoto
    }
    
    // Recupera gli altri partecipanti e il loro stato
    const users = await getUsers(uc.call_id);
    if (!users) return json({ error: "Nessun partecipante trovato." }, { status: 404 });

    const user = await getCurrentUser(uc.user_id);
    if (!user) return json({ error: "Utente non trovato." }, { status: 404 });

    // Combina user con i dettagli stato e calendario
    if (user) {
        user.calendario = uc.calendario;
        user.stato = uc.stato || ""; // Imposta stato se non presente
    }

    const payload: GetResponse = {
      ...call,
      disponibilita_consigliate,
      disponibilita_date,
      users,
      user
    };

    return json(payload, { status: 200 });
  } catch (e: any) {
    console.error("GET /calls/[token] error:", e);
    return json({ error: e?.message || "Errore imprevisto" }, { status: 500 });
  }
}



// PUT /calls/[token]
// Il body ricevuto sarà del tipo { disponibilita: Array<{ isotime: string; durata: number }> }
// Regole minime includo avere almeno 1 disponibilità e almeno una con inizio < deadline (se presente)
// Una volta inviate non si possono modificare o aggiungerne altre
// Dopo l'inserimento marca users_calls.stato = 'accepted'
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = await params?.token;
    if (!token) return json({ error: "Token mancante" }, { status: 400 });

    const uc = await getUserCallByToken(token);
    if (!uc) return json({ error: "Token non valido" }, { status: 404 });

    const call = await getCall(uc.call_id);
    if (!call) return json({ error: "Chiamata non trovata" }, { status: 404 });

    // Blocca invio se la call non è in stato utile
    if (["canceled", "scheduled", "ended"].includes((call.stato_avanzamento || "").toLowerCase())) {
      return json({ error: "La chiamata non accetta più disponibilità." }, { status: 409 });
    }

    // Blocca invio se l'utente ha il calendario collegato
    if (uc.calendario) {
      return json({ error: "Non puoi inviare disponibilità se hai il calendario collegato." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { disponibilita?: AvailabilityDTO[] } | null;
    const list = body?.disponibilita || [];

    if (!Array.isArray(list) || list.length === 0) {
      return json({ error: "Inserisci almeno una disponibilità." }, { status: 400 });
    }

    // Validazione base
    for (const item of list) {
      if (!item || typeof item.durata !== "number" || item.durata <= 0 || typeof item.isotime !== "string" || !isValidISO(item.isotime)) {
        return json({ error: "Formato disponibilità non valido." }, { status: 400 });
      }
    }

    // Requisito: almeno una con inizio < deadline (se esiste)
    if (!atLeastOneBeforeDeadline(list, call.data_deadline)) {
      return json({ error: "Deve esserci almeno una disponibilità il cui inizio è precedente alla deadline." }, { status: 400 });
    }

    // Non permettere modifiche successive: se ci sono già righe per (call_id, user_id) -> 409
    const { count: existingCount, error: countErr } = await supabase
      .from("disponibilita")
      .select("id", { count: "exact", head: true })
      .eq("call_id", uc.call_id)
      .eq("user_id", uc.user_id);
    if (countErr) throw countErr;
    if ((existingCount || 0) > 0) {
      return json({ error: "Disponibilità già inviate per questa chiamata." }, { status: 409 });
    }

    // Inserimento delle disponibilità
    const rows = list.map((it) => ({
      inizio: new Date(it.isotime).toISOString(),
      durata_minuti: Math.round(it.durata),
      call_id: uc.call_id,
      user_id: uc.user_id,
    }));

    const { error: insertErr } = await supabase.from("disponibilita").insert(rows);
    if (insertErr) throw insertErr;

    // Aggiorna stato del partecipante -> accepted
    const { error: updateErr } = await supabase
      .from("users_calls")
      .update({ stato: "accepted" })
      .eq("call_id", uc.call_id)
      .eq("user_id", uc.user_id);
    if (updateErr) throw updateErr;

    return json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("PUT /calls/[token] error:", e);
    return json({ error: e?.message || "Errore imprevisto" }, { status: 500 });
  }
}



// DELETE /call/[token]
// Cancella l'intera chiamata associata al token
// Marca l'utente che ha il token come "canceled" nella tabella users_calls
// Questa funzione sarà idempotente per sicurezza, cioè se già cancellata/terminata risponde comunque 200
export async function DELETE(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = await params?.token;
    if (!token) return json({ error: "Token mancante" }, { status: 400 });

    const uc = await getUserCallByToken(token);
    if (!uc) return json({ error: "Token non valido" }, { status: 404 });

    const call = await getCall(uc.call_id);
    if (!call) return json({ error: "Chiamata non trovata" }, { status: 404 });

    const stato = (call.stato_avanzamento || "").toLowerCase();

    // Se già cancellata o terminata, rendi idempotente ma prova comunque a marcare i partecipanti
    if (["canceled", "ended"].includes(stato)) {
      await supabase
        .from("users_calls")
        .update({ stato: "canceled" })
        .eq("call_id", uc.call_id);
      return json({ ok: true, already: true }, { status: 200 });
    }

    // Aggiorna lo stato della call
    const { error: upCallErr } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "canceled" })
      .eq("id", uc.call_id);
    if (upCallErr) throw upCallErr;

    // Marca il partecipante che ha il token come "canceled"
    const { error: upUserCallErr } = await supabase
      .from("users_calls")
      .update({ stato: "canceled" })
      .eq("call_id", uc.call_id)
      .eq("user_id", uc.user_id);
    if (upUserCallErr) throw upUserCallErr;


    return json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("DELETE /call/[token] error:", e);
    return json({ error: e?.message || "Errore imprevisto" }, { status: 500 });
  }
}


// PATCH /calls/[token]
// Permette di reimpostare lo stato della call a "processing" e lo stato del partecipante a "waiting"
// Se l'utente non ha il calendario collegato, cancella le disponibilità già inviate
export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = await params?.token;
    if (!token) return json({ error: "Token mancante" }, { status: 400 });

    // Trova mapping utente<->call
    const uc = await getUserCallByToken(token);
    if (!uc) return json({ error: "Token non valido" }, { status: 404 });

    // Carica call
    const call = await getCall(uc.call_id);
    if (!call) return json({ error: "Chiamata non trovata" }, { status: 404 });

    // Se la call è già cancellata, non fare nulla
    if ((call.stato_avanzamento || "").toLowerCase() === "canceled") {
      return json({ ok: true, skipped: true, reason: "call_canceled" }, { status: 200 });
    }

    // Prendi info utente nella relazione per capire se ha il calendario collegato
    const { data: ucRow, error: ucRowErr } = await supabase
      .from("users_calls")
      .select("calendario")
      .eq("call_id", uc.call_id)
      .eq("user_id", uc.user_id)
      .maybeSingle();

    if (ucRowErr) throw ucRowErr;
    const calendario = !!ucRow?.calendario;

    // Reimposta lo stato della call a "processing"
    const { error: upCallErr } = await supabase
      .from("calls")
      .update({ stato_avanzamento: "processing" })
      .eq("id", uc.call_id);

    if (upCallErr) throw upCallErr;

    // Aggiorna lo stato del partecipante a "waiting"
    // Se non ha calendario: azzera mails_sent, lastmail_sent_at e cancella disponibilità
    const userUpdates: Record<string, any> = { stato: "waiting" };
    if (!calendario) {
      userUpdates.mails_sent = 0;
      userUpdates.lastmail_sent_at = null; // NB: nome campo coerente con /lib/agent.ts
    }

    const { error: upUserCallErr } = await supabase
      .from("users_calls")
      .update(userUpdates)
      .eq("call_id", uc.call_id)
      .eq("user_id", uc.user_id);

    if (upUserCallErr) throw upUserCallErr;

    // Se non ha calendario, elimina le disponibilità già inviate dall'utente
    if (!calendario) {
      const { error: delDispErr } = await supabase
        .from("disponibilita")
        .delete()
        .eq("call_id", uc.call_id)
        .eq("user_id", uc.user_id);

      if (delDispErr) throw delDispErr;
    }

    return json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("PATCH /calls/[token] error:", e);
    return json({ error: e?.message || "Errore imprevisto" }, { status: 500 });
  }
}
