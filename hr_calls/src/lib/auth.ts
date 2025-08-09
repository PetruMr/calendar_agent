// /lib/auth.ts
// File che gestisce l'autenticazione tramite JWT

import jwt from "jsonwebtoken";

const { JWT_SECRET = "" } = process.env;

export const JWT_TOKEN_COOKIE = "JWT_TOKEN";

/**
 * Genera un token JWT per l'autenticazione.
 */
export type JwtPayload = {
  id: number;
  email: string;
  nome: string | null;
  tipo: string | null;
  username: string | null;
};

/**
 * Firma un token JWT con il payload specificato.
 * 
 * @param payload Il payload da firmare
 * @param opts Opzioni per la firma del token
 * @returns Il token JWT firmato
 */
export function signToken(payload: JwtPayload, opts: jwt.SignOptions = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", ...opts });
}

/**
 * Verifica e decodifica un token JWT.
 * 
 * @param token Il token JWT da verificare
 * @returns Il payload decodificato del token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
