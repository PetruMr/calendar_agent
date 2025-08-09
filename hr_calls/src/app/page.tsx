// /
// Root dell'applicazione HR Calls

"use client";

import useCheckLogged from "@/app/components/CheckLogged";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Se l'utente non è autenticato, viene reindirizzato alla pagina di accesso
// Se l'utente è autenticato, viene reindirizzato alla dashboard

export default function Home() {
  const { isTokenLoading, loginStatus, userData } = useCheckLogged();
  const router = useRouter();
  
  useEffect(() => {
    if (!isTokenLoading && !loginStatus) {
      router.replace("/access");
    } else if (!isTokenLoading && loginStatus) {
      router.replace("/dashboard");
    }
  }, [isTokenLoading, loginStatus, userData, router]);
  
  // Durante il caricamento, viene mostrata una schermata di caricamento
  if (isTokenLoading) {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-transparent motion-reduce:animate-none" />
          <p className="text-sm text-gray-500">Controllando la tua sessione...</p>
          <span className="sr-only">Caricamento</span>
        </div>
      </main>
    );
  }

  // Questa pagina è vuota se l'utente è autenticato, in quanto verrà reindirizzato
  return <main className="p-8"></main>;
}
