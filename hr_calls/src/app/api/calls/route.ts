// /api/calls/ con GET e POST
export const dynamic = "force-dynamic"; // per evitare caching

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { JWT_TOKEN_COOKIE, verifyToken } from "@/lib/auth";

import { agent_CallCreation_EntryPoint } from "@/lib/agent";

// Se viene fatto il GET di questa route, ritorna tutte le call dell'utente di cui si ha il cookie JWT token.
export async function GET(req: NextRequest) {
  const tokenCookie = req.cookies.get(JWT_TOKEN_COOKIE)?.value;
  if (!tokenCookie) {
    // L'utente non è autenticato, non possiamo restituire le call
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Otteniamo i dettagli dell'utente utilizzando il JWT token
  const user = verifyToken(tokenCookie);

  if (!user || !user.id) {
    return NextResponse.json({ error: "Token non valido" }, { status: 401 });
  }

  // Recupera le call facendo una join tra l'utente e le chiamate
  // Inoltre esegue una seconda join per ottenere esattamente la seguente risposta:
  // {
  //     "ok": true,
  //     "calls": [
  //         {
  //             "titolo": "Titolo della call",
  //             "note": "Descrizione della call",
  //             "tipo": "screening",
  //             "stato_avanzamento": "processing",
  //             "data_call": "2025-10-29T14:00:00.000Z" (potrebbe non essere disponibile),
  //             "durata": 45,
  //             "deadline": "2025-10-29T14:00:00.000Z",
  //             "created_at": "2025-10-29T14:00:00.000Z",
  //             "user": [{
  //                 "nome": "Mario Rossi",
  //                 "email": "prova1@gmail.com",
  //                 "calendar": true,
  //             },
  //             {
  //                 "nome": "Alberto Bianchi",
  //                 "email": "prova2@prova.com",
  //                 "calendar": false,
  //                 "status": "waiting",
  //             }]
  //         }
  //     ]
  // }
  // Gli users sono ottenuti in 2 modi:
  // 1. O attraverso la tabella "users_calls" che ha una FK alla tabella "calls" e una FK alla tabella "users"
  // 2. O attraverso la tabella "partecipanti" che ha una FK al suo interno alla tabella "calls" e contiene i partecipanti che non sono utenti registrati
  // Pertanto la risposta finale contiene sia gli utenti registrati che i partecipanti esterni
  // che sono stati invitati alla call con i relativi stati.

  // Prima ottengo tutti gli id delle calls dell'utente
  const { data: userCalls, error: userCallsErr } = await supabase
    .from("users_calls")
    .select("call_id")
    .eq("user_id", user.id);
  if (userCallsErr) {
    return NextResponse.json({ error: "Impossibile recuperare le chiamate dell'utente." }, { status: 500 });
  }
  // Lo cerco anche nella tabella "partecipanti"
  const { data: userParticipations, error: partErr } = await supabase
    .from("partecipanti")
    .select("call_id")
    .eq("email", user.email)
  if (partErr) {
    return NextResponse.json({ error: "Impossibile recuperare le partecipazioni dell'utente." }, { status: 500 });
  }
  // Unisco gli id delle calls dell'utente e le partecipazioni
  const allCallIds = new Set((userCalls ?? []).map((uc) => uc.call_id).concat((userParticipations ?? []).map((p) => p.call_id)));

  // Se l'utente non ha chiamate, ritorno un array vuoto
  const callIds = Array.from(allCallIds);
  if (callIds.length === 0) {
    return NextResponse.json({ ok: true, calls: [] });
  }

  // Ora recupero le chiamate dell'utente e le ordino per data_creazione
  const { data: calls, error: callsErr } = await supabase
    .from("calls")
    .select(`
      id,
      titolo,
      note,
      tipo,
      stato_avanzamento,
      data_call,
      durata,
      data_deadline,
      data_creazione,
      users_calls:users (
          nome,
          email
        ),
      partecipanti (
        nome,
        email,
        stato
      )
    `)
    .in("id", callIds)
    .order("data_creazione", { ascending: false });


  if (callsErr) {
    return NextResponse.json({ error: "Impossibile recuperare le chiamate." }, { status: 500 });
  }

  // Ora trasformo i dati per ottenere la struttura richiesta
  const formattedCalls = (calls ?? []).map((call) => {
    // Unisco gli utenti registrati e i partecipanti esterni
    const users = (call.users_calls?.map((uc, index) => ({
      nome: uc.nome,
      email: uc.email,
      calendar: true, // Utente con Google Calendar collegato
    })) ?? []).concat(
      call.partecipanti?.map((p) => ({
        nome: p.nome,
        email: p.email,
        calendar: false, // Partecipante senza Google Calendar collegato
        status: p.stato, // Stato del partecipante
      })) ?? []
    );

    return {
      titolo: call.titolo,
      note: call.note,
      tipo: call.tipo,
      stato_avanzamento: call.stato_avanzamento,
      data_call: call.data_call || null, // Potrebbe non essere disponibile
      durata: call.durata,
      deadline: call.data_deadline,
      created_at: call.data_creazione,
      user: users,
    };
  });

  return NextResponse.json({ ok: true, calls: formattedCalls });
}

// Se viene fatto il POST, crea una nuova call con i dati passati nel body JSON.
// Il body contiene un JSON del tipo:
// {
//     "partecipanti": [
//         {
//             "nome": "mario rossi",
//             "email": "prova@gmail.com"
//         },
//         {
//             "nome": "lucio corsi",
//             "email": "prova2@gmail.com"
//         }
//     ],
//     "tipo": "screening",
//     "titolo": "Chiamata con Mario Rossi",
//     "durataMinuti": 45,
//     "deadline": "2025-10-29T14:00:00.000Z",
//     "note": "Questa è una call di prova"
// }
// Per creare la call si eseguono le seguenti operazioni:
// 1. Si crea la relazione di partecipazione per ognuno degli utenti con google calendar collegato (nella tabella "users_calls" che ha due FK, una per _id utente ed una per _id call)
// 2. Si crea un nuovo record nella tabella "partecipanti" per ogni partecipante senza google calendar collegato. Ognuno di questi record ha i seguenti campi:
//    - id
//    - nome
//    - email
//    - call_id (FK alla tabella "calls")
//    - stato (default "waiting", poi si aggiorna in "accepted" o "unavailable" o "declined" quando l'utente risponde)
//    - token (un token univoco per ogni partecipante, generato da questa funzione, che serve per identificare l'utente 
//             quando deve inserire il tempo di disponibilità per la call nella pagina specifica)
//    Se questo utente è anche già un utente registrato, il nome viene corretto con il nome dell'utente registrato.
// 3. Si crea un nuovo record nella tabella "calls" con i seguenti campi:
//    - id
//    - data_creazione (la data corrente)
//    - data_call (la data che verrà decisa successivamente)
//    - data_deadline (la data di deadline passata nel body)
//    - stato_avanzamneto (default "processing", poi si aggiorna in "scheduled" quando la call viene programmata, infine, nel caso venga cancellata, in "cancelled")
//    - tipo (il tipo di call passato nel body)
//    - durata (la durata della call in minuti passata nel body)
//    - note (le note della call, se presenti nel body)
//    - link_meet che sarà una stringa vuota
export async function POST(req: NextRequest) {

  // Si verifica che l'utente sia autenticato tramite il cookie JWT
  const tokenCookie = req.cookies.get(JWT_TOKEN_COOKIE)?.value;
  if (!tokenCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = verifyToken(tokenCookie);
  if (!user || !user.id) {
    return NextResponse.json({ error: "Token non valido" }, { status: 401 });
  }


  // Gestiamo il tipo di body che ci aspettiamo
  type Body = {
    titolo: string; // titolo della call, obbligatorio
    partecipanti: Array<{ nome: string; email: string }>;
    tipo: "screening" | "validazione" | "finale";
    durataMinuti: 30 | 45 | 60;
    deadline: string; // ISO
    note?: string | null;
  };

  const body = (await req.json()) as Body;

  // Si fa la validazione del body che viene ricevuto

  // Validazione dell'email
  const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v);

  const errors: Record<string, string> = {};
  if (!Array.isArray(body.partecipanti) || body.partecipanti.length === 0) {
    errors.partecipanti = "Aggiungi almeno un partecipante.";
  } else {
    body.partecipanti.forEach((p, idx) => {
      if (!p?.nome?.trim()) errors[`partecipanti.${idx}.nome`] = "Il nome è obbligatorio.";
      if (!p?.email?.trim()) errors[`partecipanti.${idx}.email`] = "L'email è obbligatoria.";
      else if (!isEmail(p.email)) errors[`partecipanti.${idx}.email`] = "Formato email non valido.";
    });
    const normalized = body.partecipanti.map(p => p.email.trim().toLowerCase());
    const dupSet = new Set<string>();
    normalized.forEach((e, i) => {
      if (e && normalized.indexOf(e) !== i) dupSet.add(e);
    });
    if (dupSet.size) errors["partecipanti.duplicate"] = "Email duplicate non consentite.";

    // Infine aggiungi l'utente attuale come partecipante
    if (user.email && user.nome) {
      // Controllo se l'email dell'utente attuale va bene
      if (!isEmail(user.email)) {
        errors["partecipanti.currentUser"] = "L'email dell'utente attuale non è valida.";
      } else {
        const currentUserEmail = user.email.trim().toLowerCase();
  
        if (!normalized.includes(currentUserEmail)) {
          body.partecipanti.push({ nome: user.nome, email: currentUserEmail });
        } else {
          errors["partecipanti.currentUser"] = "L'utente attuale non può essere un partecipante.";
        }
      }
    }
  }

  if (!["screening", "validazione", "finale"].includes(body.tipo)) {
    errors.tipo = "Tipo non valido.";
  }
  if (![30, 45, 60].includes(Number(body.durataMinuti))) {
    errors.durataMinuti = "Durata non valida.";
  }

  const deadline = new Date(body.deadline);
  if (isNaN(deadline.getTime())) {
    errors.deadline = "Deadline non valida.";
  } else if (deadline <= new Date()) {
    errors.deadline = "La deadline deve essere futura.";
  }

  if (body.note && body.note.length > 500) {
    errors.note = "Le note non possono superare 500 caratteri.";
  }

  // Controllo titolo non vuoto e minore di 100 caratteri
  if (!body.titolo || body.titolo.trim().length === 0) {
    errors.titolo = "Il titolo della call è obbligatorio.";
  } else if (body.titolo.length > 100) {
    errors.titolo = "Il titolo non può superare i 100 caratteri.";
  }



  // Se ci sono errori di validazione, ritorna un errore 400 con i dettagli
  // Questo permette al client di mostrare i messaggi di errore specifici

  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "ValidationError", details: errors }, { status: 400 });
  }

  // Normalizza i partecipanti
  const partecipantiInput = body.partecipanti.map(p => ({
    nome: p.nome.trim(),
    email: p.email.trim().toLowerCase(),
  }));

  // Lookup per verificare se gli utenti con le email sono già registrate e se sì, se hanno Google Calendar collegato
  const emails = partecipantiInput.map(p => p.email);
  const { data: existingUsers, error: usersErr } = await supabase
    .from("users")
    .select("id, email, nome")
    .in("email", emails);

  if (usersErr) {
    return NextResponse.json(
      { error: "Impossibile verificare gli utenti registrati." },
      { status: 500 }
    );
  }

  const usersByEmail = new Map<string, { id: string; email: string; nome: string }>();
  (existingUsers ?? []).forEach(u => usersByEmail.set((u.email || "").toLowerCase(), u as any));

  // Verifica collegamento degli utenti registrati a Google Calendar
  const registeredIds = (existingUsers ?? []).map(u => u.id);
  let oauthUserIds = new Set<string>();
  if (registeredIds.length > 0) {
    const { data: oauthRows, error: oauthErr } = await supabase
      .from("user_oauth_tokens")
      .select("user_id")
      .in("user_id", registeredIds);

    if (oauthErr) {
      return NextResponse.json(
        { error: "Impossibile verificare i token OAuth degli utenti." },
        { status: 500 }
      );
    }
    oauthUserIds = new Set((oauthRows ?? []).map(r => r.user_id as string));
  }

  // Crea la call
  const callRecord = {
    data_creazione: new Date().toISOString(),
    data_call: null,
    data_deadline: deadline.toISOString(),
    stato_avanzamento: "processing",
    tipo: body.tipo,
    durata: body.durataMinuti,
    note: body.note?.trim() || null,
    link_meet: "",
    titolo: body.titolo.trim(),
  };

  const { data: insertedCall, error: callErr } = await supabase
    .from("calls")
    .insert(callRecord)
    .select("id")
    .single();

  if (callErr || !insertedCall?.id) {
    return NextResponse.json(
      { error: "Impossibile creare la call."},
      { status: 500 }
    );
  }

  const callId: string = insertedCall.id;

  // Prepara righe users_calls e partecipanti
  type UsersCallsRow = { user_id: string; call_id: string };
  const usersCallsRows: UsersCallsRow[] = [];

  type PartecipanteRow = {
    nome: string;
    email: string;
    call_id: string;
    stato: "waiting" | "accepted" | "unavailable" | "declined";
    token: string;
  };
  const partecipantiRows: PartecipanteRow[] = [];

  // Preleva tutti i token esistenti per garantire unicità a priori
  const { data: existingTokensData, error: tokErr } = await supabase
    .from("partecipanti")
    .select("token");

  if (tokErr) {
    // rollback soft
    await supabase.from("calls").delete().eq("id", callId);
    return NextResponse.json(
      { error: "Impossibile leggere i token esistenti dei partecipanti." },
      { status: 500 }
    );
  }
  const usedTokens = new Set((existingTokensData ?? []).map(t => t.token as string));

  // Generatore token robusto (base64url 32 bytes)
  const genToken = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    // Converti in base64url
    return Buffer.from(bytes).toString("base64url");
  };

  // Genera un token unico unico fino a quando non trova uno che non è già usato
  // Questo è necessario per evitare collisioni UNIQUE nella tabella "partecipanti"
  const genUniqueToken = () => {
    let token = genToken();
    while (usedTokens.has(token)) {
      token = genToken();
    }
    usedTokens.add(token);
    return token;
  };

  for (const p of partecipantiInput) {
    const reg = usersByEmail.get(p.email);
    if (reg && oauthUserIds.has(reg.id)) {
      // Step 1: utente con GCal collegato -> relazione in users_calls
      usersCallsRows.push({ user_id: reg.id, call_id: callId });
    } else {
      // Step 2: partecipante senza GCal collegato -> record in 'partecipanti'
      const finalName = reg?.nome?.trim() || p.nome;
      partecipantiRows.push({
        nome: finalName,
        email: p.email,
        call_id: callId,
        stato: "waiting",
        token: genUniqueToken(),
      });
    }
  }

  // Inserisci relazioni in users_calls (se presenti)
  if (usersCallsRows.length > 0) {
    const { error: ucErr } = await supabase.from("users_calls").insert(usersCallsRows);
    if (ucErr) {
      await supabase.from("calls").delete().eq("id", callId);
      return NextResponse.json(
        { error: "Impossibile creare le relazioni users_calls." },
        { status: 500 }
      );
    }
  }

  // Inserisci i partecipanti esterni con retry in caso di collisione UNIQUE sul token
  if (partecipantiRows.length > 0) {
    // primo tentativo
    let { error: partErr } = await supabase.from("partecipanti").insert(partecipantiRows);

    // se collisione sul token, rigenera i token in conflitto e ritenta (max 3 volte)
    let attempts = 0;
    while (partErr && attempts < 3) {
      const msg = (partErr as any)?.message?.toLowerCase?.() || "";
      if (!msg.includes("duplicate") && !msg.includes("unique")) break;

      // rigenera tutti i token e riprova
      for (const row of partecipantiRows) {
        row.token = genUniqueToken();
      }
      const retry = await supabase.from("partecipanti").insert(partecipantiRows);
      partErr = retry.error;
      attempts++;
    }

    if (partErr) {
      // rollback soft
      await supabase.from("users_calls").delete().eq("call_id", callId);
      await supabase.from("calls").delete().eq("id", callId);
      return NextResponse.json(
        { error: "Impossibile creare i partecipanti esterni." },
        { status: 500 }
      );
    }
  }

  // Avvia insieme di funzioni asincrone dell'agent AI per la gestione di mail e organizzazione
  // dell'evento. Passerò ad esso il callId, dal quale si può ottenere tutto il resto

  agent_CallCreation_EntryPoint(callId);

  return NextResponse.json({
    ok: true,
    call_id: callId,
    created: {
      users_calls: usersCallsRows.length,
      partecipanti: partecipantiRows.length,
    },
  });
}