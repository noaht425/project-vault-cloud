// Ported verbatim from the Electron app's src/common/monthGrid.ts.
import type { CalendarFrontmatter } from "./noteTypes/calendar";
import { daysInMonthForYear, fromCanonicalMinutes, toCanonicalMinutes } from "./calendarMath";

export interface MonthRef {
  eraId: string;
  year: number;
  monthId: string;
}

export interface DayCell {
  day: number;
  startMinutes: number;
  endMinutes: number;
  weekdayIndex: number;
}

export interface MonthGrid {
  weeks: (DayCell | null)[][];
  daysInMonth: number;
  firstStartMinutes: number;
  minutesPerDay: number;
}

function minutesPerDay(calendar: CalendarFrontmatter): number {
  return calendar.hoursPerDay * calendar.minutesPerHour;
}

export function weekdayIndex(calendar: CalendarFrontmatter, dayStartMinutes: number): number {
  const n = calendar.weekDays.length;
  const perDay = minutesPerDay(calendar);
  if (n === 0 || perDay <= 0) return 0;
  const dayIdx = Math.floor(dayStartMinutes / perDay);
  return ((dayIdx % n) + n) % n;
}

export function buildMonthGrid(calendar: CalendarFrontmatter, ref: MonthRef): MonthGrid | null {
  const daysInMonth = daysInMonthForYear(calendar, ref.monthId, ref.year);
  if (daysInMonth === null || daysInMonth <= 0) return null;
  const firstStart = toCanonicalMinutes(calendar, { eraId: ref.eraId, year: ref.year, monthId: ref.monthId, day: 1, hour: 0, minute: 0 });
  if (firstStart === null) return null;
  const perDay = minutesPerDay(calendar);
  if (perDay <= 0) return null;

  const columns = Math.max(1, calendar.weekDays.length);
  const weeks: (DayCell | null)[][] = [];
  let row: (DayCell | null)[] = Array.from({ length: weekdayIndex(calendar, firstStart) }, () => null);

  for (let day = 1; day <= daysInMonth; day++) {
    const startMinutes = firstStart + (day - 1) * perDay;
    row.push({ day, startMinutes, endMinutes: startMinutes + perDay, weekdayIndex: weekdayIndex(calendar, startMinutes) });
    if (row.length === columns) {
      weeks.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < columns) row.push(null);
    weeks.push(row);
  }

  return { weeks, daysInMonth, firstStartMinutes: firstStart, minutesPerDay: perDay };
}

export function stepMonth(calendar: CalendarFrontmatter, ref: MonthRef, delta: 1 | -1): MonthRef | null {
  const firstStart = toCanonicalMinutes(calendar, { eraId: ref.eraId, year: ref.year, monthId: ref.monthId, day: 1, hour: 0, minute: 0 });
  if (firstStart === null) return null;
  const perDay = minutesPerDay(calendar);
  if (perDay <= 0) return null;

  if (delta === -1) {
    const parts = fromCanonicalMinutes(calendar, firstStart - perDay);
    return parts ? { eraId: parts.eraId, year: parts.year, monthId: parts.monthId } : null;
  }

  const daysInMonth = daysInMonthForYear(calendar, ref.monthId, ref.year);
  if (daysInMonth === null) return null;
  let minutes = firstStart + daysInMonth * perDay;
  for (let guard = 0; guard < 64; guard++) {
    const parts = fromCanonicalMinutes(calendar, minutes);
    if (!parts) return null;
    if (parts.monthId !== ref.monthId || parts.year !== ref.year || parts.eraId !== ref.eraId) {
      return { eraId: parts.eraId, year: parts.year, monthId: parts.monthId };
    }
    minutes += perDay;
  }
  return null;
}

export function monthRefForMinutes(calendar: CalendarFrontmatter, minutes: number): MonthRef | null {
  const parts = fromCanonicalMinutes(calendar, minutes);
  return parts ? { eraId: parts.eraId, year: parts.year, monthId: parts.monthId } : null;
}

export function bucketByDay<T>(grid: MonthGrid, items: { minutes: number; data: T }[]): Map<number, T[]> {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    const day = Math.floor((item.minutes - grid.firstStartMinutes) / grid.minutesPerDay) + 1;
    if (day < 1 || day > grid.daysInMonth) continue;
    const list = buckets.get(day) ?? [];
    list.push(item.data);
    buckets.set(day, list);
  }
  return buckets;
}
