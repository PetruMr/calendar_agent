// /api/agent

// Gestisce la call che viene fatta dall'esterno per avviare l'agente
// Questo farà sì che l'agente inizi a lavorare per organizzare la chiamate che hanno bisogno di essere organizzate

// Verrà protetto da una variabile d'ambiente che solo QStash e questo server conoscono
// Questa sarà chiamata "QSTASH_SECRET" e sarà una stringa segreta che solo QStash e questo server conoscono

import { NextRequest, NextResponse } from "next/server";
import { agent_CallOrganizer_EntryPoint } from "@/lib/agent";

import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  // Controlla se il Bearer token è presente nell'header della richiesta
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token mancante" }, { status: 401 });
  }
  const token = authHeader.split(" ")[1];

  // Controlla se il token è corretto
  if (token !== process.env.QSTASH_SECRET) {
    return NextResponse.json({ error: "Token non valido" }, { status: 403 });
  }


  // Se il token è valido, procedi con l'elaborazione della richiesta
  try {

    // Vengono presi tutte le chiamate non "canceled" o "ended"
    const allCalls = await supabase
      .from("calls")
      .select("id, stato_avanzamento")
      .not("stato_avanzamento", "in", ["canceled", "ended"])
    if (allCalls.error) return NextResponse.json({ error: allCalls.error.message }, { status: 500 });

    if (allCalls.data.length === 0) {
        // Ritorniamo 200 
        return NextResponse.json({ ok: true });
    }

    // Per ogni call eseguiamo l'agente
    for (const call of allCalls.data) {
      const callId = call.id;
      // Avvia l'agente per organizzare la chiamata
      await agent_CallOrganizer_EntryPoint(callId);
    }

    // Ritorna una risposta positiva
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    // Gestione degli errori
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: "Errore del server" }, { status: 500 });
    }
  }
}
