// Ported verbatim from the Electron app's src/common/noteTypes/calendar.ts.
import { z } from "zod";

export const calendarEraSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string().catch(""),
  direction: z.enum(["up", "down"]).catch("up"),
});
export type CalendarEra = z.infer<typeof calendarEraSchema>;

export const calendarMonthSchema = z.object({
  id: z.string(),
  name: z.string(),
  days: z.coerce.number().catch(30),
});
export type CalendarMonth = z.infer<typeof calendarMonthSchema>;

export const leapYearRuleSchema = z.object({
  intervalYears: z.coerce.number().catch(4),
  exceptionEveryYears: z.coerce.number().nullable().catch(null),
  exceptionToExceptionEveryYears: z.coerce.number().nullable().catch(null),
  extraDays: z.coerce.number().catch(1),
  monthId: z.string().nullable().catch(null),
});
export type LeapYearRule = z.infer<typeof leapYearRuleSchema>;

export const calendarMoonSchema = z.object({
  id: z.string(),
  name: z.string(),
  cycleDays: z.coerce.number().catch(30),
  phaseOffsetDays: z.coerce.number().catch(0),
});
export type CalendarMoon = z.infer<typeof calendarMoonSchema>;

export const calendarFrontmatterSchema = z
  .object({
    type: z.literal("calendar"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
    eras: z.array(calendarEraSchema).catch([]),
    leapYearRule: leapYearRuleSchema.nullable().catch(null),
    months: z.array(calendarMonthSchema).catch(() => defaultMonths()),
    weekDays: z.array(z.string()).catch(() => defaultWeekDays()),
    hoursPerDay: z.coerce.number().catch(24),
    minutesPerHour: z.coerce.number().catch(60),
    moons: z.array(calendarMoonSchema).catch([]),
    defaultEraId: z.string().nullable().catch(null),
  })
  .passthrough();

export type CalendarFrontmatter = z.infer<typeof calendarFrontmatterSchema>;

function defaultMonths(): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `month-${i + 1}`,
    name: `Month ${i + 1}`,
    days: 30,
  }));
}

function defaultWeekDays(): string[] {
  return ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
}

export function defaultCalendarFrontmatter(): CalendarFrontmatter {
  return calendarFrontmatterSchema.parse({ type: "calendar" });
}
