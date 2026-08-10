"use client";

import { useEffect, useState } from "react";

interface EventEntry {
  id: string;
  name: string;
  date: string;
  summary: string;
  noteType: string;
}

// Adapted from the Electron app's EventsTimelineView.tsx — the "List" tab
// of EventsSection.tsx. Extracted out of events/page.tsx so that file can
// become a tab switcher alongside EventsPillTimelineView/MonthGridView.
export function EventsListView({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const [events, setEvents] = useState<EventEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Failed to load events (${res.status})`);
        }
        return res.json();
      })
      .then(setEvents)
      .catch((err) => {
        console.error("Failed to load events:", err);
        setError(err instanceof Error ? err.message : String(err));
        setEvents([]);
      });
  }, []);

  return (
    <div className="flex-1 overflow-y-auto md:max-w-3xl md:mx-auto md:w-full">
      {error && <p className="p-6 text-center text-danger text-sm">{error}</p>}
      {events === null && !error ? (
        <p className="p-6 text-center text-muted text-sm">Loading…</p>
      ) : events?.length === 0 && !error ? (
        <p className="p-6 text-center text-muted text-sm">
          No world-history events yet — create one with New → Event, or add a &quot;## History&quot; section (or
          Born:/Died: lines) to any note.
        </p>
      ) : (
        events?.map((e, i) => (
          <button
            key={`${e.id}-${i}`}
            className="w-full text-left flex flex-col gap-1 px-4 py-3 border-b border-border cursor-pointer hover:bg-hover bg-transparent border-0"
            onClick={() => onOpenEvent(e.id)}
          >
            <span className="text-sm text-muted">{e.date || "Undated"}</span>
            <span className="font-medium">
              {e.name}
              {e.noteType !== "event" && <span className="text-muted"> · {e.noteType}</span>}
            </span>
            {e.summary && <span className="text-sm text-muted truncate">{e.summary}</span>}
          </button>
        ))
      )}
    </div>
  );
}
