// /dashboard
// Questo è un componente utilizzato all'interno della dashboard.
// Serve a mostrare i dettagli del profilo dell'utente e per gestire il collegamento al Google Calendar.
// È un componente client-side, quindi utilizza "use client" per poter interagire

"use client";

import { useMemo } from "react";

// Componenti utilizzati per la dashboard, servono a semplificare operazioni ripetute.
// Questa funzione verrà utilizzata per realizzare anche le altre card che si trovano nella dashboard.
function Card(props: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  const { title, children, className, right } = props;
  return (
    <section
      className={`rounded-3xl border bg-white/80 p-5 shadow-sm backdrop-blur transition hover:shadow-md ${className ?? ""}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// Queste sono le singole righe che compongono la dashboard, con i dettagli del profilo
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-white/60 px-3 py-2">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value ?? "—"}</span>
    </div>
  );
}

// La dashboard del cliente riceve tutti i dati dell'utente come props
export default function DashboardClient(
  userData?: {
    _id?: string | null;
    username?: string | null;
    nome?: string | null;
    email?: string | null;
    tipo?: string | null;
    googleCalendarLinked?: boolean | null; // true, false o null (problema di rete)
} | null 
) {

  // Se non sono stati passati dati usa quelli di default
  const profile = useMemo(() => {
    return {
      email: userData?.email ?? "",
      nome: userData?.nome ?? "",
      tipo: userData?.tipo ?? "",
    };
  }, [userData]);

  // Rimozione del collegamento a Google Calendar
  const disconnect = async () => {
    await fetch("/api/auth/google/revoke", { method: "POST" });
    window.location.reload();
  };

  return (
    <Card
      title="Dati del tuo profilo attuale"
      right={
        <div className="flex gap-2">
          {userData?.googleCalendarLinked === null ? (
            <span className="text-sm text-red-500">Vi sono problemi di rete</span>
          ) : userData?.googleCalendarLinked === false ? (
            // Qua si può fare la richiesta per collegare il Google Calendar
            <a href="/api/auth/google" className="flex items-center rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:scale-[1.02]">
              Collega Google Calendar
            </a>
          ) : (
            <button onClick={disconnect} className="flex items-center rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:scale-[1.02]">
              Disconnetti Google Calendar
            </button>
          )}
        </div>
      }
    >
      {/* Vengono mostrati i dati dell'utente, sia per diagnostica che per utilità */}
      <div className="space-y-2">
        <Row label="Email per comunicazioni" value={profile.email} />
        <Row label="Nome" value={profile.nome} />
        <Row label="Tipo" value={profile.tipo} />
        <Row label="Google Calendar collegato" value={userData?.googleCalendarLinked ? "Sì" : "No"} />
      </div>
    </Card>
  );
}
