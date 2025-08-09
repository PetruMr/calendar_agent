// /app/api/auth/google/sendAuth
// Ricevendo il codice di autorizzazione da Google e l'_id dell'utente
// vengono salvati i token OAuth2 nel database e collegati all'utente

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getOAuthClient } from "@/lib/googleOAuthClient";

export async function POST(req: NextRequest) {
  try {
    const { code, userId } = await req.json();

    // Controlla se il codice di autorizzazione e l'ID utente sono presenti
    if (!code || !userId) {
      return NextResponse.json({ error: "Codice o utente mancanti" }, { status: 400 });
    }

    const oauth2 = getOAuthClient();
    const { tokens } = await oauth2.getToken(code);

    // Inserimo i token nel database
    // Upsert viene utilizzato per evitare duplicati
    const { error } = await supabase
      .from("user_oauth_tokens")
      .upsert({
        user_id: userId,
        provider: "google",
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ?? null, // Potrebbe essere null
        scope: Array.isArray(tokens.scope) ? tokens.scope.join(" ") : tokens.scope ?? null,
        token_type: tokens.token_type ?? "Bearer",
        expiry_date: tokens.expiry_date ?? null, // Ms da epoch
        updated_at: new Date(),
      }, { onConflict: "user_id,provider" });

    // Se c'è un errore nell'inserimento, ritorna un errore
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Se tutto va bene, ritorna un OK, indicando che i token sono stati salvati
    // e l'account Google dell'utente è stato collegato con successo
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    // Qualsiasi altro errore viene catturato e restituito come errore del server
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    } else {
      return NextResponse.json({error: "Errore del server" }, { status: 500 });
    }
  }
}
