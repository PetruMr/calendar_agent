// /api/calls/ con GET e POST
export const dynamic = "force-dynamic"; // per evitare caching

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { JWT_TOKEN_COOKIE, verifyToken } from "@/lib/auth";

import { agent_CallOrganizer_EntryPoint } from "@/lib/agent";

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
  //             "users": [{
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
  // Gli users sono ottenuti attraverso la tabella "users_calls" che ha una FK alla tabella "calls" e una FK alla tabella "users"
  // Pertanto la risposta finale contiene sia gli utenti registrati che i partecipanti esterni
  // che sono stati invitati alla call con i relativi stati.

  // Prima ottengo tutti gli id delle calls dell'utente
  const { data: userCalls, error: userCallsErr } = await supabase
    .from("users_calls")
    .select("call_id")
    .eq("user_id", user.id);
  if (userCallsErr) {
    return NextResponse.json(
      { error: "Impossibile recuperare le chiamate dell'utente." },
      { status: 500 }
    );
  }

  // Ottengo gli id delle chiamate
  const callIds = (userCalls ?? []).map((uc) => uc.call_id).filter(Boolean);
  if (callIds.length === 0) {
    return NextResponse.json({ ok: true, calls: [] });
  }

  // Ora recupero le chiamate dell'utente e le ordino per data_creazione
  const { data: calls, error: callsErr } = await supabase
    .from("calls")
    .select(
      `
        id,
        titolo,
        note,
        tipo,
        stato_avanzamento,
        data_call,
        durata,
        link_meet,
        data_deadline,
        data_creazione,
        users_calls (
          stato,
          calendario,
          users:users (
            nome,
            email
          )
        )
      `
    )
    .in("id", callIds)
    .order("data_creazione", { ascending: false });

  if (callsErr) {
    return NextResponse.json(
      { error: "Impossibile recuperare le chiamate." + callsErr.message },
      { status: 500 }
    );
  }

  // Trasformo i dati nel formato richiesto
  const formattedCalls = (calls ?? []).map((call) => ({
    titolo: call.titolo,
    note: call.note,
    tipo: call.tipo,
    stato_avanzamento: call.stato_avanzamento,
    data_call: call.data_call ?? null,
    durata: call.durata,
    link_meet: call.link_meet ?? "",
    deadline: call.data_deadline,
    created_at: call.data_creazione,
    users: (call.users_calls ?? []).map((uc: any) => ({
      stato: uc.stato,
      calendar: !!uc.calendario,
      nome: uc.users?.nome ?? null,
      email: uc.users?.email ?? null,
    })),
  }));

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
// 1. Si aggiorna la tabella utenti, aggiungendo utenti nuovi se le mail non sono tra quelle già registrate e aggiornando il nome se invece già esistono e sono "esterni".
// 2. Si crea un nuovo record nella tabella "calls" con i seguenti campi:
//    - id
//    - data_creazione (la data corrente)
//    - data_call (la data che verrà decisa successivamente)
//    - data_deadline (la data di deadline passata nel body)
//    - stato_avanzamneto (default "processing", poi si aggiorna in "scheduled" quando la call viene programmata, infine, nel caso venga cancellata, in "cancelled". dopo la data di fine, passa a "ended")
//    - tipo (il tipo di call passato nel body)
//    - durata (la durata della call in minuti passata nel body)
//    - note (le note della call, se presenti nel body)
//    - link_meet che sarà una stringa vuota
// 3. Si crea la relazione di partecipazione per ognuno degli utenti (nella tabella "users_calls" che ha due FK, una per _id utente ed una per _id call)
//    in particolare, se l'utente ha google calendar collegato, ovvero in "users_oauth_tokens" ha un record con il proprio id, allora si segna "calendario" come true
//    In caso contrario si segnala calendario come false e si creano i seguenti dati nel record di users_calls
//    - stato (default "waiting", poi si aggiorna in "accepted" o "canceled" quando l'utente risponde)
//    - token (un token univoco per ogni partecipante, generato da questa funzione, che serve per identificare l'utente
//             quando deve inserire il tempo di disponibilità per la call nella pagina specifica)
//    - created_at (data di creazione della relazione)
//    - lastmail_sent_at (impostata a null, viene aggiornata quando si invia la mail di richiesta disponibilità)
//    - mails_sent (numero che indica quante mail sono già state inviate a questo partecipante, inizialmente 0)
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
      if (!p?.nome?.trim())
        errors[`partecipanti.${idx}.nome`] = "Il nome è obbligatorio.";
      if (!p?.email?.trim())
        errors[`partecipanti.${idx}.email`] = "L'email è obbligatoria.";
      else if (!isEmail(p.email))
        errors[`partecipanti.${idx}.email`] = "Formato email non valido.";
    });
    const normalized = body.partecipanti.map((p) =>
      (p.email || "").trim().toLowerCase()
    );
    const dupSet = new Set<string>();
    normalized.forEach((e, i) => {
      if (e && normalized.indexOf(e) !== i) dupSet.add(e);
    });
    if (dupSet.size)
      errors["partecipanti.duplicate"] = "Email duplicate non consentite.";

    // Infine aggiungi l'utente attuale come partecipante
    if (user.email && user.nome) {
      // Controllo se l'email dell'utente attuale va bene
      if (!isEmail(user.email)) {
        errors["partecipanti.currentUser"] =
          "L'email dell'utente attuale non è valida.";
      } else {
        const currentUserEmail = user.email.trim().toLowerCase();

        if (!normalized.includes(currentUserEmail)) {
          body.partecipanti.push({ nome: user.nome, email: currentUserEmail });
        } else {
          errors["partecipanti.currentUser"] =
            "L'utente attuale non può essere un partecipante.";
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

  // Controlla inoltre se la deadline è entro 14 giorni
  const maxDeadline = new Date();
  maxDeadline.setDate(maxDeadline.getDate() + 14);
  if (deadline > maxDeadline) {
    errors.deadline = "La deadline non può essere oltre 14 giorni.";
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
    return NextResponse.json(
      { error: "Errore di validazione dell'input", details: errors },
      { status: 400 }
    );
  }

  // Normalizza i partecipanti
  const partecipantiInput = body.partecipanti.map((p) => ({
    nome: p.nome.trim(),
    email: p.email.trim().toLowerCase(),
  }));
  const emails = partecipantiInput.map((p) => p.email);
  const nameByEmail = new Map<string, string>(
    partecipantiInput.map((p) => [p.email, p.nome])
  );


  // Lookup per verificare se gli utenti con le email sono già registrate e se sì, se hanno Google Calendar collegato
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

  const usersByEmail = new Map<
    string,
    { id: string; email: string; nome: string }
  >();
  (existingUsers ?? []).forEach((u) =>
    usersByEmail.set((u.email || "").toLowerCase(), u as any)
  );

  // Prepara inserimenti per email non presenti
  const toInsert = partecipantiInput
    .filter((p) => !usersByEmail.has(p.email))
    .map((p) => ({
      email: p.email,
      nome: p.nome,
      tipo: "esterno", // nuovo utente esterno
    }));

  if (toInsert.length > 0) {
    const { data: insertedUsers, error: insErr } = await supabase
      .from("users")
      .insert(toInsert)
      .select("id, email, nome, tipo");

    if (insErr) {
      return NextResponse.json(
        { error: "Impossibile creare i nuovi utenti." },
        { status: 500 }
      );
    }
    (insertedUsers ?? []).forEach((u) =>
      usersByEmail.set((u.email || "").toLowerCase(), u as any)
    );
  }

  // aggiorna il nome se l'utente è esterno
  const toUpdate = (existingUsers ?? []).filter((u) => {
    const providedName = nameByEmail.get((u.email || "").toLowerCase());
    const isEsterno = (u as any).tipo === "esterno";
    return (
      isEsterno &&
      providedName &&
      providedName.trim() &&
      providedName.trim() !== (u.nome || "").trim()
    );
  });

  if (toUpdate.length > 0) {
    const updates = toUpdate.map((u) =>
      supabase
        .from("users")
        .update({ nome: nameByEmail.get((u.email || "").toLowerCase()) })
        .eq("id", u.id)
    );
    const updRes = await Promise.all(updates);
    const updErr = updRes.find((r) => (r as any)?.error);
    if (updErr) {
      return NextResponse.json(
        { error: "Impossibile aggiornare i nomi degli utenti esterni." },
        { status: 500 }
      );
    }
  }

  // ricalcola ids registrati
  const allUsers = Array.from(usersByEmail.values());
  const registeredIds = allUsers.map((u) => u.id);

  // verifica collegamento Google Calendar
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
    oauthUserIds = new Set((oauthRows ?? []).map((r) => r.user_id as string));
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
      { error: "Impossibile creare la call." },
      { status: 500 }
    );
  }

  const callId: string = insertedCall.id;

  // Generiamo ora la relazione users_calls per tutti i partecipanti 
  // Token univoci: leggi token già usati (non null) per evitare collisioni
  const { data: existingTokensData, error: tokErr } = await supabase
    .from("users_calls")
    .select("token")
    .not("token", "is", null);

  if (tokErr) {
    await supabase.from("calls").delete().eq("id", callId);
    return NextResponse.json(
      { error: "Impossibile leggere i token esistenti." },
      { status: 500 }
    );
  }
  const usedTokens = new Set<string>(
    (existingTokensData ?? [])
      .map((t) => t.token as string)
      .filter(Boolean)
  );

  const genToken = () => {
    const bytes = new Uint8Array(32);
    const b64 = Buffer.from(crypto.getRandomValues(bytes)).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const genUniqueToken = () => {
    let token = genToken();
    while (usedTokens.has(token)) {
      token = genToken();
    }
    usedTokens.add(token);
    return token;
  };

  type UsersCallsInsert = {
    user_id: string;
    call_id: string;
    calendario: boolean;
    stato?: "waiting" | "accepted" | "canceled";
    token?: string | null;
    created_at?: string;
    lastmail_sent_at?: string | null;
    mails_sent?: number;
  };

  const nowIso = new Date().toISOString();
  const usersCallsRows: UsersCallsInsert[] = partecipantiInput.map((p) => {
    const u = usersByEmail.get(p.email)!;
    const hasOauth = oauthUserIds.has(u.id);
    if (hasOauth) {
      return {
        user_id: u.id,
        call_id: callId,
        calendario: true,
        token: genUniqueToken()
      };
    }
    return {
      user_id: u.id,
      call_id: callId,
      calendario: false,
      stato: "waiting",
      token: genUniqueToken(),
      created_at: nowIso,
      lastmail_sent_at: null,
      mails_sent: 0,
    };
  });

  // inserisci in blocco con retry se collisione token
  const insertUsersCalls = async (rows: UsersCallsInsert[]) => {
    return await supabase.from("users_calls").insert(rows);
  };

  let { error: ucErr } = await insertUsersCalls(usersCallsRows);
  let attempts = 0;
  while (ucErr && attempts < 3) {
    const msg = (ucErr as any)?.message?.toLowerCase?.() || "";
    const isTokenConflict =
      msg.includes("duplicate") || msg.includes("unique") || msg.includes("token");
    if (!isTokenConflict) break;

    // rigenera i token per i soli record senza calendario
    for (const row of usersCallsRows) {
      if (row.calendario === false) {
        row.token = genUniqueToken();
      }
    }
    const retry = await insertUsersCalls(usersCallsRows);
    ucErr = retry.error;
    attempts++;
  }

  if (ucErr) {
    await supabase.from("users_calls").delete().eq("call_id", callId);
    await supabase.from("calls").delete().eq("id", callId);
    return NextResponse.json(
      { error: "Impossibile creare le relazioni users_calls." },
      { status: 500 }
    );
  }

  // avvio asincrono dell'agent
  agent_CallOrganizer_EntryPoint(insertedCall.id)


  return NextResponse.json({
    ok: true,
    call_id: callId,
    created: {
      users_calls: usersCallsRows.length,
    },
  });
}
