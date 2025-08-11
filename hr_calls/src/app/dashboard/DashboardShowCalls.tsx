"use client";

import React, { useEffect, useMemo, useState } from "react";

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

// Componente per mostrare le etichette (chips) in modo uniforme, per completare le card con informazioni aggiuntive ed utili visivamente
function Chip({ children, title, className = "" }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

// Componente che mostra un accordion per le call, con titolo e contenuto espandibile
function AccordionItem({
  header,
  children,
  isOpen,
  onToggle,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">{header}</div>
        <svg
          className={`h-5 w-5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <div className={`overflow-hidden transition-[max-height] duration-300 ${isOpen ? "max-h-[1000px]" : "max-h-0"}`}>
        <div className="border-t px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

// Il tipo di utente che viene passato alla dashboard
export type ApiUser = {
  nome: string;
  email: string;
  calendar: boolean | null; // true (utente registrato con Calendar), false (partecipante esterno), null/undefined se indeterminato
  stato?: string | null; // es. "waiting" per gli esterni
};

// Il tipo di chiamata che viene passato alla dashboard dopo aver richiesto l'elenco di tutte le calls
export type ApiCall = {
  titolo?: string;
  note?: string;
  tipo?: string; // screening | validazione | finale
  stato_avanzamento?: string;
  data_call?: string | null; // ISO, potrebbe mancare
  durata?: number | null; // minuti
  deadline?: string | null; // ISO
  created_at?: string | null; // ISO
  users?: ApiUser[]; // insieme di utenti registrati (calendar=true) + partecipanti esterni (calendar=false)
};


// Tipo utilizzato per le chiamate nella dashboard, con un formato più adatto all'interfaccia utente
export type UICall = {
  key: string; // identificatore locale per accordion
  titolo: string;
  note: string;
  tipo: string;
  stato: string;
  dataCall?: string | null;
  durata?: number | null;
  deadline?: string | null;
  createdAt?: string | null;
  registeredUsers: ApiUser[];
  externalParticipants: ApiUser[]; // Che hanno calendar=false e quindi contengono uno status
};

function normalizeCall(c: ApiCall, idx: number): UICall {
  const users = c.users ?? [];
  const registeredUsers = users.filter((u) => u.calendar === true);
  const externalParticipants = users.filter((u) => u.calendar === false);

  return {
    key: String(`${idx}-${c.titolo ?? "-"}-${c.created_at ?? ""}`),
    titolo: c.titolo || "-",
    note: c.note || "",
    tipo: c.tipo || "-",
    stato: c.stato_avanzamento || "-",
    dataCall: c.data_call ?? null,
    durata: c.durata ?? null,
    deadline: c.deadline ?? null,
    createdAt: c.created_at ?? null,
    registeredUsers,
    externalParticipants,
  };
}

// Funzioni di utilità per formattare le date e i minuti in modo leggibile
function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(m?: number | null) {
  if (!m && m !== 0) return "—";
  return `${m} min`;
}


// Componente principale per mostrare le call nella dashboard
export default function DashboardShowCalls() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<UICall[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const timezoneName = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  /**
   * Funzione che recupera le chiamate dal server e aggiorna lo stato della dashboard.
   */
  async function fetchCalls() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls", { method: "GET", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        if (res.status === 401) throw new Error("Non sei autenticato. Effettua l'accesso per vedere le tue call.");
        throw new Error(j?.error || `Errore nel recupero delle call (${res.status}).`);
      };
      const data = (await res.json()) as { ok: boolean; calls: ApiCall[] };
      console.log(data)
      const list = (data?.calls || []).map(normalizeCall);
      console.log(list)
      setCalls(list);
    } catch (err: any) {
      setError(err?.message || "Errore imprevisto durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }

  // Effetto per caricare le chiamate all'avvio del componente
  useEffect(() => {
    fetchCalls();
  }, []);

  return (
    <Card
      title="Le tue call"
      className="md:col-span-2"
      right={
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Fuso orario dispositivo: {timezoneName}</span>
          <button
            onClick={fetchCalls}
            className="rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-white transition hover:scale-[1.02]"
          >
            Aggiorna
          </button>
        </div>
      }
    >
      {/* Stati di caricamento / errore / vuoto */}
      {loading && (
        <div className="animate-pulse rounded-2xl border bg-white/60 p-4 text-sm text-gray-500">Caricamento…</div>
      )}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && calls.length === 0 && (
        <div className="rounded-2xl border bg-white/60 p-4 text-sm text-gray-600">Nessuna call trovata.</div>
      )}

      <div className="space-y-3">
        {!loading && !error && calls.map((c) => {
          const isOpen = openKey === c.key;
          const participantsCount = (c.registeredUsers?.length || 0) + (c.externalParticipants?.length || 0);

          const header = (
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900">{c.titolo}</h3>
                  <Chip className="border-gray-300 text-gray-700">{c.tipo}</Chip>
                  {c.stato === "canceled" ? (
                    <Chip className="border-red-300 text-red-700">Cancellata</Chip>
                  ) : c.stato === "processing" ? (
                    <Chip className="border-yellow-300 text-yellow-700">In elaborazione</Chip>
                  ) : c.stato === "scheduled" ? (
                    <Chip className="border-green-300 text-green-700">Pianificata</Chip>
                  ) : c.stato === "ended" ? (
                    <Chip className="border-gray-300 text-gray-700">Conclusa</Chip>
                  ) : (
                    <Chip className="border-gray-300 text-gray-700">Stato sconosciuto</Chip>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-600">
                  {c.dataCall ? `Programmato: ${formatDate(c.dataCall)}` : "Da pianificare"} · Durata: {formatMinutes(c.durata)} ·
                  Deadline: {formatDate(c.deadline)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <Chip className="border-gray-300 text-gray-700">Partecipanti: {participantsCount}</Chip>
                {c.createdAt && <span className="text-[11px]">Creato il {formatDate(c.createdAt)}</span>}
              </div>
            </div>
          );

          return (
            <AccordionItem key={c.key} header={header} isOpen={isOpen} onToggle={() => setOpenKey(isOpen ? null : c.key)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Dettagli principali */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-900">Dettagli</h4>
                  <div className="rounded-xl border bg-white p-3 text-sm">
                    <dl className="grid grid-cols-3 gap-2">
                      <dt className="col-span-1 text-xs text-gray-500">Tipo</dt>
                      <dd className="col-span-2">{c.tipo || "—"}</dd>

                      <dt className="col-span-1 text-xs text-gray-500">Stato</dt>
                      <dd className="col-span-2">{c.stato || "—"}</dd>

                      <dt className="col-span-1 text-xs text-gray-500">Data</dt>
                      <dd className="col-span-2">{formatDate(c.dataCall)}</dd>

                      <dt className="col-span-1 text-xs text-gray-500">Durata</dt>
                      <dd className="col-span-2">{formatMinutes(c.durata)}</dd>

                      <dt className="col-span-1 text-xs text-gray-500">Deadline</dt>
                      <dd className="col-span-2">{formatDate(c.deadline)}</dd>
                    </dl>
                  </div>
                </div>

                {/* Partecipanti */}
                <div className="space-y-2 md:col-span-2">
                  <h4 className="text-xs font-medium text-gray-900">Partecipanti</h4>

                  {/* Utenti registrati */}
                  {c.registeredUsers.length > 0 && (
                    <div className="rounded-xl border bg-white p-3">
                      <p className="mb-2 text-xs font-medium text-gray-700">Utenti con Google Calendar</p>
                      <ul className="divide-y">
                        {c.registeredUsers.map((u, i) => (
                          <li key={`reg-${c.key}-${i}`} className="flex items-center justify-between py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900">{u.nome}</p>
                              <p className="truncate text-xs text-gray-600">{u.email}</p>
                            </div>
                            <Chip className="border-emerald-300 text-emerald-700" title="Utente con Google calendar collegato">
                              Google Calendar
                            </Chip>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Partecipanti esterni */}
                  {c.externalParticipants.length > 0 && (
                    <div className="rounded-xl border bg-white p-3">
                      <p className="mb-2 text-xs font-medium text-gray-700">Partecipanti con conferma per mail</p>
                      <ul className="divide-y">
                        {c.externalParticipants.map((p, idx) => (
                          <li key={`ext-${c.key}-${idx}`} className="flex items-center justify-between py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900">{p.nome}</p>
                              <p className="truncate text-xs text-gray-600">{p.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.stato === "waiting" ? (
                                <Chip className="border-yellow-300 text-yellow-700">In attesa di risposta</Chip>
                              ) : p.stato === "unavailable" ? (
                                <Chip className="border-red-300 text-orange-700">Non disponibile</Chip>
                              ) : p.stato === "accepted" ? (
                                <Chip className="border-green-300 text-green-700">Accettato</Chip>
                              ) : p.stato === "canceled" ? (
                                <Chip className="border-gray-300 text-red-700">Cancellato</Chip>
                              ) : (
                                <Chip className="border-gray-300 text-gray-700">Stato sconosciuto</Chip>
                              )}

                              <Chip className="border-gray-300 text-gray-700">Conferma per mail</Chip>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {c.registeredUsers.length === 0 && c.externalParticipants.length === 0 && (
                    <div className="rounded-xl border bg-white p-3 text-sm text-gray-600">Nessun partecipante</div>
                  )}
                </div>

                {/* Note */}
                <div className="md:col-span-3">
                  <h4 className="mb-2 text-xs font-medium text-gray-900">Nota della call</h4>
                  <div className="whitespace-pre-wrap rounded-xl border bg-white p-3 text-sm text-gray-800">
                    {c.note?.trim() ? c.note : <span className="text-gray-500">Nessuna nota</span>}
                  </div>
                </div>
              </div>
            </AccordionItem>
          );
        })}
      </div>
    </Card>
  );
}
