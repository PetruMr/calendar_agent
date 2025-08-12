// /lib/googleTokens.ts
// File che gestisce i token OAuth di Google, in particolare il refresh

import { supabase } from "@/lib/supabase";
import { getOAuthClient } from "@/lib/googleOAuthClient";
import { OAuthTokenError } from "@/lib/errors";

export function isInvalidGrantError(err: unknown) {
  const anyErr = err as any;
  const data = anyErr?.response?.data;
  const msg = (anyErr?.message as string) || "";

  const errorStr =
    (typeof data?.error === "string" && data.error) ||
    (typeof data === "string" && data) ||
    "";

  // Google tipicamente: 400 con { error: "invalid_grant", error_description: "Token has been expired or revoked" }
  return (
    /invalid[_ ]grant/i.test(errorStr) ||
    /invalid[_ ]grant/i.test(msg) ||
    /expired|revoked/i.test(data?.error_description || "") ||
    (anyErr?.response?.status === 400 && /invalid[_ ]grant/i.test(msg))
  );
}

type TokenRow = {
  user_id: number;
  provider: "google";
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;   // ms epoch
  updated_at: string;           // timestamp
};

export async function getFreshGoogleAccessToken(userId: number) {
  // Leggo il record
  const { data: row, error } = await supabase
    .from("user_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .single<TokenRow>();

  if (error || !row) {
    throw new OAuthTokenError("NO_TOKENS", "No Google tokens");
  }

  const { access_token, refresh_token, expiry_date } = row;
  const needsRefresh =
    !access_token || !expiry_date || Date.now() > Number(expiry_date) - 60_000;

  if (!needsRefresh) {
    return access_token as string;
  }

  if (!refresh_token) {
    // Non posso rinnovare ma devo: decido di cancellare subito il token
    await supabase
      .from("user_oauth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "google");
    throw new OAuthTokenError("MISSING_REFRESH_TOKEN", "Refresh token mancante");
  }

  // Se invece posso, allora eseguo il refresh
  try {
    const oauth2 = getOAuthClient();
    oauth2.setCredentials({ refresh_token });

    // Nota: mantengo refreshAccessToken perché è quello che usi.
    // Se in futuro usi una versione diversa della lib, adatta qui.
    const { credentials } = await oauth2.refreshAccessToken();

    const newAccess = credentials.access_token;
    const newExpiry = credentials.expiry_date;
    const maybeNewRefresh = credentials.refresh_token; // in genere vuoto, ma gestiamolo

    if (!newAccess || !newExpiry) {
      throw new OAuthTokenError("UNKNOWN", "Refresh effettuato ma dati incompleti");
    }

    // Aggiorno il record nel database
    // Usando optimistic concurrency per evitare conflitti
    const updatePayload: Partial<TokenRow> = {
      access_token: newAccess,
      expiry_date: newExpiry,
      updated_at: new Date().toISOString(),
    };
    if (maybeNewRefresh) {
      updatePayload.refresh_token = maybeNewRefresh;
    }

    const { error: upErr } = await supabase
      .from("user_oauth_tokens")
      .update(updatePayload)
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("updated_at", row.updated_at); // optimistic concurrency

    if (upErr) {
      // Se fallisce per concorrenza, rileggo e ritorno: qualcun altro ha già aggiornato.
      const { data: latest } = await supabase
        .from("user_oauth_tokens")
        .select("access_token")
        .eq("user_id", userId)
        .eq("provider", "google")
        .single<{ access_token: string }>();
      if (latest?.access_token) return latest.access_token;
      // Altrimenti, ultimo tentativo: restituisco quello appena ottenuto
      return newAccess;
    }

    return newAccess;
  } catch (err) {
    // Se è INVALID_GRANT => token revocato/invalidato: cancello il record
    if (isInvalidGrantError(err)) {
      await supabase
        .from("user_oauth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "google");
      throw new OAuthTokenError("REFRESH_REVOKED", "Refresh token revocato o scaduto", err);
    }

    // Errori di rete/rate limit: NON cancellare (transitorio)
    if ((err as any)?.code === "ETIMEDOUT" || (err as any)?.response?.status === 429) {
      throw new OAuthTokenError("NETWORK", "Errore di rete o rate limit", err);
    }

    throw new OAuthTokenError("UNKNOWN", "Errore sconosciuto in refresh", err);
  }
}



// Questa funzione fa la stessa cosa di getFreshGoogleAccessToken
// ma non gestisce un qualsiasi utente: usa nello specifico il token
// con user_id = null nella tabella user_oauth_tokens
export async function getFreshGoogleAccessTokenManager(): Promise<string> {
  // Leggo il record del "manager"
  const { data: row, error } = await supabase
    .from("user_oauth_tokens")
    .select("*")
    .is("user_id", null)            // <-- importante: usare .is per NULL
    .eq("provider", "google")
    .maybeSingle<TokenRow>();       // evita throw automatico se non esiste

  if (error || !row) {
    throw new OAuthTokenError("NO_TOKENS", "No Google tokens for manager");
  }

  const { access_token, refresh_token, expiry_date } = row;

  const expiresAtMs = expiry_date != null ? Number(expiry_date) : undefined;
  const skewMs = 60_000; // 1 min di margine
  const needsRefresh =
    !access_token || !expiresAtMs || Date.now() > expiresAtMs - skewMs;

  if (!needsRefresh) {
    return access_token!;
  }

  if (!refresh_token) {
    // Non posso rinnovare ma devo: cancello il token
    await supabase
      .from("user_oauth_tokens")
      .delete()
      .is("user_id", null)
      .eq("provider", "google");
    throw new OAuthTokenError(
      "MISSING_REFRESH_TOKEN",
      "Refresh token mancante per manager"
    );
  }

  // Provo il refresh
  try {
    const oauth2 = getOAuthClient();
    oauth2.setCredentials({ refresh_token });

    // Compat: google-auth-library può esporre refreshAccessToken() (legacy) o refreshToken() (nuove)
    let credentials:
      | { access_token?: string; expiry_date?: number; refresh_token?: string }
      | undefined;

    const anyClient = oauth2 as any;
    if (typeof anyClient.refreshAccessToken === "function") {
      const { credentials: legacyCreds } = await anyClient.refreshAccessToken();
      credentials = legacyCreds;
    } else if (typeof anyClient.refreshToken === "function") {
      const res = await anyClient.refreshToken(refresh_token);
      credentials = (res && (res.tokens || res.credentials)) as any;
    } else {
      // Fallback molto conservativo
      const tokenRes = await oauth2.getAccessToken();
      credentials = {
        access_token: typeof tokenRes === "string" ? tokenRes : tokenRes?.token ?? undefined,
        // getAccessToken non sempre fornisce scadenza/refresh_token
      };
    }

    const newAccess = credentials?.access_token;
    const newExpiry = credentials?.expiry_date;
    const maybeNewRefresh = credentials?.refresh_token; // talvolta presente

    if (!newAccess || !newExpiry) {
      throw new OAuthTokenError(
        "UNKNOWN",
        "Refresh effettuato ma dati incompleti per manager"
      );
    }

    // Aggiorno il record nel database (con concorrenza ottimistica)
    const updatePayload: Partial<TokenRow> = {
      access_token: newAccess,
      expiry_date: newExpiry,
      updated_at: new Date().toISOString(),
    };
    if (maybeNewRefresh) {
      updatePayload.refresh_token = maybeNewRefresh;
    }

    const { error: upErr } = await supabase
      .from("user_oauth_tokens")
      .update(updatePayload)
      .is("user_id", null)
      .eq("provider", "google")
      .eq("updated_at", row.updated_at); // optimistic concurrency sul valore precedente

    if (upErr) {
      // Se fallisce (es. race), rileggo e torno il token attuale
      const { data: latest } = await supabase
        .from("user_oauth_tokens")
        .select("access_token")
        .is("user_id", null)
        .eq("provider", "google")
        .maybeSingle<{ access_token: string }>();

      if (latest?.access_token) return latest.access_token;
      // Ultimo tentativo: restituisco quello appena ottenuto
      return newAccess;
    }

    return newAccess;
  } catch (err: any) {
    // INVALID_GRANT => token revocato/invalidato: cancello il record
    if (isInvalidGrantError(err)) {
      await supabase
        .from("user_oauth_tokens")
        .delete()
        .is("user_id", null)
        .eq("provider", "google");
      throw new OAuthTokenError(
        "REFRESH_REVOKED",
        "Refresh token revocato o scaduto per manager",
        err
      );
    }

    // Errori di rete / rate limit: NON cancellare (transitorio)
    if (err?.code === "ETIMEDOUT" || err?.response?.status === 429) {
      throw new OAuthTokenError(
        "NETWORK",
        "Errore di rete o rate limit per manager",
        err
      );
    }

    throw new OAuthTokenError(
      "UNKNOWN",
      "Errore sconosciuto in refresh per manager",
      err
    );
  }
}
