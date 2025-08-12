// /api/agent/meet/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClientManager } from "@/lib/googleOAuthClient";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new NextResponse("Missing ?code", { status: 400 });
  }

  const oAuth2 = getOAuthClientManager();
  const { tokens } = await oAuth2.getToken(code);

  // Se già esiste lo cancello
  const { error: deleteError } = await supabase
    .from("user_oauth_tokens")
    .delete()
    .is("user_id", null)
    .eq("provider", "google");
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Salva questo token su supabase nella tabella user_oauth_tokens
  // con user_id che è null, in modo da essere l'unico record con questa caratteristica
  const { data, error } = await supabase
    .from("user_oauth_tokens")
    .insert({
      user_id: null,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
    })
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Se l'inserimento è andato a buon fine, ritorna un messaggio di successo

  // Simple success page. In your app, redirect back to UI.
  return NextResponse.json({
    ok: true,
    message: "Google connected. You can now call POST /api/agent/meet.",
  });
}
