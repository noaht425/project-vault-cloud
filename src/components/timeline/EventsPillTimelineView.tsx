"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calendarFrontmatterSchema, type CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { toCanonicalMinutes, fromCanonicalMinutes, formatCalendarDate, computeMoonPhase } from "@/lib/calendarMath";
import {
  computeFullWindow,
  windowForZoom,
  panWindow,
  placeEventsInLanes,
  computeAxisTicks,
  expandAnnualRecurrence,
  MAX_ZOOM_LEVEL,
  type LanePlacement,
} from "@/lib/eventTimelinePlacement";
import type { EventStructuredDate } from "@/lib/noteTypes/event";

interface EventSummary {
  id: string;
  name: string;
  date: string;
  summary: string;
  noteType: string;
  structuredDate?: EventStructuredDate | null;
}

interface NoteSummary {
  id: string;
  name: string;
}

interface FullNote {
  id: string;
  frontmatter: Record<string, unknown>;
}

interface WorkspaceSettings {
  activeCalendarNoteTitles: string[];
  campaignDate: unknown;
}

interface PlacedEventData {
  event: EventSummary;
  minutes: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const LANE_HEIGHT = 30;
const BASE_CONNECTOR_HEIGHT = 8;
function estimatePillWidth(title: string): number {
  return Math.max(70, Math.min(220, title.length * 6.5 + 28));
}
const ZOOM_WHEEL_SENSITIVITY = 0.015;

// Adapted from the Electron app's CloudEventsPillTimelineView.tsx — same
// layout/logic, swapping window.cloudApi calls for this repo's REST API
// (/api/events, /api/notes?type=calendar + per-id frontmatter fetches,
// /api/workspace-settings), and CSS classes for Tailwind utilities. Touch
// drag-to-pan is new here — the Electron source only handles wheel events
// (trackpad two-finger swipe / pinch), which don't fire from a phone
// touchscreen, the primary surface for this app.
export function EventsPillTimelineView({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [calendars, setCalendars] = useState<{ title: string; frontmatter: CalendarFrontmatter }[] | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [center, setCenter] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [allEvents, calendarMatches, workspaceSettings] = await Promise.all([
          fetchJson<EventSummary[]>("/api/events"),
          fetchJson<NoteSummary[]>("/api/notes?type=calendar"),
          fetchJson<WorkspaceSettings>("/api/workspace-settings").catch(
            () => ({ activeCalendarNoteTitles: [], campaignDate: null }) as WorkspaceSettings
          ),
        ]);
        setEvents(allEvents);
        setSettings(workspaceSettings);
        const defs = await Promise.all(
          calendarMatches.map(async (m) => {
            const note = await fetchJson<FullNote>(`/api/notes/${m.id}`).catch(() => null);
            const parsed = note ? calendarFrontmatterSchema.safeParse(note.frontmatter) : null;
            return parsed?.success ? { title: m.name, frontmatter: parsed.data } : null;
          })
        );
        setCalendars(defs.filter((d): d is { title: string; frontmatter: CalendarFrontmatter } => d !== null));
      } catch (err) {
        console.error("Failed to load pill timeline data:", err);
        setError(err instanceof Error ? err.message : String(err));
        setEvents((prev) => prev ?? []);
        setCalendars((prev) => prev ?? []);
      }
    };
    void load();
  }, []);

  const calendarByTitle = useMemo(() => new Map((calendars ?? []).map((c) => [c.title, c.frontmatter])), [calendars]);

  const anchorItems = useMemo<PlacedEventData[]>(() => {
    if (!events) return [];
    const items: PlacedEventData[] = [];
    for (const event of events) {
      if (event.noteType !== "event" || !event.structuredDate) continue;
      const calendar = calendarByTitle.get(event.structuredDate.calendarNoteTitle);
      if (!calendar) continue;
      const minutes = toCanonicalMinutes(calendar, event.structuredDate);
      if (minutes !== null) items.push({ event, minutes });
    }
    return items;
  }, [events, calendarByTitle]);

  const fullWindow = useMemo(() => computeFullWindow(anchorItems.map((i) => i.minutes)), [anchorItems]);

  const placedItems = useMemo<PlacedEventData[]>(() => {
    const items: PlacedEventData[] = [];
    for (const item of anchorItems) {
      if (!item.event.structuredDate?.annualRecurrence) {
        items.push(item);
        continue;
      }
      const calendar = calendarByTitle.get(item.event.structuredDate.calendarNoteTitle);
      if (!calendar) continue;
      for (const minutes of expandAnnualRecurrence(calendar, item.event.structuredDate, fullWindow)) {
        items.push({ event: item.event, minutes });
      }
    }
    return items;
  }, [anchorItems, calendarByTitle, fullWindow]);
  const effectiveCenter = center ?? (fullWindow.start + fullWindow.end) / 2;
  const currentWindow = useMemo(
    () => windowForZoom(fullWindow, zoomLevel, effectiveCenter),
    [fullWindow, zoomLevel, effectiveCenter]
  );

  const activeCalendars = (settings?.activeCalendarNoteTitles ?? [])
    .map((title) => calendarByTitle.get(title))
    .filter((c): c is CalendarFrontmatter => c !== undefined);
  const tickCalendar = activeCalendars[0] ?? null;

  const placements = useMemo<LanePlacement<EventSummary>[]>(
    () =>
      placeEventsInLanes(
        placedItems.map((i) => ({ minutes: i.minutes, data: i.event, widthPx: estimatePillWidth(i.event.name) })),
        currentWindow,
        containerWidth
      ),
    [placedItems, currentWindow, containerWidth]
  );

  // Not wrapped in useMemo — cheap to recompute, and neither activeCalendars
  // nor tickCalendar just above are memoized either.
  const ticks = computeAxisTicks(tickCalendar, currentWindow);

  const formatDate = (event: EventSummary, minutes: number): string => {
    if (activeCalendars.length === 0) return event.date || "Undated";
    const labels = activeCalendars
      .map((cal) => {
        const parts = fromCanonicalMinutes(cal, minutes);
        return parts ? formatCalendarDate(cal, parts) : null;
      })
      .filter((label): label is string => label !== null);
    return labels.length > 0 ? labels.join(" / ") : event.date || "Undated";
  };

  const formatMoonPhases = (minutes: number): string | null => {
    const labels = activeCalendars.flatMap((cal) =>
      cal.moons.map((moon) => {
        const phase = computeMoonPhase(cal, moon, minutes);
        return `${phase.emoji} ${moon.name}: ${phase.name}`;
      })
    );
    return labels.length > 0 ? labels.join(" · ") : null;
  };

  const toggleActiveCalendar = (title: string, active: boolean) => {
    const current = settings?.activeCalendarNoteTitles ?? [];
    const next = active ? [...current, title] : current.filter((t) => t !== title);
    fetch("/api/workspace-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeCalendarNoteTitles: next }),
    })
      .then((res) => res.json())
      .then(setSettings)
      .catch((err) => console.error("Failed to update active calendars:", err));
  };

  const zoomIn = (atCenter: number) => {
    setCenter(atCenter);
    setZoomLevel((z) => Math.min(MAX_ZOOM_LEVEL, z + 1));
  };
  const zoomOut = () => setZoomLevel((z) => Math.max(0, z - 1));
  const pan = (fraction: number) => {
    const panned = panWindow(currentWindow, fraction);
    setCenter((panned.start + panned.end) / 2);
  };

  const liveRef = useRef({ currentWindow, effectiveCenter, containerWidth });
  useEffect(() => {
    liveRef.current = { currentWindow, effectiveCenter, containerWidth };
  }, [currentWindow, effectiveCenter, containerWidth]);

  useEffect(() => {
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { currentWindow: win, effectiveCenter: c, containerWidth: width } = liveRef.current;
      if (e.ctrlKey) {
        setCenter(c);
        setZoomLevel((z) => Math.min(MAX_ZOOM_LEVEL, Math.max(0, z - e.deltaY * ZOOM_WHEEL_SENSITIVITY)));
      } else {
        const pixelDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        if (width <= 0) return;
        const span = win.end - win.start;
        setCenter(c + (pixelDelta / width) * span);
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [container]);

  // Single-finger drag pans the track — the touch equivalent of the wheel
  // handler above, reusing the same pan() math. Not in the Electron source
  // (see this file's top comment); a `touchStartX` ref (not state) avoids
  // triggering a re-render on every touchmove.
  const touchStartX = useRef<number | null>(null);
  useEffect(() => {
    if (!container) return;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || e.touches.length !== 1) return;
      e.preventDefault();
      const x = e.touches[0].clientX;
      const deltaX = touchStartX.current - x;
      touchStartX.current = x;
      const { currentWindow: win, effectiveCenter: c, containerWidth: width } = liveRef.current;
      if (width <= 0) return;
      const span = win.end - win.start;
      setCenter(c + (deltaX / width) * span);
    };
    const handleTouchEnd = () => {
      touchStartX.current = null;
    };
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [container]);

  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const formatWindowEdge = (minutes: number): string | null => {
    if (activeCalendars.length === 0) return null;
    const cal = activeCalendars[0];
    const parts = fromCanonicalMinutes(cal, minutes);
    return parts ? formatCalendarDate(cal, parts) : null;
  };

  if (error) {
    return <p className="p-6 text-center text-danger text-sm">{error}</p>;
  }

  if (events === null || calendars === null) {
    return <p className="p-6 text-center text-muted text-sm">Loading…</p>;
  }

  if (placedItems.length === 0) {
    return (
      <p className="p-6 text-center text-muted text-sm">
        No events with a structured date yet — set one in an Event note&apos;s desktop calendar picker, or wait for
        the automatic migration to match one against a calendar note.
      </p>
    );
  }

  const maxLane = placements.reduce((max, p) => Math.max(max, p.lane), 0);
  const trackHeight = LANE_HEIGHT * (maxLane + 1) + BASE_CONNECTOR_HEIGHT + 24;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {calendars.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="text-sm text-muted">Show dates in:</span>
          {calendars.map((c) => (
            <label key={c.title} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={(settings?.activeCalendarNoteTitles ?? []).includes(c.title)}
                onChange={(e) => toggleActiveCalendar(c.title, e.target.checked)}
              />
              {c.title}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-2">
        <button className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover" onClick={() => pan(-0.4)}>
          ← Pan
        </button>
        <button className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover" onClick={() => pan(0.4)}>
          Pan →
        </button>
        <button
          className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-40"
          onClick={zoomOut}
          disabled={zoomLevel === 0}
        >
          Zoom out
        </button>
        <button
          className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-40"
          onClick={() => zoomIn(effectiveCenter)}
          disabled={zoomLevel === MAX_ZOOM_LEVEL}
        >
          Zoom in
        </button>
        {zoomLevel > 0 && (
          <button
            className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover"
            onClick={() => {
              setZoomLevel(0);
              setCenter(null);
            }}
          >
            Reset zoom
          </button>
        )}
      </div>

      <p className="text-sm text-muted mb-6">
        {activeCalendars.length === 0
          ? "Check a calendar above to see dates here — otherwise this shows only bare pill titles."
          : `Viewing: ${formatWindowEdge(currentWindow.start)} → ${formatWindowEdge(currentWindow.end)}`}
        {" — drag (or scroll/two-finger-swipe) to pan, pinch (or Ctrl+scroll) to zoom."}
      </p>

      <div
        className="relative border-b-2 border-border mt-6 cursor-grab touch-none"
        ref={setContainer}
        style={{ height: trackHeight }}
      >
        {placements.map((p, i) => (
          <div
            key={`connector-${i}`}
            className="absolute bottom-0 -translate-x-1/2 w-px bg-border"
            style={{ left: `${p.positionFraction * 100}%`, height: p.lane * LANE_HEIGHT + BASE_CONNECTOR_HEIGHT }}
          />
        ))}
        {placements.map((p, i) => (
          <div
            key={`pill-${i}`}
            className="absolute -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${p.positionFraction * 100}%`, bottom: p.lane * LANE_HEIGHT + BASE_CONNECTOR_HEIGHT }}
          >
            <button
              className="bg-panel border border-border rounded-full px-2.5 py-1 text-xs whitespace-nowrap hover:bg-hover"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
            >
              {p.event.structuredDate?.annualRecurrence && <span title="Recurs annually">↻ </span>}
              {p.event.name}
            </button>
            {expandedIndex === i && (
              <div className="absolute bottom-full mb-1 z-10 bg-panel border border-border rounded-lg px-3.5 py-2.5 min-w-[220px] max-w-[320px] shadow-lg">
                <div className="text-xs text-muted">
                  {formatDate(p.event, p.minutes)}
                  {p.event.structuredDate?.annualRecurrence && " (recurs annually)"}
                </div>
                <div className="font-medium mt-0.5">{p.event.name}</div>
                {formatMoonPhases(p.minutes) && <div className="text-xs text-muted mt-1">{formatMoonPhases(p.minutes)}</div>}
                {p.event.summary && <div className="text-xs mt-1">{p.event.summary}</div>}
                <button
                  className="text-xs text-accent underline bg-transparent border-0 p-0 mt-1.5 cursor-pointer"
                  onClick={() => onOpenEvent(p.event.id)}
                >
                  Open note ↗
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="relative h-7">
        {ticks.map((t, i) => (
          <div key={i} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${t.positionFraction * 100}%` }}>
            <div className="w-px h-1.5 bg-border" />
            <div className="text-[10px] text-muted mt-0.5 whitespace-nowrap">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
