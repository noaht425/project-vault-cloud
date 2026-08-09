// Ported verbatim from the Electron app's src/common/eventTimelinePlacement.ts.
import type { CalendarFrontmatter } from "./noteTypes/calendar";
import { daysInMonthForYear, fromCanonicalMinutes, toCanonicalMinutes, type CalendarDateParts } from "./calendarMath";

export interface TimelineWindow {
  start: number;
  end: number;
}

export function computeFullWindow(canonicalMinutes: number[]): TimelineWindow {
  if (canonicalMinutes.length === 0) return { start: 0, end: 1 };
  const min = Math.min(...canonicalMinutes);
  const max = Math.max(...canonicalMinutes);
  if (min === max) return { start: min - 1, end: max + 1 };
  const pad = (max - min) * 0.05;
  return { start: min - pad, end: max + pad };
}

const MAX_RECURRENCE_STEPS = 1000;

export function expandAnnualRecurrence(calendar: CalendarFrontmatter, anchor: CalendarDateParts, window: TimelineWindow): number[] {
  const anchorMinutes = toCanonicalMinutes(calendar, anchor);
  if (anchorMinutes === null) return [];

  const occurrenceMinutes = (deltaYears: number): number | null => {
    const year = anchor.year + deltaYears;
    const daysInTargetMonth = daysInMonthForYear(calendar, anchor.monthId, year);
    if (daysInTargetMonth === null || anchor.day > daysInTargetMonth) return null;
    return toCanonicalMinutes(calendar, { ...anchor, year });
  };

  const results = [anchorMinutes];

  for (let delta = 1; delta <= MAX_RECURRENCE_STEPS; delta++) {
    const minutes = occurrenceMinutes(delta);
    if (minutes === null) continue;
    if (minutes > window.end) break;
    if (minutes >= window.start) results.push(minutes);
  }

  for (let delta = -1; delta >= -MAX_RECURRENCE_STEPS; delta--) {
    const minutes = occurrenceMinutes(delta);
    if (minutes === null) continue;
    if (minutes < window.start) break;
    if (minutes <= window.end) results.push(minutes);
  }

  return results;
}

const ZOOM_STEP = 3;
export const MAX_ZOOM_LEVEL = 14;

export function windowForZoom(fullWindow: TimelineWindow, zoomLevel: number, center: number): TimelineWindow {
  const fullSpan = fullWindow.end - fullWindow.start;
  const span = fullSpan / Math.pow(ZOOM_STEP, Math.max(0, zoomLevel));
  const half = span / 2;
  return { start: center - half, end: center + half };
}

export function panWindow(window: TimelineWindow, fractionOfSpan: number): TimelineWindow {
  const span = window.end - window.start;
  const shift = span * fractionOfSpan;
  return { start: window.start + shift, end: window.end + shift };
}

export interface TimelineItem<T> {
  minutes: number;
  data: T;
  widthPx?: number;
}

export interface LanePlacement<T> {
  event: T;
  minutes: number;
  positionFraction: number;
  lane: number;
}

export function placeEventsInLanes<T>(
  items: TimelineItem<T>[],
  window: TimelineWindow,
  pixelWidth: number,
  defaultWidthPx = 100
): LanePlacement<T>[] {
  const span = window.end - window.start;
  if (span <= 0 || pixelWidth <= 0) return [];

  const visible = items
    .filter((i) => i.minutes >= window.start && i.minutes <= window.end)
    .map((i) => ({ ...i, positionPx: ((i.minutes - window.start) / span) * pixelWidth }))
    .sort((a, b) => a.positionPx - b.positionPx);

  const laneEnds: number[] = [];
  const placements: LanePlacement<T>[] = [];

  for (const item of visible) {
    const halfWidth = (item.widthPx ?? defaultWidthPx) / 2;
    const left = item.positionPx - halfWidth;
    const right = item.positionPx + halfWidth;

    let lane = laneEnds.findIndex((end) => end <= left);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(right);
    } else {
      laneEnds[lane] = right;
    }

    placements.push({ event: item.data, minutes: item.minutes, positionFraction: item.positionPx / pixelWidth, lane });
  }

  return placements;
}

type TickUnit = "hour" | "day" | "week" | "month" | "quarter" | "year" | "multiYear";

interface TickStep {
  minutes: number;
  unit: TickUnit;
}

function tickLadder(calendar: CalendarFrontmatter): TickStep[] {
  const minutesPerDay = calendar.hoursPerDay * calendar.minutesPerHour;
  const totalMonthDays = calendar.months.reduce((sum, m) => sum + m.days, 0);
  const avgMonthDays = calendar.months.length > 0 ? totalMonthDays / calendar.months.length : 30;
  const yearDays = totalMonthDays > 0 ? totalMonthDays : 365;

  const multiYearSteps = [5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000];

  return [
    { minutes: calendar.minutesPerHour, unit: "hour" },
    { minutes: calendar.minutesPerHour * 6, unit: "hour" },
    { minutes: minutesPerDay, unit: "day" },
    { minutes: minutesPerDay * 7, unit: "week" },
    { minutes: minutesPerDay * avgMonthDays, unit: "month" },
    { minutes: minutesPerDay * avgMonthDays * 3, unit: "quarter" },
    { minutes: minutesPerDay * yearDays, unit: "year" },
    ...multiYearSteps.map((n) => ({ minutes: minutesPerDay * yearDays * n, unit: "multiYear" as const })),
  ];
}

function formatTickLabel(calendar: CalendarFrontmatter, parts: NonNullable<ReturnType<typeof fromCanonicalMinutes>>, unit: TickUnit): string {
  const era = calendar.eras.find((e) => e.id === parts.eraId);
  const eraLabel = era ? era.abbreviation || era.name : "";
  const month = calendar.months.find((m) => m.id === parts.monthId);
  const yearLabel = `${parts.year}${eraLabel ? ` ${eraLabel}` : ""}`;

  switch (unit) {
    case "hour":
      return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    case "day":
    case "week":
      return `${parts.day} ${month?.name ?? ""}`;
    case "month":
    case "quarter":
      return `${month?.name ?? ""} ${yearLabel}`;
    case "year":
    case "multiYear":
    default:
      return yearLabel;
  }
}

export interface AxisTick {
  minutes: number;
  positionFraction: number;
  label: string;
}

export function computeAxisTicks(calendar: CalendarFrontmatter | null, window: TimelineWindow, targetTickCount = 6): AxisTick[] {
  if (!calendar) return [];
  const span = window.end - window.start;
  if (span <= 0) return [];

  const ladder = tickLadder(calendar);
  let step = ladder[ladder.length - 1];
  for (const candidate of ladder) {
    if (span / candidate.minutes <= targetTickCount) {
      step = candidate;
      break;
    }
  }

  const ticks: AxisTick[] = [];
  const firstTick = Math.ceil(window.start / step.minutes) * step.minutes;
  for (let m = firstTick; m <= window.end; m += step.minutes) {
    const parts = fromCanonicalMinutes(calendar, m);
    if (!parts) continue;
    ticks.push({ minutes: m, positionFraction: (m - window.start) / span, label: formatTickLabel(calendar, parts, step.unit) });
  }
  return ticks;
}
