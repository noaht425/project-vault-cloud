// Ported verbatim from the Electron app's src/common/weatherGeneration.ts.
import type { CalendarFrontmatter } from "./noteTypes/calendar";
import type { ClimateFrontmatter, WeatherCondition } from "./noteTypes/climate";
import { fromCanonicalMinutes } from "./calendarMath";

export function deterministicFraction(seed: number): number {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

export function pickWeightedCondition<T extends { weight: number }>(items: T[], fraction: number): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (items.length === 0 || total <= 0) return items[items.length - 1] ?? null;
  let roll = fraction * total;
  for (const item of items) {
    const weight = Math.max(0, item.weight);
    if (weight <= 0) continue;
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export interface WeatherResult {
  seasonName: string;
  condition: WeatherCondition;
}

export function computeWeatherForDate(climate: ClimateFrontmatter, calendar: CalendarFrontmatter, totalMinutes: number): WeatherResult | null {
  const parts = fromCanonicalMinutes(calendar, totalMinutes);
  if (!parts) return null;

  const season = climate.seasons.find((s) => s.monthIds.includes(parts.monthId));
  if (!season || season.conditions.length === 0) return null;

  const minutesPerDay = calendar.hoursPerDay * calendar.minutesPerHour;
  if (minutesPerDay <= 0) return null;
  const totalDays = Math.floor(totalMinutes / minutesPerDay);

  const condition = pickWeightedCondition(season.conditions, deterministicFraction(totalDays));
  if (!condition) return null;

  return { seasonName: season.name, condition };
}
