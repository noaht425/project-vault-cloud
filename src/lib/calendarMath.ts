// Ported verbatim from the Electron app's src/common/calendarMath.ts.
import type { CalendarFrontmatter, CalendarEra, CalendarMoon, LeapYearRule } from "./noteTypes/calendar";

export interface CalendarDateParts {
  eraId: string;
  year: number;
  monthId: string;
  day: number;
  hour: number;
  minute: number;
}

function baseYearLengthDays(calendar: CalendarFrontmatter): number {
  return calendar.months.reduce((sum, m) => sum + m.days, 0);
}

function minutesPerDay(calendar: CalendarFrontmatter): number {
  return calendar.hoursPerDay * calendar.minutesPerHour;
}

export function isLeapYear(rule: LeapYearRule | null, year: number): boolean {
  if (!rule || rule.intervalYears <= 0) return false;
  if (year % rule.intervalYears !== 0) return false;
  if (rule.exceptionEveryYears && year % rule.exceptionEveryYears === 0) {
    return rule.exceptionToExceptionEveryYears !== null && year % rule.exceptionToExceptionEveryYears === 0;
  }
  return true;
}

export function yearLengthDays(calendar: CalendarFrontmatter, year: number): number {
  const base = baseYearLengthDays(calendar);
  return isLeapYear(calendar.leapYearRule, year) ? base + calendar.leapYearRule!.extraDays : base;
}

export function daysInMonthForYear(calendar: CalendarFrontmatter, monthId: string, year: number): number | null {
  const month = calendar.months.find((m) => m.id === monthId);
  if (!month) return null;
  const leap = isLeapYear(calendar.leapYearRule, year);
  const extra = leap && calendar.leapYearRule?.monthId === monthId ? calendar.leapYearRule.extraDays : 0;
  return month.days + extra;
}

function extraLeapDaysBeforeYear(rule: LeapYearRule | null, year: number): number {
  if (!rule || rule.intervalYears <= 0 || year <= 1) return 0;
  const upTo = year - 1;
  const div = (n: number, d: number): number => Math.floor(n / d);
  let count = div(upTo, rule.intervalYears);
  if (rule.exceptionEveryYears) {
    count -= div(upTo, rule.exceptionEveryYears);
    if (rule.exceptionToExceptionEveryYears) {
      count += div(upTo, rule.exceptionToExceptionEveryYears);
    }
  }
  return count * rule.extraDays;
}

function monthStartOffsets(calendar: CalendarFrontmatter, year: number): number[] {
  const leap = isLeapYear(calendar.leapYearRule, year);
  const leapMonthId = leap ? (calendar.leapYearRule?.monthId ?? null) : null;
  const extraDays = calendar.leapYearRule?.extraDays ?? 0;
  const offsets: number[] = [];
  let running = 0;
  for (const month of calendar.months) {
    offsets.push(running);
    running += month.days + (leapMonthId === month.id ? extraDays : 0);
  }
  return offsets;
}

function absoluteYearIndex(era: CalendarEra, year: number): number {
  return era.direction === "up" ? year - 1 : -year;
}

function daysFromEpochToYearStart(calendar: CalendarFrontmatter, index: number): number {
  const base = baseYearLengthDays(calendar);
  if (index >= 0) {
    return index * base + extraLeapDaysBeforeYear(calendar.leapYearRule, index + 1);
  }
  const m = -index;
  return -(m * base + extraLeapDaysBeforeYear(calendar.leapYearRule, m + 1));
}

export function toCanonicalMinutes(calendar: CalendarFrontmatter, parts: CalendarDateParts): number | null {
  const era = calendar.eras.find((e) => e.id === parts.eraId);
  if (!era) return null;
  const monthIndex = calendar.months.findIndex((m) => m.id === parts.monthId);
  if (monthIndex === -1) return null;

  const index = absoluteYearIndex(era, parts.year);
  const daysToYearStart = daysFromEpochToYearStart(calendar, index);
  const dayOfYear0 = monthStartOffsets(calendar, parts.year)[monthIndex] + (parts.day - 1);
  const totalDays = daysToYearStart + dayOfYear0;

  return totalDays * minutesPerDay(calendar) + parts.hour * calendar.minutesPerHour + parts.minute;
}

