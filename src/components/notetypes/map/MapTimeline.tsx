"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateTrip } from "@/lib/mapGeometry";
import { matchEventsToPins, countUnplacedEvents, type EventSummary } from "@/lib/mapTimeline";
import { pinDisplayLabel, type LineType, type MapLandmass, type MapLine, type MapPin, type MapScale, type MapZone, type TerrainType } from "@/lib/noteTypes/map";
import type { TravelMode } from "@/lib/noteTypes/travelModes";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { SelectField } from "@/components/ui/SelectField";

interface NoteSummary {
  id: string;
  name: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

function pluralEvents(n: number): string {
  return `${n} event${n === 1 ? "" : "s"}`;
}

// Adapted from the Electron app's MapTimeline.tsx — steps chronologically
// through this map's location-tagged events, revealing one at a time (an
// index-based slider) and ringing each pin on the map. Uses this repo's own
// /api/events instead of window.vaultApi.listEvents — the Electron
// original hard-codes the LOCAL-vault event listing API even inside its own
// Cloud Workspace mode, a pre-existing gap in Electron itself (Map Timeline
// silently doesn't work there), not something replicated here.
export function MapTimeline({
  pins,
  zones,
  lines,
  terrainTypes,
  lineTypes,
  landmasses,
  waterTerrainTypeId,
  scale,
  modes,
  onHighlightChange,
}: {
  pins: MapPin[];
  zones: MapZone[];
  lines: MapLine[];
  terrainTypes: TerrainType[];
  lineTypes: LineType[];
  landmasses: MapLandmass[];
  waterTerrainTypeId: string | null;
  scale: MapScale | null;
  modes: TravelMode[];
  onHighlightChange: (ids: Set<string>) => void;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [modeId, setModeId] = useState("");
  const travelMode = modes.find((m) => m.id === modeId) ?? modes[0];

  useEffect(() => {
    fetchJson<EventSummary[]>("/api/events")
      .then(setEvents)
      .catch((err) => {
        console.error("Failed to load events for map timeline:", err);
        setEvents([]);
      });
  }, []);

  const matched = useMemo(() => matchEventsToPins(events ?? [], pins), [events, pins]);
  const unplacedCount = useMemo(() => countUnplacedEvents(events ?? [], pins), [events, pins]);

  const [prevMatchedLength, setPrevMatchedLength] = useState(matched.length);
  if (matched.length !== prevMatchedLength) {
    setPrevMatchedLength(matched.length);
    if (revealedCount > matched.length) setRevealedCount(matched.length);
  }

  useEffect(() => {
    onHighlightChange(new Set(matched.slice(0, revealedCount).map((m) => m.pin.id)));
    return () => onHighlightChange(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, revealedCount]);

  const openEvent = async (name: string) => {
    const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(name)}`).catch(() => []);
    const id = resolveWikiLinkTitle(matches, name);
    if (id) router.push(`/notes/${id}`);
  };

  if (events === null) return <p className="text-sm text-muted">Loading events…</p>;

  if (matched.length === 0) {
    return (
      <p className="text-sm text-muted">
        No events with a location placed on this map yet — set an Event note&apos;s Location field to a place pinned here.
        {unplacedCount > 0 && ` (${pluralEvents(unplacedCount)} elsewhere, not on this map.)`}
      </p>
    );
  }

  const revealed = matched.slice(0, revealedCount);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
          <span className="text-sm text-muted">Reveal up to</span>
          <input type="range" min={0} max={matched.length} value={revealedCount} onChange={(e) => setRevealedCount(Number(e.target.value))} />
        </label>
        {modes.length > 0 && (
          <SelectField label="Travel mode" className="w-36" value={travelMode?.id ?? ""} onChange={(e) => setModeId(e.target.value)}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <p className="text-sm text-muted">
        {revealedCount} of {matched.length} events revealed
        {unplacedCount > 0 && ` · ${pluralEvents(unplacedCount)} elsewhere, not on this map`}
      </p>

      {revealed.length === 0 ? (
        <p className="text-sm text-muted">Drag the slider to start revealing events chronologically.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {revealed.map((entry, i) => {
            const prev = i > 0 ? revealed[i - 1] : null;
            const trip =
              prev && scale && travelMode && prev.pin.id !== entry.pin.id
                ? calculateTrip([prev.pin, entry.pin], zones, lines, terrainTypes, lineTypes, landmasses, waterTerrainTypeId, scale, travelMode, travelMode)
                : null;
            return (
              <div key={`${entry.event.id}-${i}`}>
                {trip && (
                  <div className="text-sm text-muted pl-1">
                    ↓ {trip.totalTime === Infinity ? "no route (impassable terrain)" : `${trip.totalRealDistance.toFixed(1)} ${scale!.unit}, ${trip.totalTime.toFixed(1)} ${travelMode!.timeUnitLabel}`}
                  </div>
                )}
                <button className="text-left w-full bg-transparent border-0 cursor-pointer p-0" onClick={() => void openEvent(entry.event.name)}>
                  <strong>{entry.event.date || "Undated"}</strong> — {entry.event.name}
                  <span className="text-sm text-muted"> at {pinDisplayLabel(entry.pin)}</span>
                  {entry.event.summary && <div className="text-sm text-muted">{entry.event.summary}</div>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
