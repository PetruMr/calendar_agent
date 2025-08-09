// /lib/googleOAuthClient.ts
// File che gestisce il client OAuth2 per Google Calendar, in modo da poter eseguire le richieste sull'API

import { google } from "googleapis";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly"
  // oppure "https://www.googleapis.com/auth/calendar.freebusy", da controllare dopo se serve
];

/**
 * Crea un client OAuth2 per Google Calendar.
 * 
 * @returns Un client OAuth2 configurato per Google Calendar
 */
export function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Mancanti variabili d'ambiente per Google OAuth2");
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
