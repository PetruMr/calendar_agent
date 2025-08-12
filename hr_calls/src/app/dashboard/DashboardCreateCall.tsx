"use client";

import { useMemo, useState } from "react";


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


// Tipi e cose utili in generale per le chiamate
export type CallType = "screening" | "validazione" | "finale";
export type CallDuration = 30 | 45 | 60;

export type Participant = {
  nome: string;
  email: string;
};

// Payload per la creazione di una call, come nelle specifiche con:
// - titolo: titolo della call, obbligatorio
// - partecipanti: array di oggetti con NOME ed EMAIL di ogni partecipante (si esclude l'utente che crea la call, che verrà anch'esso incluso)
// - tipo: uno dei tipi definiti sopra
// - durataMinuti: uno dei valori definiti sopra, ovvero 30, 45 o 60
// - deadline: entro quando la call deve avvenire
// - note: opzionale, note da aggiungere alla call
export type CreateCallPayload = {
  titolo: string; // titolo della call, obbligatorio
  partecipanti: Array<{ nome: string; email: string }>;
  tipo: CallType;
  durataMinuti: CallDuration;
  deadline: string; // ISO string
  note?: string; // campo opzionale
};


// Semplice validazione email (non perfetta, ma sufficiente)
function isEmail(v: string) {
  return /\S+@\S+\.\S+/.test(v);
}


// Converte input type="datetime-local" in ISO (UTC)
function toISOFromLocal(dtLocal: string) {
  if (!dtLocal) return "";
  const [date, time] = dtLocal.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0 as any, mm = 0 as any] = (time ?? "0:0").split(":").map(Number);
  const local = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return local.toISOString();
}


