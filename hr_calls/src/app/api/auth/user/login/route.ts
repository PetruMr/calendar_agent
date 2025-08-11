// /api/auth/user/login
// Gestisce il login dell'utente, verificando le credenziali ed impostando un cookie
// In particolare se le credenziali sono corrette, viene creato un token JWT e salvato 
// come cookie HttpOnly

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyPassword } from "@/lib/hash";
import { signToken } from "@/lib/auth";
import { JWT_TOKEN_COOKIE } from "@/lib/auth";

// Gestisce il login dell'utente, verificando le credenziali ed impostando un cookie
// Il body della richiesta deve contenere un JSON con le credenziali:
// {
//     "username": "mario",
//     "password": "password123",
// }
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "Non sono stati inseriti tutti i dati" }, { status: 400 });
    }

    // Ricerco l'utente e verifico che sia di tipo diverso da "esterno"
    let query = supabase.from("users").select("id, email, username, tipo, password, salt, nome").neq(
      "tipo", "esterno"
    ).limit(1);
    query = query.eq("username", username);

    const { data: user, error } = await query.maybeSingle();
    if (error) throw error;

    if (!user) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.salt, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }

    const token = signToken({
      id: user.id,
      nome: user.nome,
      email: user.email,
      username: user.username,
      tipo: user.tipo,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(JWT_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "Login fallito, riprovare in seguito" }, { status: 500 });
  }
}
