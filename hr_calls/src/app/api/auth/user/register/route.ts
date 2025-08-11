// /api/auth/user/register
// Gestisce la registrazione di un nuovo utente, creando un nuovo record nel database
// Se la registrazione ha successo, viene creato un token JWT e salvato come cookie HttpOnly

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/hash";
import { signToken } from "@/lib/auth";
import { JWT_TOKEN_COOKIE } from "@/lib/auth";


// Gestisce la registrazione di un nuovo utente, creando un nuovo record nel database
// Il body della richiesta deve contenere un JSON con i dati dell'utente:
// {
//     "username": "mario",
//     "email": "prova@prova.it"
//     "password" : "password123",
//     "nome": "Mario Rossi"
// }
export async function POST(req: NextRequest) {
  try {
    const { username, email, password, nome } = await req.json();
    if (!username || !email || !password) {
      return NextResponse.json({ error: "username, email, nome e password sono tutti richiesti" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password deve avere almeno 8 caratteri" }, { status: 400 });
    }

    // Controlla se l'email è già registrata da un utente che non è "esterno"
    const { data: existing, error: findErr } = await supabase
      .from("users")
      .select("id, tipo")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (findErr) throw findErr;
    if (existing) {
      if( existing.tipo !== "esterno") {
        return NextResponse.json({ error: "Email già registrata" }, { status: 409 });
      }
    }

    const { salt, hash } = await hashPassword(password);

    // Se il record esiste già, ma è esterno, lo aggiorniamo
    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from("users")
        .update({
          nome,
          password: hash,
          salt,
          tipo: "recuiter",
          username,
        })
        .eq("id", existing.id)
        .select("id, email, username, tipo, nome")
        .single();

      if (updateErr) throw updateErr;

      const token = signToken({
        id: updated.id,
        email: updated.email,
        username: updated.username,
        tipo: updated.tipo,
        nome: updated.nome,
      });

      const res = NextResponse.json({ ok: true });
      // Set HttpOnly JWT cookie
      res.cookies.set(JWT_TOKEN_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return res;
    }


    // In caso contrario creiamo un nuovo record
    // Inseriamo i dati dell'utente nel database
    const { data: inserted, error: insertErr } = await supabase
      .from("users")
      .insert({
        nome,
        email,
        password: hash,
        salt,
        tipo: "recuiter",
        username,
      })
      .select("id, email, username, tipo, nome")
      .single();

    if (insertErr) throw insertErr;

    const token = signToken({
      id: inserted.id,
      email: inserted.email,
      username: inserted.username,
      tipo: inserted.tipo,
      nome: inserted.nome,
    });

    const res = NextResponse.json({ ok: true });
    // Set HttpOnly JWT cookie
    res.cookies.set(JWT_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "Registrazione fallita, riprovare più tardi" }, { status: 500 });
  }
}