// Componente per la creazione 
export default function DashboardCreateCall(
  userData?: {
    _id?: string | null;
    username?: string | null;
    nome?: string | null;
    email?: string | null;
    tipo?: string | null;
    googleCalendarLinked?: boolean | null; // true, false o null (problema di rete)
} | null) {
  // Stato form
  const [partecipanti, setPartecipanti] = useState<Participant[]>([{ nome: "", email: "" }]);
  const [tipo, setTipo] = useState<CallType>("screening");
  const [durata, setDurata] = useState<CallDuration>(30);
  // Impostata la deadline in automatico a tra 5 giorni alle 20
  const [deadlineLocal, setDeadlineLocal] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    d.setHours(20, 0, 0, 0); // Imposta alle 8:00
    return d.toISOString().slice(0, 16); // Ritorna in formato YYYY-MM-DDTHH:mm
  });
  const [note, setNote] = useState<string>("");
  const [titolo, setTitolo] = useState<string>("");

  // Stato UI
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Per mostrare il fuso orario del dispositivo
  const timezoneName = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  // Gestione partecipanti, in modo da poter aggiungere/rimuovere partecipanti dinamicamente
  // Inizialmente c'è un solo partecipante vuoto
  const addPartecipante = () => {
    setPartecipanti((prev) => [...prev, { nome: "", email: "" }]);
  };

  const removePartecipante = (idxToRemove: number) => {
    setPartecipanti((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== idxToRemove) : prev));
  };

  const updatePartecipante = (idxToUpdate: number, patch: Partial<Participant>) => {
    setPartecipanti((prev) => prev.map((p, idx) => (idx === idxToUpdate ? { ...p, ...patch } : p)));
  };

  // Validazione
  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!partecipanti.length) e["partecipanti"] = "Aggiungi almeno un partecipante.";
    console.log("Sono qui!");

    // Regole base su ogni partecipante
    partecipanti.forEach((p, idx) => {
      if (!p.nome.trim()) e[`partecipanti.${idx}.nome`] = "Il nome è obbligatorio.";
      if (!p.email.trim()) e[`partecipanti.${idx}.email`] = "L'email è obbligatoria.";
      else if (!isEmail(p.email)) e[`partecipanti.${idx}.email`] = "Formato email non valido.";
      if (p.email === userData?.email) {
        e[`partecipanti.${idx}.email`] = "Non puoi aggiungere te stesso come partecipante.";
      }
    });

    // Controllo email duplicate (case-insensitive, spazi ignorati)
    const normalizedEmails = partecipanti.map((p) => p.email.trim().toLowerCase());
    const counts = normalizedEmails.reduce((acc, email) => {
      if (email) acc[email] = (acc[email] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    normalizedEmails.forEach((email, idx) => {
      if (email && counts[email] > 1) {
        e[`partecipanti.${idx}.email`] = "Email duplicata: già inserita.";
      }
    });

    // Regole su deadline
    if (!deadlineLocal) e["deadline"] = "Imposta una deadline.";
    else {
      const deadline = new Date(toISOFromLocal(deadlineLocal));
      const now = new Date();
      if (isNaN(deadline.getTime())) e["deadline"] = "Deadline non valida.";
      else if (deadline <= now) e["deadline"] = "La deadline deve essere futura.";
      // Controlla che sia entro 14 giorni
      else if (deadline > new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)) {
        e["deadline"] = "La deadline non può superare i 14 giorni da ora.";
      }
    }


    // Regole su tipo e durata, che devono appartenere a dei set predefiniti
    if (!([30, 45, 60] as number[]).includes(durata)) e["durata"] = "Durata non valida.";
    if (!(["screening", "validazione", "finale"] as string[]).includes(tipo)) e["tipo"] = "Tipo di call non valido.";

    // Controllo titolo non vuoto
    if (!titolo.trim()) e["titolo"] = "Il titolo della call è obbligatorio.";

    // Se il titolo è più lungo di 100 caratteri, imposta un errore
    if (titolo.length > 100) {
      e["titolo"] = "Il titolo non può superare i 100 caratteri.";
    }

    // Se ci sono errori, aggiorna lo stato e ritorna false
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Invio dei dati per creare una nuova call
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!validate()) return;

    const payload: CreateCallPayload = {
      titolo: titolo.trim(),
      partecipanti: partecipanti.map((p) => ({ nome: p.nome.trim(), email: p.email.trim() })),
      tipo,
      durataMinuti: durata,
      deadline: toISOFromLocal(deadlineLocal),
      note: note.trim() || "", // se note è vuoto, non lo includiamo nel payload
    };

    setSubmitting(true);
    try {
      // Invio dei dati a 
      // POST /api/calls/create
      // Con il payload come body JSON
      const res = await fetch("/api/calls/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
      });
        if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error(j?.error || `Errore durante la creazione della call. (${res.status})`);
        } else {
            setMessage("Call creata con successo.");
            // Resetta il form dopo il successo
            setPartecipanti([{ nome: "", email: "" }]);
            setTipo("screening");
            setDurata(30);
            setDeadlineLocal(() => {
                const d = new Date();
                d.setDate(d.getDate() + 5);
                d.setHours(20, 0, 0, 0); // Imposta alle 8:00
                return d.toISOString().slice(0, 16); // Ritorna in formato YYYY-MM-DDTHH:mm
            });
            setNote("");
            setErrors({});
            setTitolo("");
        }
    } catch (err: any) {
      setMessage(err?.message || "Errore imprevisto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      title="Crea una nuova call"
      right={<span className="text-xs text-gray-500">Fuso orario dispositivo: {timezoneName}</span>}
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Titolo della call */}
        <div>
          <label className="mb-1 block text-xs text-gray-500">Titolo della call</label>
            <input
                type="text"
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Es. Colloquio con Mario Rossi"
                value={titolo}
                maxLength={100}
                onChange={(e) => setTitolo(e.target.value)}
            />
            {errors["titolo"] && <p className="mt-1 text-xs text-red-600">{errors["titolo"]}</p>}
        </div>


        {/* Partecipanti */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Partecipanti</h3>
            <button
              type="button"
              onClick={addPartecipante}
              className="rounded-xl border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:scale-[1.02]"
            >
              Aggiungi partecipante
            </button>
          </div>

          <div className="space-y-3">
            {partecipanti.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border bg-white/60 p-3 md:grid-cols-12 md:gap-3">
                <div className="md:col-span-4">
                  <label className="mb-1 block text-xs text-gray-500">Nome</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Es. Mario Rossi"
                    value={p.nome}
                    onChange={(e) => updatePartecipante(idx, { nome: e.target.value })}
                  />
                  {errors[`partecipanti.${idx}.nome`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`partecipanti.${idx}.nome`]}</p>
                  )}
                </div>
                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs text-gray-500">Email</label>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="nome@azienda.com"
                    value={p.email}
                    onChange={(e) => updatePartecipante(idx, { email: e.target.value })}
                  />
                  {errors[`partecipanti.${idx}.email`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`partecipanti.${idx}.email`]}</p>
                  )}
                </div>
                <div className="flex items-end justify-end md:col-span-2">
                  <button
                    type="button"
                    onClick={() => removePartecipante(idx)}
                    className="h-9 rounded-lg border px-3 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 overflow-hidden"
                    disabled={partecipanti.length === 1}
                    title={partecipanti.length === 1 ? "Almeno un partecipante è richiesto" : "Rimuovi"}
                  >
                    Rimuovi
                  </button>
                </div>
              </div>
            ))}
          </div>

          {errors["partecipanti"] && (
            <p className="text-xs text-red-600">{errors["partecipanti"]}</p>
          )}
        </section>

        {/* Tipo call, durata, deadline */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Tipo di call</label>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CallType)}
            >
              <option value="screening">Screening</option>
              <option value="validazione">Validazione</option>
              <option value="finale">Finale</option>
            </select>
            {errors["tipo"] && <p className="mt-1 text-xs text-red-600">{errors["tipo"]}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Durata preferita</label>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              value={durata}
              onChange={(e) => setDurata(Number(e.target.value) as CallDuration)}
            >
              <option value={30}>30 minuti</option>
              <option value={45}>45 minuti</option>
              <option value={60}>60 minuti</option>
            </select>
            {errors["durata"] && <p className="mt-1 text-xs text-red-600">{errors["durata"]}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-gray-500">Deadline call</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
            />
            {errors["deadline"] && <p className="mt-1 text-xs text-red-600">{errors["deadline"]}</p>}
          </div>
        </section>

        {/* Note opzionali da aggiungere alla creazione della call, verranno scritte nella mail e nei dettagli */}
        <section>
            <label className="mb-1 block text-xs text-gray-500">Note</label>
            <textarea
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Inserisci eventuali note..."
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
            />
        </section>

        {/* Pulsanti per reset ed invio */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTitolo("");
              setNote("");  
              setPartecipanti([{ nome: "", email: "" }]);
              setTipo("screening");
              setDurata(30);
              setDeadlineLocal(() => {
                const d = new Date();
                d.setDate(d.getDate() + 5);
                d.setHours(20, 0, 0, 0); // Imposta alle 8:00
                return d.toISOString().slice(0, 16); // Ritorna in formato YYYY-MM-DDTHH:mm
              });
              setErrors({});
              setMessage(null);
            }}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:scale-[1.02] disabled:opacity-50"
          >
            {submitting ? "Invio in corso…" : "Crea"}
          </button>
        </div>
      </form>

      {message && (
        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-gray-800">{message}</p>
          <p className="mt-1 text-xs text-gray-500">Se la creazione è andata a buon fine, riceverai una mail con i prossimi passaggi.</p>
        </div>
      )}
    </Card>
  );
}