export function fromCanonicalMinutes(calendar: CalendarFrontmatter, totalMinutes: number): CalendarDateParts | null {
  const perDay = minutesPerDay(calendar);
  if (perDay <= 0 || calendar.months.length === 0) return null;

  const totalDays = Math.floor(totalMinutes / perDay);
  const minuteOfDay = totalMinutes - totalDays * perDay;
  const hour = Math.floor(minuteOfDay / calendar.minutesPerHour);
  const minute = minuteOfDay - hour * calendar.minutesPerHour;

  const era = calendar.eras.find((e) => (totalDays >= 0 ? e.direction === "up" : e.direction === "down"));
  if (!era) return null;

  const base = baseYearLengthDays(calendar);
  let index = Math.trunc(totalDays / base);
  for (let guard = 0; guard < 64; guard++) {
    const yearStart = daysFromEpochToYearStart(calendar, index);
    if (totalDays < yearStart) {
      index--;
      continue;
    }
    const nextYearStart = daysFromEpochToYearStart(calendar, index + 1);
    if (totalDays >= nextYearStart) {
      index++;
      continue;
    }
    break;
  }

  const year = era.direction === "up" ? index + 1 : -index;
  const dayOfYear0 = totalDays - daysFromEpochToYearStart(calendar, index);

  const offsets = monthStartOffsets(calendar, year);
  let monthIndex = offsets.length - 1;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] > dayOfYear0) {
      monthIndex = i - 1;
      break;
    }
  }
  const day = dayOfYear0 - offsets[monthIndex] + 1;

  return { eraId: era.id, year, monthId: calendar.months[monthIndex].id, day, hour, minute };
}

export type MoonPhaseName =
  | "New"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

export interface MoonPhase {
  fraction: number;
  name: MoonPhaseName;
  emoji: string;
}

const MOON_PHASE_BUCKETS: { max: number; name: MoonPhaseName; emoji: string }[] = [
  { max: 1 / 16, name: "New", emoji: "🌑" },
  { max: 3 / 16, name: "Waxing Crescent", emoji: "🌒" },
  { max: 5 / 16, name: "First Quarter", emoji: "🌓" },
  { max: 7 / 16, name: "Waxing Gibbous", emoji: "🌔" },
  { max: 9 / 16, name: "Full", emoji: "🌕" },
  { max: 11 / 16, name: "Waning Gibbous", emoji: "🌖" },
  { max: 13 / 16, name: "Last Quarter", emoji: "🌗" },
  { max: 15 / 16, name: "Waning Crescent", emoji: "🌘" },
  { max: 1, name: "New", emoji: "🌑" },
];

export function computeMoonPhase(calendar: CalendarFrontmatter, moon: CalendarMoon, totalMinutes: number): MoonPhase {
  if (moon.cycleDays <= 0) return { fraction: 0, name: "New", emoji: "🌑" };
  const perDay = minutesPerDay(calendar);
  const totalDays = Math.floor(totalMinutes / perDay);
  const daysIntoCycle = (((totalDays - moon.phaseOffsetDays) % moon.cycleDays) + moon.cycleDays) % moon.cycleDays;
  const fraction = daysIntoCycle / moon.cycleDays;
  const bucket = MOON_PHASE_BUCKETS.find((b) => fraction < b.max) ?? MOON_PHASE_BUCKETS[MOON_PHASE_BUCKETS.length - 1];
  return { fraction, name: bucket.name, emoji: bucket.emoji };
}

export function formatCalendarDate(calendar: CalendarFrontmatter, parts: CalendarDateParts): string {
  const era = calendar.eras.find((e) => e.id === parts.eraId);
  const month = calendar.months.find((m) => m.id === parts.monthId);
  const eraLabel = era ? era.abbreviation || era.name : "";
  const monthLabel = month?.name ?? "?";
  let result = `${parts.day} ${monthLabel}, ${parts.year}${eraLabel ? ` ${eraLabel}` : ""}`;
  if (parts.hour !== 0 || parts.minute !== 0) {
    result += `, ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }
  return result;
}
