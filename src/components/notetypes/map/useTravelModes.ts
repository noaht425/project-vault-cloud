"use client";

import { useEffect, useState } from "react";
import { travelModesFrontmatterSchema, defaultTravelModesFrontmatter, type TravelMode } from "@/lib/noteTypes/travelModes";

interface NoteSummary {
  id: string;
  name: string;
}
interface FullNote {
  id: string;
  version: number;
  frontmatter: Record<string, unknown>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const TRAVEL_MODES_NOTE_NAME = "Travel Modes";

// Travel-mode presets are global (setting-wide, not per-map) — same "the
// one note of this type in the workspace, found-or-created" approach as
// Electron's travelModesStore.ts, but loaded once here and passed down as
// props to MapTripCalculator/MapTimeline/MapForm's own crossing-time
// preview, instead of a shared Zustand store. That sidesteps the exact race
// Electron's store had to work around (three components each mounting
// their own find-or-create effect and racing to create duplicate notes) —
// by construction, since only this one hook instance ever runs.
export function useTravelModes() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [modes, setModes] = useState<TravelMode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(TRAVEL_MODES_NOTE_NAME)}&type=travel-modes`);
        const existing = matches.find((m) => m.name === TRAVEL_MODES_NOTE_NAME);
        if (existing) {
          const note = await fetchJson<FullNote>(`/api/notes/${existing.id}`);
          if (cancelled) return;
          const parsed = travelModesFrontmatterSchema.parse(note.frontmatter);
          setNoteId(note.id);
          setVersion(note.version);
          setModes(parsed.modes);
        } else {
          const frontmatter = defaultTravelModesFrontmatter();
          const created = await fetchJson<FullNote>("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: TRAVEL_MODES_NOTE_NAME, folderId: null, frontmatter }),
          });
          if (cancelled) return;
          setNoteId(created.id);
          setVersion(created.version);
          setModes(frontmatter.modes);
        }
      } catch {
        // Leave modes empty — every consumer already renders a sensible
        // "add a travel mode" empty state for that case.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One retry against whatever version actually landed on a 409 — this is a
  // personal, low-stakes preset list, not worth a full conflict-banner UI,
  // same tradeoff Electron's store makes.
  const save = async (nextModes: TravelMode[]): Promise<void> => {
    if (!noteId) return;
    const previousModes = modes;
    setModes(nextModes);
    const frontmatter = { type: "travel-modes", tags: [], modes: nextModes };
    const attempt = async (atVersion: number) => {
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: atVersion, frontmatter }),
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
      } catch {
        return { ok: false, status: 0, data: null };
      }
    };

    const result = await attempt(version);
    if (result.ok) {
      setVersion(result.data.version);
      return;
    }
    if (result.status === 409) {
      const retry = await attempt(result.data.current.version);
      if (retry.ok) {
        setVersion(retry.data.version);
        return;
      }
    }
    // Both the initial attempt and any 409 retry failed (network drop, 5xx,
    // etc.) — revert the optimistic update rather than leaving local state
    // silently diverged from what's actually saved.
    console.error("Failed to save travel modes");
    setModes(previousModes);
  };

  return { modes, loading, save };
}
