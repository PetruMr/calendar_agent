// /availability/[token]
// Gestisce la pagina di disponibilità per una chiamata specifica
// utilizzando il token. Questo è un identificatore univico che collega una chiamata ad un utente e permette
// le operazioni di modifica della chiamata, come cancellarla o aggiungere disponibilità.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

// Tipi utili
export type SuggestedAvailability = { isotime: string; durata: number }; // minuti
export type Availability = { isotime: string; durata: number };

export type ApiUser = {
  nome: string;
  email: string;
  stato?: string | null; // waiting | accepted | canceled | ...
  calendario: boolean | null; // true se connesso a Google Calendar
};

export type CallDetails = {
  data_creazione: string;
  data_call: string | null;
  data_deadline: string | null;
  stato_avanzamento: string; // processing | scheduled | canceled | ended
  tipo: string;
  durata: number; // minuti previsti della call
  note: string | null;
  link_meet: string | null;
  titolo: string;
  disponibilita_consigliate: SuggestedAvailability[];
  disponibilita_date?: Availability[]; // già salvate a DB per questo utente
  users?: ApiUser[]; // elenco partecipanti
  user?: ApiUser | null; // 👈 dettaglio utente attuale (nuovo campo dalla GET)
};

// Primitive dell'UI
function Card(props: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  const { title, children, className, right } = props;
  return (
    <section className={`rounded-3xl border bg-white/80 p-5 shadow-sm backdrop-blur transition hover:shadow-md ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Chip({ children, title, className = "" }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

// Utils
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

function toISOFromLocal(dtLocal: string) {
  if (!dtLocal) return "";
  const [date, time] = dtLocal.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0 as any, mm = 0 as any] = (time ?? "0:0").split(":" as any).map(Number);
  const local = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return local.toISOString();
}

function fromISOToLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function statusChip(stato?: string | null) {
  const s = (stato || "").toLowerCase();
  if (s === "canceled") return { className: "border-red-300 text-red-700", label: "Cancellata" };
  if (s === "processing") return { className: "border-yellow-300 text-yellow-700", label: "In elaborazione" };
  if (s === "scheduled") return { className: "border-green-300 text-green-700", label: "Pianificata" };
  if (s === "ended") return { className: "border-gray-300 text-gray-700", label: "Terminata" };
  return { className: "border-gray-300 text-gray-700", label: "Stato sconosciuto" };
}

// Pagina effettiva
export default function AvailabilityPage() {
  const params = useParams();
  const token = (params?.token as string) || "";

  // Stato fetch
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dati call
  const [call, setCall] = useState<CallDetails | null>(null);

  // Disponibilità già inviate (bloccate) e nuove che l'utente sta aggiungendo ora
  const [lockedAvailabilities, setLockedAvailabilities] = useState<(Availability & { locked: true })[]>([]);
  const [myAvailabilities, setMyAvailabilities] = useState<(Availability & { locked?: false })[]>([]);

  // Form per aggiungere disponibilità
  const [newStartLocal, setNewStartLocal] = useState<string>(""); // datetime-local
  const [newDuration, setNewDuration] = useState<number>(30);

  // Messaggi UI
  const [message, setMessage] = useState<string | null>(null);

  const timezoneName = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Fetch iniziale delle informazioni sulla call
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/calls/${encodeURIComponent(token)}`, { method: "GET" });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || `Errore nel recupero della call (${res.status}).`);
        }
        const data = (await res.json()) as CallDetails; // include anche "user"
        if (!mounted) return;
        setCall(data);
        setLockedAvailabilities((data.disponibilita_date || []).map((a) => ({ ...a, locked: true })));
        setMyAvailabilities([]);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Errore imprevisto durante il caricamento.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // Helpers per la validazione richiesta: almeno una disponibilità NUOVA con inizio < deadline
  function validateBeforeSend(): string | null {
    if (!myAvailabilities.length) return "Aggiungi almeno una disponibilità.";
    const deadlineISO = call?.data_deadline || null;
    if (!deadlineISO) return null;
    const deadline = new Date(deadlineISO);
    const ok = myAvailabilities.some((a) => new Date(a.isotime) < deadline);
    if (!ok) return "Deve esserci almeno una disponibilità il cui inizio è precedente alla deadline.";
    return null;
  }

  function addAvailabilityFromInputs() {
    setMessage(null);
    if (!newStartLocal) {
      setMessage("Imposta data/ora della disponibilità.");
      return;
    }
    if (!newDuration || newDuration <= 0) {
      setMessage("Imposta una durata valida in minuti.");
      return;
    }
    const iso = toISOFromLocal(newStartLocal);
    setMyAvailabilities((prev) => [...prev, { isotime: iso, durata: Number(newDuration) }]);
    // reset campi
    setNewStartLocal("");
    setNewDuration(30);
  }

  function removeAvailability(idx: number) {
    setMyAvailabilities((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSend() {
    setMessage(null);
    const v = validateBeforeSend();
    if (v) {
      setMessage(v);
      return;
    }
    const confirmed = window.confirm("Inviare le disponibilità? Una volta inviate non potranno essere modificate.");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disponibilita: myAvailabilities }), // invia SOLO le nuove
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Errore durante l'invio (${res.status}).`);
      }
      setSuccess("Operazione andata a buon fine.");
    } catch (e: any) {
      setMessage(e?.message || "Errore imprevisto durante l'invio.");
    }
  }

  async function onCancelCall() {
    const confirmed = window.confirm("Sei sicuro di voler annullare la chiamata?");
    if (!confirmed) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(token)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Errore durante l'annullamento (${res.status}).`);
      }
      setSuccess("Operazione andata a buon fine.");
    } catch (e: any) {
      setMessage(e?.message || "Errore imprevisto durante l'annullamento.");
    }
  }

  async function onMarkUnavailable() {
    const confirmed = window.confirm("Vuoi segnalare che non sei più disponibile per questa chiamata?");
    if (!confirmed) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "unavailable" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Errore durante l'operazione (${res.status}).`);
      }
      setSuccess("Operazione andata a buon fine.");
    } catch (e: any) {
      setMessage(e?.message || "Errore imprevisto durante l'operazione.");
    }
  }

  if (success) {
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-8">
        <Card title="Esito">
          <p className="text-sm text-gray-800">{success}</p>
        </Card>
      </main>
    );
  }

  // Deriva elenco partecipanti diviso per calendar
  const registeredUsers = (call?.users || []).filter((u) => u.calendario === true);
  const externalParticipants = (call?.users || []).filter((u) => u.calendario === false);

  const stato = (call?.stato_avanzamento || "").toLowerCase();
  const userHasCalendar = call?.user?.calendario;

  // visibilità sezioni
  const showSuggestions = !userHasCalendar && !["scheduled", "canceled", "ended"].includes(stato);
  const showAvailabilitySection = !userHasCalendar; // nascondi tutta la card se l'utente ha calendar connesso

  // permessi azioni
  const canEditAvailabilities = stato === "processing" && showAvailabilitySection;
  const canSend = canEditAvailabilities && myAvailabilities.length > 0;
  const canCancelCall = ["processing", "scheduled"].includes(stato);
  const canMarkUnavailable = ["processing", "scheduled"].includes(stato);

  const displayedAvailabilities = [
    ...lockedAvailabilities.map((a) => ({ ...a, locked: true as const })),
    ...myAvailabilities.map((a) => ({ ...a, locked: false as const })),
  ];

  const chip = statusChip(call?.stato_avanzamento);

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      {/* Header */}
      <div className="mb-4 text-xs text-gray-500">Fuso orario dispositivo: {timezoneName}</div>

      {/* Stati di caricamento / errore */}
      {loading && <div className="animate-pulse rounded-2xl border bg-white/60 p-4 text-sm text-gray-500">Caricamento…</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && call && (
        <div className="space-y-4">
          {/* Dettagli call */}
          <Card
            title={call.titolo || "Dettagli chiamata"}
            right={
              <div className="flex items-center gap-2">
                <Chip className="border-gray-300 text-gray-700">{call.tipo}</Chip>
                <Chip className={chip.className}>{chip.label}</Chip>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-900">Dettagli</h4>
                <div className="rounded-xl border bg-white p-3 text-sm">
                  <dl className="grid grid-cols-3 gap-2">
                    <dt className="col-span-1 text-xs text-gray-500">Creata il</dt>
                    <dd className="col-span-2">{formatDate(call.data_creazione)}</dd>

                    <dt className="col-span-1 text-xs text-gray-500">Data chiamata</dt>
                    <dd className="col-span-2">{formatDate(call.data_call)}</dd>

                    <dt className="col-span-1 text-xs text-gray-500">Durata</dt>
                    <dd className="col-span-2">{call.durata} min</dd>

                    <dt className="col-span-1 text-xs text-gray-500">Deadline</dt>
                    <dd className="col-span-2">{formatDate(call.data_deadline)}</dd>
                  </dl>
                </div>
              </div>

              {/* Partecipanti */}
              <div className="space-y-2 md:col-span-2">
                <h4 className="text-xs font-medium text-gray-900">Partecipanti</h4>

                {registeredUsers.length > 0 && (
                  <div className="rounded-xl border bg-white p-3">
                    <p className="mb-2 text-xs font-medium text-gray-700">Utenti con Google Calendar</p>
                    <ul className="divide-y">
                      {registeredUsers.map((u, i) => (
                        <li key={`reg-${i}`} className="flex items-center justify-between py-2 text-sm">
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

                {externalParticipants.length > 0 && (
                  <div className="rounded-xl border bg-white p-3">
                    <p className="mb-2 text-xs font-medium text-gray-700">Partecipanti con conferma per mail</p>
                    <ul className="divide-y">
                      {externalParticipants.map((p, idx) => (
                        <li key={`ext-${idx}`} className="flex items-center justify-between py-2 text-sm">
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

                {registeredUsers.length === 0 && externalParticipants.length === 0 && (
                  <div className="rounded-2xl border bg-white/60 p-3 text-sm text-gray-600">Nessun partecipante</div>
                )}
              </div>

              {/* Note call */}
              <div className="md:col-span-3">
                <h4 className="mb-2 text-xs font-medium text-gray-900">Nota della call</h4>
                <div className="whitespace-pre-wrap rounded-xl border bg-white p-3 text-sm text-gray-800">
                  {call.note?.trim() ? call.note : <span className="text-gray-500">Nessuna nota</span>}
                </div>
              </div>
            </div>
          </Card>

          {/* Disponibilità consigliate (non mostrare se scheduled/canceled/ended o se l'utente ha calendar collegato) */}
          {showSuggestions && call.disponibilita_consigliate?.length ? (
            <Card title="Disponibilità consigliate">
              <ul className="divide-y rounded-xl border bg-white">
                {call.disponibilita_consigliate.map((s, idx) => (
                  <li key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{formatDate(s.isotime)}</div>
                      <div className="text-xs text-gray-600">Durata suggerita: {s.durata} min</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMyAvailabilities((prev) => [...prev, { isotime: s.isotime, durata: s.durata }])}
                      className="rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:scale-[1.02]"
                    >
                      Aggiungi
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Aggiungi + elenco disponibilità — nascosta se user.calendar === true */}
          {showAvailabilitySection && (
            <Card
              title="Le tue disponibilità"
              right={<span className="text-xs text-gray-500">Indica almeno una disponibilità prima della deadline</span>}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-gray-500">Inizio disponibilità</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    value={newStartLocal}
                    onChange={(e) => setNewStartLocal(e.target.value)}
                    min={fromISOToLocalInputValue(call.data_creazione)}
                    disabled={!canEditAvailabilities}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs text-gray-500">Durata (min)</label>
                  <input
                    type="number"
                    min={1}
                    step={5}
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    disabled={!canEditAvailabilities}
                  />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={addAvailabilityFromInputs}
                    disabled={!canEditAvailabilities}
                    className="w-full rounded-xl border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Aggiungi
                  </button>
                </div>
              </div>

              {/* Elenco disponibilità (bloccate + nuove) */}
              <div className="mt-4">
                {displayedAvailabilities.length === 0 ? (
                  <div className="rounded-xl border bg-white/60 p-3 text-sm text-gray-600">Nessuna disponibilità.</div>
                ) : (
                  <ul className="divide-y rounded-xl border bg-white">
                    {displayedAvailabilities.map((a, idx) => (
                      <li key={`${a.isotime}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium text-gray-900">{formatDate(a.isotime)}</div>
                          <div className="text-xs text-gray-600">Durata: {a.durata} min</div>
                        </div>
                        {a.locked ? (
                          <Chip className="border-gray-300 text-gray-700" title="Disponibilità già inviata">
                            Inviata
                          </Chip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeAvailability(idx - lockedAvailabilities.length)}
                            className="rounded-lg border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            title="Rimuovi disponibilità"
                          >
                            Rimuovi
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {message && <p className="mt-3 text-xs text-red-600">{message}</p>}

              {/* Pulsante invio (solo in processing) */}
              <div className="mt-4 flex justify-end">
                {canSend && (
                  <button
                    type="button"
                    onClick={onSend}
                    className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:scale-[1.02]"
                  >
                    Invia
                  </button>
                )}
              </div>
            </Card>
          )}

          {/* Sezione azioni raggruppate con "Non più disponibile" e "Annulla chiamata" */}
          {(canMarkUnavailable || canCancelCall) && (
            <Card title="Azioni sulla chiamata">
              <div className="flex flex-col gap-2 sm:flex-row">
                {canMarkUnavailable && (
                  <button
                    type="button"
                    onClick={onMarkUnavailable}
                    className="rounded-xl border border-amber-600 bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:scale-[1.02]"
                  >
                    Non più disponibile
                  </button>
                )}
                {canCancelCall && (
                  <button
                    type="button"
                    onClick={onCancelCall}
                    className="rounded-xl border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:scale-[1.02]"
                  >
                    Annulla chiamata
                  </button>
                )}
              </div>
              {stato === "scheduled" && (
                <p className="mt-3 text-xs text-gray-600">
                  La chiamata è pianificata: puoi ancora annullarla o indicare che non sei più disponibile.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
