// /api/auth/user/logout
// Gestisce il logout dell'utente, rimuovendo il cookie Http

import { NextResponse } from "next/server";
import { JWT_TOKEN_COOKIE } from "@/lib/auth";

/**
 * Gestisce il logout dell'utente, rimuovendo il cookie Http
 * 
 * @returns Risposta di logout, rimuove il cookie Http
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(JWT_TOKEN_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });
  return res;
}
