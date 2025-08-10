// /dashboard
// Questa pagina serve a mostrare la dashboard dell'utente
// Vi saranno tutti i dettagli del profilo, delle call organizzate e di quelle che stanno venendo organizzate.

"use client"
import useCheckLogged from "@/app/components/CheckLogged";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

// Componenti creati per la dashboard

// Componente per mostrare i dettagli del cliente e per collegare il suo account google calendar
import DashboardClient from "./DashboardClient";
import DashboardCreateCall from "./DashboardCreateCall";
import DashboardShowCalls from "./DashboardShowCalls";

export default function DashboardPage() {
  // Hook per verificare lo stato di login dell'utente
  const router = useRouter();
  const { isTokenLoading, loginStatus, userData } = useCheckLogged();
  
  // Stato per gestire il logout
  const [loggingOut, setLoggingOut] = useState(false);

  // Effetto per reindirizzare l'utente se non è loggato
  useEffect(() => {
    // Protezione lato client (in più, oltre a quella server)
    if (!isTokenLoading && !loginStatus) {
      router.replace("/access");
    }
  }, [isTokenLoading, loginStatus, router]);

  // Se non sono stati passati dati usa quelli di default
  const profile = useMemo(() => {
    return {
      email: userData?.email ?? "",
      nome: userData?.nome ?? "",
      tipo: userData?.tipo ?? "",
    };
  }, [userData]);


  // Funzione per gestire il logout
  const onLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch("/api/auth/user/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout fallito");
      router.replace("/access");
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoggingOut(false);
    }
  };

  // Se la verifica del token jwt è in fase di caricamento, mostra un loader
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

  return (
    <main className="min-h-screen w-full relative overflow-hidden">

      {/* Impostazioni del background*/}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-white to-indigo-50" />
      <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.06),transparent_60%)]" />

      {/* Contenuto principale della pagina */}
      <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
        {/* Header con saluto all'utente insieme al pulsante logout */}
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-600">Benvenuto{profile.nome ? `, ${profile.nome}` : ""} 👋</p>
          </div>

          <button
            onClick={onLogout}
            disabled={loggingOut}
            className="rounded-2xl border bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:scale-[1.01] active:scale-[.99] disabled:opacity-60"
          >
            {loggingOut ? "Logout..." : "Logout"}
          </button>
        </header>

        {/* Grid 4 sezioni */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        
            {/* Dashboard con i dati del cliente stesso, dal quale si può fare il collegamento a google calendar */}
            <DashboardClient {...userData} />
            
            <DashboardCreateCall />

            <DashboardShowCalls />
            
            <></>
        </div>
      </div>
    </main>
  );
}
