// /api/agent/meet/auth/[token]

// Serve a registrare un utente dal quale si creeranno gli eventi da aggiungere a Calendar e
// che genererà il link di Google Meet per le chiamate

// NOTA IMPORTANTE:
// La callback deve venire cancellata da Google Cloud API e il token qua presente, preso dalle ENV, 
// dovrà essere periodicamente cambiato


import { NextResponse } from "next/server";
import { getOAuthClientManager, MANAGER_SCOPES } from "@/lib/googleOAuthClient";

// Utils
function json(data: any, init?: number | ResponseInit) {
  return NextResponse.json(data, init as any);
}

export async function GET(req: Request, { params }: { params: { token?: string } }) {
  const oAuth2 = getOAuthClientManager();

  if (!oAuth2) {
    return new NextResponse("OAuth client not configured", { status: 500 });
  }

  const usedParams = await params;
  const token = await usedParams?.token;
  if (!token) return json({ error: "Token mancante" }, { status: 400 });
  if (token !== process.env.MAIN_MANAGER_TOKEN) {
    return json({ error: "Token non valido" }, { status: 403 });
  }


  // Ask for offline access once to obtain a refresh_token
  const url = oAuth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures refresh_token on first grant
    scope: MANAGER_SCOPES,
  });

  return NextResponse.redirect(url);
}
