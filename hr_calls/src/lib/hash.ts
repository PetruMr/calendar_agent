// /lib/hash.ts
// File che si occupa di gestire l'hashing delle password

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
const scrypt = promisify(_scrypt);

/**
 * Genera un hash della password con un salt casuale.
 * Utilizza scrypt per derivare la chiave.
 * 
 * @param password La password da hashare
 * @returns Un oggetto contenente il salt e l'hash della password
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derivedKey.toString("base64") };
}

/**
 * Verifica se la password fornita corrisponde all'hash atteso.
 * 
 * @param password La password da verificare
 * @param salt Il salt utilizzato per l'hash
 * @param expectedHashB64 L'hash atteso della password in formato base64
 * @returns true se la password è corretta, false altrimenti
 */
export async function verifyPassword(password: string, salt: string, expectedHashB64: string) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHashB64, "base64");
  
  // Utilizza timingSafeEqual per prevenire attacchi di tipo timing attack
  return timingSafeEqual(derivedKey, expected);
}
