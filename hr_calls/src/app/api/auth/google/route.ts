// /api/auth/google
// Gestisce l'autenticazione con Google OAuth2, questo è il primo step che reindirizzerà a Google
// e che poi andrà a completarsi con il callback alla pagina /api/auth/google/callback

import { NextResponse } from "next/server";
import { getOAuthClient, SCOPES } from "@/lib/googleOAuthClient";

// Reindirizza l'utente a Google per l'autenticazione
export async function GET() {
  const oauth2 = getOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // richiede sempre il consenso per ottenere un refresh token
  });
  return NextResponse.redirect(url);
}