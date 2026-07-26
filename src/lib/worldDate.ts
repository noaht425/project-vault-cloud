// Ported from Project Vault's src/common/worldDate.ts (separate repo, no
// shared package) — sorts free-text in-world dates into chronological
// order. Two calendars are in use, sharing the same AF (counts down like
// BCE) / AM (counts up like CE) year numbering: the main one
// (Aucaela/Auctera/Morcaela/Mortera, 100 days each) and the Kingdom of
// Krotaphos's own 12-month calendar (variable month lengths, used only in
// dates about that kingdom). An omitted AM/AF suffix (seen on a few dates
// that follow an already-AM date) defaults to AM.
//
// Parsing is best-effort: this is freeform author text, not a validated
// format, so anything that doesn't match a recognized shape returns null
// and the caller should leave the entry undated rather than guess.

const MAIN_MONTHS = ["Aucaela", "Auctera", "Morcaela", "Mortera"];
const MAIN_MONTH_LENGTH = 100;
const MAIN_YEAR_LENGTH = MAIN_MONTHS.length * MAIN_MONTH_LENGTH; // 400

const KROTAPHOS_MONTHS: [name: string, days: number][] = [
  ["Blython", 30],
  ["Neemon", 29],
  ["Veriton", 28],
  ["Pavlon", 27],
  ["Themon", 26],
  ["Gwenon", 25],
  ["Belphala", 30],
  ["Abala", 29],
  ["Tiyala", 28],
  ["Lukala", 27],
  ["Archala", 26],
  ["Lilia", 25],
];
const KROTAPHOS_YEAR_LENGTH = KROTAPHOS_MONTHS.reduce((sum, [, days]) => sum + days, 0); // 330

interface MonthPosition {
  dayOfYear: number; // 1-based
  yearLength: number;
}

function findMonth(monthName: string, day: number): MonthPosition | null {
  const lower = monthName.toLowerCase();

  let offset = 0;
  for (const m of MAIN_MONTHS) {
    if (m.toLowerCase() === lower) return { dayOfYear: offset + day, yearLength: MAIN_YEAR_LENGTH };
    offset += MAIN_MONTH_LENGTH;
  }

  offset = 0;
  for (const [m, days] of KROTAPHOS_MONTHS) {
    if (m.toLowerCase() === lower) return { dayOfYear: offset + day, yearLength: KROTAPHOS_YEAR_LENGTH };
    offset += days;
  }

  return null;
}

interface WorldPoint {
  era: "AM" | "AF";
  year: number;
  dayOfYear: number; // 1-based, scaled onto MAIN_YEAR_LENGTH regardless of source calendar
}

const FULL_DATE_RE = /(\d+)\s+([A-Za-z]+),?\s*(\d[\d,]*)\s*(AM|AF)?/i;
const BARE_YEAR_RE = /(\d[\d,]*)\s*(AM|AF)?/i;
const COMPACT_RANGE_RE = /^(\d[\d,]*)-(\d[\d,]*)\s*(AM|AF)/i;
const RANGE_SPLIT_RE = /\s[–—-]\s/;

function parsePoint(text: string): WorldPoint | null {
  const full = text.match(FULL_DATE_RE);
  if (full) {
    const day = Number(full[1]);
    const year = Number(full[3].replace(/,/g, ""));
    const era = (full[4]?.toUpperCase() as "AM" | "AF" | undefined) ?? "AM";
    const found = findMonth(full[2], day);
    if (found) {
      const scaledDay = Math.round(((found.dayOfYear - 1) / found.yearLength) * MAIN_YEAR_LENGTH) + 1;
      return { era, year, dayOfYear: scaledDay };
    }
    return { era, year, dayOfYear: 1 };
  }

  const bare = text.match(BARE_YEAR_RE);
  if (bare) {
    const year = Number(bare[1].replace(/,/g, ""));
    const era = (bare[2]?.toUpperCase() as "AM" | "AF" | undefined) ?? "AM";
    return { era, year, dayOfYear: 1 };
  }

  return null;
}

function epoch(point: WorldPoint): number {
  return point.era === "AM"
    ? (point.year - 1) * MAIN_YEAR_LENGTH + (point.dayOfYear - 1)
    : -(point.year * MAIN_YEAR_LENGTH) + (point.dayOfYear - 1);
}

export function parseWorldDateStart(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const rangeParts = trimmed.split(RANGE_SPLIT_RE);
  if (rangeParts.length > 1) {
    const point = parsePoint(rangeParts[0]);
    return point ? epoch(point) : null;
  }

  const compact = trimmed.match(COMPACT_RANGE_RE);
  if (compact) {
    const year = Number(compact[1].replace(/,/g, ""));
    const era = compact[3].toUpperCase() as "AM" | "AF";
    return epoch({ era, year, dayOfYear: 1 });
  }

  const point = parsePoint(trimmed);
  return point ? epoch(point) : null;
}

export function compareWorldDates(a: string, b: string): number {
  const ea = parseWorldDateStart(a);
  const eb = parseWorldDateStart(b);
  if (ea !== null && eb !== null) return ea - eb || a.localeCompare(b);
  if (ea !== null) return -1;
  if (eb !== null) return 1;
  return a.localeCompare(b);
}
