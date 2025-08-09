// /api/auth/user/tokenTest
// Gestisce la verifica del token JWT dell'utente autenticato
// Quando l'utente accede, viene verificato il token JWT e restituiti i dati dell'utente

import { NextResponse, NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getFreshGoogleAccessToken } from "@/lib/googleTokens";
import { OAuthTokenError } from "@/lib/errors";
import { JWT_TOKEN_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // Ottiene il token utilizzando httpOnly cookie
    const token = req.cookies.get(JWT_TOKEN_COOKIE)?.value || null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = verifyToken(token);

    // Tenta di garantire un access token Google aggiornato
    // (se non collegato o revocato, NON buttiamo giù tutta la route)
    let googleConnected: boolean | null = null;
    try {
      await getFreshGoogleAccessToken(user.id);
      googleConnected = true;
    } catch (e) {
      if (e instanceof OAuthTokenError) {
        if (e.code === "NO_TOKENS") {
          googleConnected = false; // non collegato
        } else if (e.code === "MISSING_REFRESH_TOKEN" || e.code === "REFRESH_REVOKED") {
          googleConnected = false; // era collegato ma ora non più; record già cancellato
        } else if (e.code === "NETWORK") {
          // problema temporaneo: non cambiamo lo stato "connesso" in assenza di certezza
          googleConnected = null;
        } else {
          googleConnected = null;
        }
      } else {
        googleConnected = null;
      }
    }

    return NextResponse.json({
      ok: true,
      userData: {
        _id: user.id ?? null,
        username: user.username ?? null,
        tipo: user.tipo ?? "user",
        email: user.email ?? null,
        nome: user.nome ?? null,
        googleCalendarLinked: googleConnected, // true, false o null (problema di rete)
      },
    });
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
}
