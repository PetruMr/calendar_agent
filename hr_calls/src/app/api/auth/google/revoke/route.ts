// /app/api/google/revoke
// Gestisce la revoca dei token OAuth2 di Google
// Quando l'utente si disconnette, i token vengono revocati per evitare accessi non autorizzati
// Utilizza il cookie JWT per identificare l'utente e rimuovere i token dal database

import { NextRequest, NextResponse } from "next/server";
import { JWT_TOKEN_COOKIE, verifyToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const tokenCookie = req.cookies.get(JWT_TOKEN_COOKIE)?.value;
  if (!tokenCookie) {
    // L'utente non è autenticato, non possiamo revocare i token
    return NextResponse.json({ ok: true });
  }

  // Otteniamo i dettagli dell'utente utilizzando il JWT token
  const user = verifyToken(tokenCookie);

  // Otteniamo i token OAuth2 dell'utente dal database 
    const { data: tokens, error } = await supabase
        .from("user_oauth_tokens")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "google")
        .single();

  // Prefer revoking the refresh_token so the whole grant is removed
  const tokenToRevoke = tokens?.refresh_token || tokens?.access_token;
  try {
      if (tokenToRevoke) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokenToRevoke }).toString(),
        });
        // Per RFC 7009, i server ritornano 200 anche se è già revocato.
        // Rimuoviamo i token dal nostro database
        if (!error) {
          await supabase
            .from("user_oauth_tokens")
            .delete()
            .eq("user_id", user.id)
            .eq("provider", "google");
        }
        return NextResponse.json({ ok: true });
      }
  } catch (e) {
    console.error("Error revoking Google token:", e);
    return NextResponse.json({ error: "Failed to revoke Google token" }, { status: 500 });
  }
}
