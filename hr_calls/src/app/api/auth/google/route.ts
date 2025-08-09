// /api/auth/google
// Gestisce l'autenticazione con Google OAuth2, questo è il primo step che reindirizzerà a Google
// e che poi andrà a completarsi con il callback alla pagina /api/auth/google/callback

import { NextResponse } from "next/server";
import { getOAuthClient, SCOPES } from "@/lib/googleOAuthClient";

export async function GET() {
  const oauth2 = getOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // ensures refresh_token on first grant
  });
  return NextResponse.redirect(url);
}