// Ported from the Electron app's src/common/dateMigration.ts (separate
// repo, no shared package — see that file's header comment for the full
// design rationale). Step 5 of the calendar/timeline system: converts an
// event's free-text date into a structuredDate by matching it against
// whatever `calendar` notes exist in this workspace. Duck-typed rather than
// zod-validated (unlike the Electron app) since this backend already
// stores/passes through frontmatter as opaque JSON everywhere else (see
// e.g. src/app/api/events/route.ts) rather than validating it server-side.

import { parseWorldDateRaw } from "./worldDate";

export interface CalendarMonth {
  id: string;
  name: string;
}

export interface CalendarEra {
  id: string;
  abbreviation: string;
}

export interface CalendarDefinition {
  months: CalendarMonth[];
  eras: CalendarEra[];
  defaultEraId: string | null;
}

export interface CalendarCandidate {
  noteTitle: string;
  frontmatter: CalendarDefinition;
}

export interface EventStructuredDate {
  calendarNoteTitle: string;
  eraId: string;
  year: number;
  monthId: string;
  day: number;
  hour: number;
  minute: number;
}

/** Same matching rules as the Electron app's migrateFreeTextDate — see that
 * file for the full rationale (month name match required when the free
 * text names one; bare year/range falls back to the calendar's first
 * month; era resolved from the AM/AF suffix or the calendar's own
 * defaultEraId; first calendar in the list with a full match wins). */
export function migrateFreeTextDate(freeText: string, calendars: CalendarCandidate[]): EventStructuredDate | null {
  const raw = parseWorldDateRaw(freeText);
  if (!raw) return null;

  for (const { noteTitle, frontmatter } of calendars) {
    const month = raw.monthName
      ? frontmatter.months.find((m) => m.name.toLowerCase() === raw.monthName!.toLowerCase())
      : frontmatter.months[0];
    if (!month) continue;

    const era =
      frontmatter.eras.find((e) => e.abbreviation.toUpperCase() === raw.era) ??
      frontmatter.eras.find((e) => e.id === frontmatter.defaultEraId);
    if (!era) continue;

    return { calendarNoteTitle: noteTitle, eraId: era.id, year: raw.year, monthId: month.id, day: raw.day ?? 1, hour: 0, minute: 0 };
  }

  return null;
}

export interface EventDateToMigrate {
  id: string;
  date: string;
  hasStructuredDate: boolean;
}

export interface EventDateMigrationResult {
  id: string;
  structuredDate: EventStructuredDate;
}

/** Pure orchestration, no I/O — see the Electron app's computeDateMigration
 * for the idempotency rationale (skips anything with a structuredDate
 * already, so calling this on every workspace open is always safe). */
export function computeDateMigration(events: EventDateToMigrate[], calendars: CalendarCandidate[]): EventDateMigrationResult[] {
  const results: EventDateMigrationResult[] = [];
  for (const event of events) {
    if (event.hasStructuredDate || !event.date.trim()) continue;
    const structuredDate = migrateFreeTextDate(event.date, calendars);
    if (structuredDate) results.push({ id: event.id, structuredDate });
  }
  return results;
}
