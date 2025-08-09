// /app/events/page.tsx
// Questo è stato un esempio di 


"use client";
import { useEffect, useState } from "react";

type EventItem = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h2>Upcoming events</h2>
      {events === null ? (
        <p>Loading...</p>
      ) : !events.length ? (
        <p>No events or not authorized yet.</p>
      ) : (
        <ul style={{ padding: 0, listStyle: "none", marginTop: 16 }}>
          {events.map((e) => {
            const start = e.start?.dateTime ?? e.start?.date ?? "—";
            const end = e.end?.dateTime ?? e.end?.date ?? "—";
            return (
              <li key={e.id} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{e.summary ?? "(no title)"}</div>
                <div style={{ fontSize: 12 }}>{start} → {end}</div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
