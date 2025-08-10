// /app/auth/google/callback/page.tsx
// Questa pagina gestisce il callback di Google dopo l'autenticazione
// Si occupa di richiedere il token di accesso, verificando che quindi l'utente sia autenticato, e manda 
// i dati necessari al server per completare il processo di salvataggio del token OAuth

// Questa pagina si poteva gestire anche come API, ma è stata creata una pagina in modo da poter mostrare
// all'utente un messaggio dinamicamente in base a quello che è necessario


"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useCheckLogged from "@/app/components/CheckLogged";

// Funzione per leggere i cookie client-side
// function getClientCookie(name: string): string | null {
//   const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
//   return m ? decodeURIComponent(m[1]) : null;
// }


function GoogleCallbackPageInner() {
  const { isTokenLoading, loginStatus, userData } = useCheckLogged();
  const router = useRouter();

  // Per leggere i parametri della query string
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle"|"working"|"done"|"error">("idle");
  const [message, setMessage] = useState<string>("");


  useEffect(() => {
    // Se l'utente non è autenticato, non può completare il processo di callback  
    if (isTokenLoading || !loginStatus) {
      setMessage("Pare tu non sia autenticato. Riprova a fare il login. Se il problema persiste, contatta l'assistenza.");
      setStatus("error");
      return;
    }

    // Poi viene ricercato il codice di autorizzazione nella query string e, in caso di errore, viene mostrato un messaggio
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    if (error) {
      setStatus("error");
      setMessage(`Errore Google: ${error}`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Manca codice di autorizzazione.");
      return;
    }

    // Se il codice è presente, viene inviato al server per completare il processo di autenticazione
    // Il server si occuperà di salvare il token OAuth e di collegare l'account Google dell'utente
    // Il codice è necessario per ottenere i token di accesso e refresh da Google
    (async () => {
      try {
        setStatus("working");
        // Your own client-readable cookie with your user's _id
        const userId = userData._id;
        if (!userId) {
          setStatus("error");
          setMessage("Mancanza di ID utente. Riprova a fare il login.");
          return;
        }

        const res = await fetch("/api/auth/google/sendAuth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code, userId }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || `Fallito il salvataggio dei token. (${res.status})`);
        }

        setStatus("done");
        router.replace("/dashboard");
      } catch (e: Error | unknown) {
        setStatus("error");
        if (e instanceof Error) {
          setMessage(e.message || "Errore sconosciuto.");
        } else {
          setMessage("Errore sconosciuto durante il salvataggio dei token.");
        }
      }
    })();
  }, [searchParams, router, isTokenLoading, loginStatus, userData]);

  // Se il token JWT è in fase di caricamento, mostra un loader
  if (isTokenLoading) {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-transparent motion-reduce:animate-none" />
          <p className="text-sm text-gray-500">Controllando la tua sessione...</p>
          <span className="sr-only">Loading</span>
        </div>
      </main>
    );
  }

  // Mostra lo stato del processo di callback
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {status === "working" && <p>Completando accesso a Google Calendar</p>}
      {status === "error" && <p>Qualcosa è andato storto. {message}</p>}
      {status === "done" && <p>Reindirizzamento...</p>}
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<div>Caricamento...</div>}>
      <GoogleCallbackPageInner />
    </Suspense>
  );
}