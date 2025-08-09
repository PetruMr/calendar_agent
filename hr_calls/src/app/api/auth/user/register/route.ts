// /api/auth/user/register
// Gestisce la registrazione di un nuovo utente, creando un nuovo record nel database
// Se la registrazione ha successo, viene creato un token JWT e salvato come cookie HttpOnly

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/hash";
import { signToken } from "@/lib/auth";
import { JWT_TOKEN_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, email, password, nome } = await req.json();
    if (!username || !email || !password) {
      return NextResponse.json({ error: "username, email, nome e password sono tutti richiesti" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password deve avere almeno 8 caratteri" }, { status: 400 });
    }

    // Controlla se l'email è già registrata
    const { data: existing, error: findErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (findErr) throw findErr;
    if (existing) {
      return NextResponse.json({ error: "Email già registrata" }, { status: 409 });
    }

    const { salt, hash } = await hashPassword(password);


    const { data: inserted, error: insertErr } = await supabase
      .from("users")
      .insert({
        nome,
        email,
        password: hash,
        salt,
        tipo: "RECUITER",
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
