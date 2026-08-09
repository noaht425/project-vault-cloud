"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { z } from "zod";
import { calendarFrontmatterSchema, type CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { climateFrontmatterSchema, type ClimateFrontmatter } from "@/lib/noteTypes/climate";
import { toCanonicalMinutes, fromCanonicalMinutes, formatCalendarDate, computeMoonPhase } from "@/lib/calendarMath";
import { computeWeatherForDate } from "@/lib/weatherGeneration";
import { computeFullWindow, expandAnnualRecurrence } from "@/lib/eventTimelinePlacement";
import { buildMonthGrid, stepMonth, monthRefForMinutes, bucketByDay, type MonthRef, type MonthGrid } from "@/lib/monthGrid";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
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

interface CampaignDate {
  calendarNoteTitle: string;
  eraId: string;
  year: number;
  monthId: string;
  day: number;
}

interface WorkspaceSettings {
  activeCalendarNoteTitles: string[];
  campaignDate: CampaignDate | null;
}

// A minimal shape for reading just `climateNoteTitle` off a location or
// settlement note — same as the Electron app's EventSheet.tsx local schema.
const placeClimateRefSchema = z.object({ climateNoteTitle: z.string().nullable().catch(null) }).passthrough();

interface ClimateRosterEntry {
  placeTitle: string;
  climate: ClimateFrontmatter;
}

const MAX_EVENT_CHIPS_PER_DAY = 3;
const UPCOMING_COUNT = 5;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

async function resolveClimate(climateTitle: string): Promise<ClimateFrontmatter | null> {
  const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(climateTitle)}&type=climate`).catch(() => []);
  const id = resolveWikiLinkTitle(matches, climateTitle);
  if (!id) return null;
  const note = await fetchJson<FullNote>(`/api/notes/${id}`).catch(() => null);
  const parsed = note ? climateFrontmatterSchema.safeParse(note.frontmatter) : null;
  return parsed?.success ? parsed.data : null;
}

function resolveInitialMonthRef(
  calendar: CalendarFrontmatter,
  calendarTitle: string,
  settings: WorkspaceSettings,
  events: EventSummary[]
): MonthRef {
  if (settings.campaignDate?.calendarNoteTitle === calendarTitle) {
    const minutes = toCanonicalMinutes(calendar, { ...settings.campaignDate, hour: 0, minute: 0 });
    const ref = minutes !== null ? monthRefForMinutes(calendar, minutes) : null;
    if (ref) return ref;
  }
  const latestMinutes = events
    .filter((e) => e.noteType === "event" && e.structuredDate?.calendarNoteTitle === calendarTitle)
    .map((e) => toCanonicalMinutes(calendar, e.structuredDate!))
    .filter((m): m is number => m !== null)
    .sort((a, b) => b - a)[0];
  if (latestMinutes !== undefined) {
    const ref = monthRefForMinutes(calendar, latestMinutes);
    if (ref) return ref;
  }
  return { eraId: calendar.eras[0]?.id ?? "", year: 1, monthId: calendar.months[0]?.id ?? "" };
}

// Adapted from the Electron app's CloudMonthGridView.tsx — same layout/
// logic, swapping window.cloudApi calls for this repo's REST API and CSS
// classes for Tailwind utilities.
export function MonthGridView({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [calendars, setCalendars] = useState<{ title: string; frontmatter: CalendarFrontmatter }[] | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [climateRoster, setClimateRoster] = useState<ClimateRosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCalendarTitle, setSelectedCalendarTitle] = useState<string | null>(null);
  const [monthRef, setMonthRef] = useState<MonthRef | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [allEvents, calendarMatches, workspaceSettings, locationMatches, settlementMatches] = await Promise.all([
          fetchJson<EventSummary[]>("/api/events"),
          fetchJson<NoteSummary[]>("/api/notes?type=calendar"),
          fetchJson<WorkspaceSettings>("/api/workspace-settings").catch(
            () => ({ activeCalendarNoteTitles: [], campaignDate: null }) as WorkspaceSettings
          ),
          fetchJson<NoteSummary[]>("/api/notes?type=location"),
          fetchJson<NoteSummary[]>("/api/notes?type=settlement"),
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

        const roster = await Promise.all(
          [...locationMatches, ...settlementMatches].map(async (m): Promise<ClimateRosterEntry | null> => {
            const placeNote = await fetchJson<FullNote>(`/api/notes/${m.id}`).catch(() => null);
            const climateTitle = placeNote ? placeClimateRefSchema.parse(placeNote.frontmatter).climateNoteTitle : null;
            if (!climateTitle) return null;
            const climate = await resolveClimate(climateTitle);
            return climate ? { placeTitle: m.name, climate } : null;
          })
        );
        setClimateRoster(roster.filter((r): r is ClimateRosterEntry => r !== null));
      } catch (err) {
        console.error("Failed to load month-grid data:", err);
        setError(err instanceof Error ? err.message : String(err));
        setEvents((prev) => prev ?? []);
        setCalendars((prev) => prev ?? []);
        setClimateRoster((prev) => prev ?? []);
      }
    };
    void load();
  }, []);

  const calendarByTitle = useMemo(() => new Map((calendars ?? []).map((c) => [c.title, c.frontmatter])), [calendars]);
  const selectedCalendar = selectedCalendarTitle ? (calendarByTitle.get(selectedCalendarTitle) ?? null) : null;

  useEffect(() => {
    if (initialized.current || !events || !calendars || !settings || calendars.length === 0) return;
    initialized.current = true;
    const initialTitle =
      (settings.campaignDate && calendarByTitle.has(settings.campaignDate.calendarNoteTitle)
        ? settings.campaignDate.calendarNoteTitle
        : null) ??
      settings.activeCalendarNoteTitles.find((t) => calendarByTitle.has(t)) ??
      calendars[0].title;
    setSelectedCalendarTitle(initialTitle);
    const cal = calendarByTitle.get(initialTitle)!;
    setMonthRef(resolveInitialMonthRef(cal, initialTitle, settings, events));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, calendars, settings]);

  const changeCalendar = (title: string) => {
    setSelectedCalendarTitle(title);
    setSelectedDay(null);
    const cal = calendarByTitle.get(title);
    if (cal && settings && events) setMonthRef(resolveInitialMonthRef(cal, title, settings, events));
  };

  const grid: MonthGrid | null = useMemo(
    () => (selectedCalendar && monthRef ? buildMonthGrid(selectedCalendar, monthRef) : null),
    [selectedCalendar, monthRef]
  );

  const dayBuckets = useMemo(() => {
    if (!grid || !selectedCalendar || !events) return new Map<number, EventSummary[]>();
    const window = { start: grid.firstStartMinutes, end: grid.firstStartMinutes + grid.daysInMonth * grid.minutesPerDay };
    const items: { minutes: number; data: EventSummary }[] = [];
    for (const event of events) {
      if (event.noteType !== "event" || !event.structuredDate) continue;
      if (event.structuredDate.calendarNoteTitle !== selectedCalendarTitle) continue;
      if (event.structuredDate.annualRecurrence) {
        for (const minutes of expandAnnualRecurrence(selectedCalendar, event.structuredDate, window)) {
          items.push({ minutes, data: event });
        }
        continue;
      }
      const minutes = toCanonicalMinutes(selectedCalendar, event.structuredDate);
      if (minutes !== null) items.push({ minutes, data: event });
    }
    return bucketByDay(grid, items);
  }, [grid, selectedCalendar, selectedCalendarTitle, events]);

  const upcoming = useMemo(() => {
    if (!events || !settings?.campaignDate) return [];
    const campaignCalendar = calendarByTitle.get(settings.campaignDate.calendarNoteTitle);
    if (!campaignCalendar) return [];
    const campaignMinutes = toCanonicalMinutes(campaignCalendar, { ...settings.campaignDate, hour: 0, minute: 0 });
    if (campaignMinutes === null) return [];

    const anchorItems: { event: EventSummary; minutes: number }[] = [];
    for (const event of events) {
      if (event.noteType !== "event" || !event.structuredDate) continue;
      const cal = calendarByTitle.get(event.structuredDate.calendarNoteTitle);
      if (!cal) continue;
      const minutes = toCanonicalMinutes(cal, event.structuredDate);
      if (minutes !== null) anchorItems.push({ event, minutes });
    }
    const fullWindow = computeFullWindow(anchorItems.map((i) => i.minutes));

    const allItems: { event: EventSummary; minutes: number }[] = [];
    for (const item of anchorItems) {
      if (!item.event.structuredDate?.annualRecurrence) {
        allItems.push(item);
        continue;
      }
      const cal = calendarByTitle.get(item.event.structuredDate.calendarNoteTitle)!;
      for (const minutes of expandAnnualRecurrence(cal, item.event.structuredDate, fullWindow)) {
        allItems.push({ event: item.event, minutes });
      }
    }

    return allItems
      .filter((i) => i.minutes >= campaignMinutes)
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, UPCOMING_COUNT);
  }, [events, settings, calendarByTitle]);

  const activeCalendars = (settings?.activeCalendarNoteTitles ?? [])
    .map((title) => calendarByTitle.get(title))
    .filter((c): c is CalendarFrontmatter => c !== undefined);

  const formatDate = (minutes: number): string => {
    const cals = activeCalendars.length > 0 ? activeCalendars : selectedCalendar ? [selectedCalendar] : [];
    const labels = cals
      .map((cal) => {
        const parts = fromCanonicalMinutes(cal, minutes);
        return parts ? formatCalendarDate(cal, parts) : null;
      })
      .filter((l): l is string => l !== null);
    return labels.join(" / ");
  };

  const setAsCampaignDate = (day: number) => {
    if (!selectedCalendarTitle || !monthRef) return;
    fetch("/api/workspace-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignDate: { calendarNoteTitle: selectedCalendarTitle, eraId: monthRef.eraId, year: monthRef.year, monthId: monthRef.monthId, day },
      }),
    })
      .then((res) => res.json())
      .then(setSettings)
      .catch((err) => console.error("Failed to set campaign date:", err));
  };

  const jumpToToday = () => {
    if (!selectedCalendar || !settings?.campaignDate || settings.campaignDate.calendarNoteTitle !== selectedCalendarTitle) return;
    setMonthRef({ eraId: settings.campaignDate.eraId, year: settings.campaignDate.year, monthId: settings.campaignDate.monthId });
    setSelectedDay(settings.campaignDate.day);
  };

  if (error) {
    return <p className="p-6 text-center text-danger text-sm">{error}</p>;
  }

  if (events === null || calendars === null) {
    return <p className="p-6 text-center text-muted text-sm">Loading…</p>;
  }

  if (calendars.length === 0) {
    return (
      <p className="p-6 text-center text-muted text-sm">
        No calendar notes yet — create one (or check its frontmatter) to use the Calendar view.
      </p>
    );
  }

  if (!selectedCalendar || !monthRef || !grid) {
    return <p className="p-6 text-center text-muted text-sm">Loading…</p>;
  }

  const monthName = selectedCalendar.months.find((m) => m.id === monthRef.monthId)?.name ?? monthRef.monthId;
  const era = selectedCalendar.eras.find((e) => e.id === monthRef.eraId);
  const eraLabel = era ? era.abbreviation || era.name : "";
  const isCampaignMonth =
    settings?.campaignDate?.calendarNoteTitle === selectedCalendarTitle &&
    settings.campaignDate.eraId === monthRef.eraId &&
    settings.campaignDate.year === monthRef.year &&
    settings.campaignDate.monthId === monthRef.monthId;
  const selectedCell = selectedDay !== null ? grid.weeks.flat().find((c) => c?.day === selectedDay) : null;
  const matchingClimates = (climateRoster ?? []).filter((r) => r.climate.calendarNoteTitle === selectedCalendarTitle);

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-2xl">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="flex items-center gap-1.5 text-sm">
          Calendar
          <select
            className="border border-border rounded-md px-1.5 py-1"
            value={selectedCalendarTitle ?? ""}
            onChange={(e) => changeCalendar(e.target.value)}
          >
            {calendars.map((c) => (
              <option key={c.title} value={c.title}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover"
          onClick={() => setMonthRef((r) => (r ? stepMonth(selectedCalendar, r, -1) : r))}
        >
          ◀
        </button>
        <button
          className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover"
          onClick={() => setMonthRef((r) => (r ? stepMonth(selectedCalendar, r, 1) : r))}
        >
          ▶
        </button>
        {settings?.campaignDate?.calendarNoteTitle === selectedCalendarTitle && (
          <button
            className="px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-40"
            onClick={jumpToToday}
            disabled={isCampaignMonth}
          >
            Today
          </button>
        )}
      </div>

      <h3 className="my-2 font-serif font-semibold">
        {monthName} {monthRef.year} {eraLabel}
      </h3>

      <div
        className="grid gap-px bg-border border border-border rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, selectedCalendar.weekDays.length)}, 1fr)` }}
      >
        {selectedCalendar.weekDays.map((wd) => (
          <div key={wd} className="bg-panel px-2 py-1.5 text-[11px] text-muted text-center">
            {wd}
          </div>
        ))}
        {grid.weeks.flat().map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} className="bg-panel min-h-[72px]" />;
          const dayEvents = dayBuckets.get(cell.day) ?? [];
          const isToday = isCampaignMonth && settings?.campaignDate?.day === cell.day;
          return (
            <button
              key={cell.day}
              type="button"
              className={`bg-app min-h-[72px] px-1.5 py-1 text-left flex flex-col gap-0.5 hover:bg-hover ${
                isToday ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
              } ${selectedDay === cell.day ? "outline outline-2 outline-accent -outline-offset-2" : ""}`}
              onClick={() => setSelectedDay(cell.day)}
            >
              <div className="flex justify-between items-baseline text-xs font-semibold">
                <span>{cell.day}</span>
                {selectedCalendar.moons.length > 0 && (
                  <span
                    title={selectedCalendar.moons
                      .map((m) => `${m.name}: ${computeMoonPhase(selectedCalendar, m, cell.startMinutes).name}`)
                      .join(", ")}
                  >
                    {selectedCalendar.moons.map((m) => computeMoonPhase(selectedCalendar, m, cell.startMinutes).emoji).join("")}
                  </span>
                )}
              </div>
              {dayEvents.slice(0, MAX_EVENT_CHIPS_PER_DAY).map((e, ei) => (
                <div key={`${e.id}-${ei}`} className="text-[10.5px] bg-panel rounded px-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  {e.structuredDate?.annualRecurrence && "↻ "}
                  {e.name}
                </div>
              ))}
              {dayEvents.length > MAX_EVENT_CHIPS_PER_DAY && (
                <div className="text-[10.5px] text-muted px-1">+{dayEvents.length - MAX_EVENT_CHIPS_PER_DAY} more</div>
              )}
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="mt-3 px-3.5 py-2.5 border border-border rounded-lg bg-panel">
          <strong>{formatDate(selectedCell.startMinutes)}</strong>
          {selectedCalendar.moons.length > 0 && (
            <p className="text-sm text-muted">
              {selectedCalendar.moons
                .map((m) => {
                  const phase = computeMoonPhase(selectedCalendar, m, selectedCell.startMinutes);
                  return `${phase.emoji} ${m.name}: ${phase.name}`;
                })
                .join(" · ")}
            </p>
          )}
          {matchingClimates.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">Weather</summary>
              <ul className="my-1 pl-4.5 text-sm">
                {matchingClimates.map((entry) => {
                  const weather = computeWeatherForDate(entry.climate, selectedCalendar, selectedCell.startMinutes);
                  return (
                    <li key={entry.placeTitle}>
                      {entry.placeTitle}: {weather ? `${weather.condition.name} (${weather.seasonName})` : "No weather defined for this month"}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {(dayBuckets.get(selectedCell.day) ?? []).length > 0 && (
            <ul className="my-1 pl-4.5 text-sm">
              {(dayBuckets.get(selectedCell.day) ?? []).map((e, i) => (
                <li key={`${e.id}-${i}`}>
                  <button className="text-accent underline bg-transparent border-0 p-0 cursor-pointer" onClick={() => onOpenEvent(e.id)}>
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="mt-2 px-2.5 py-1.5 text-sm border border-border rounded-md hover:bg-hover"
            onClick={() => setAsCampaignDate(selectedCell.day)}
          >
            Set as campaign date
          </button>
        </div>
      )}

      {settings?.campaignDate && (
        <div className="mt-3">
          <strong>Upcoming</strong>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded after the campaign date yet.</p>
          ) : (
            <ul className="my-1 pl-4.5 text-sm">
              {upcoming.map((item, i) => (
                <li key={`${item.event.id}-${i}`}>
                  <button className="text-accent underline bg-transparent border-0 p-0 cursor-pointer" onClick={() => onOpenEvent(item.event.id)}>
                    {item.event.structuredDate?.annualRecurrence && "↻ "}
                    {item.event.name}
                  </button>{" "}
                  — {formatDate(item.minutes)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
