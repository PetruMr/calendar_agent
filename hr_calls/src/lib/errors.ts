// /lib/errors.ts
// File che contiene gli errori personalizzati utilizzati nell'applicazione


// Errori utili a OAuth in modo da poterli gestire nel caso di problemi
export type OAuthErrorCode =
  | "NO_TOKENS"
  | "MISSING_REFRESH_TOKEN"
  | "REFRESH_REVOKED"      // Nel caso in cui il refresh token sia stato revocato
  | "NETWORK"              // Problemi di rete durante il refresh
  | "UNKNOWN";

export class OAuthTokenError extends Error {
  code: OAuthErrorCode;
  cause?: unknown;
  constructor(code: OAuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}
