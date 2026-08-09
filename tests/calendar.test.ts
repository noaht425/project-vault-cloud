import { describe, it, expect } from "vitest";
import { calendarFrontmatterSchema, defaultCalendarFrontmatter } from "../src/lib/noteTypes/calendar";

describe("defaultCalendarFrontmatter", () => {
  it("produces a calendar note with sane seeded defaults", () => {
    const fm = defaultCalendarFrontmatter();
    expect(fm.type).toBe("calendar");
    expect(fm.months.length).toBe(12);
    expect(fm.weekDays.length).toBe(7);
    expect(fm.eras).toEqual([]);
    expect(fm.leapYearRule).toBeNull();
    expect(fm.moons).toEqual([]);
    expect(fm.hoursPerDay).toBe(24);
    expect(fm.minutesPerHour).toBe(60);
    expect(fm.defaultEraId).toBeNull();
  });
});

describe("calendarFrontmatterSchema", () => {
  it("round-trips a two-era, four-month, nine-day-week calendar shape", () => {
    const fm = calendarFrontmatterSchema.parse({
      type: "calendar",
      summary: "A custom calendar.",
      eras: [
        { id: "am", name: "Age of the Many", abbreviation: "AM", direction: "up" },
        { id: "af", name: "Age of the Few", abbreviation: "AF", direction: "down" },
      ],
      months: [
        { id: "aucaela", name: "Aucaela", days: 100 },
        { id: "auctera", name: "Auctera", days: 100 },
        { id: "morcaela", name: "Morcaela", days: 100 },
        { id: "mortera", name: "Mortera", days: 100 },
      ],
      weekDays: ["Minem", "Kleipur", "Sylvana", "Shram", "Thean", "Numen", "Genasi", "Talav", "Sithi"],
    });

    expect(fm.months.reduce((sum, m) => sum + m.days, 0)).toBe(400);
    expect(fm.weekDays.length).toBe(9);
    expect(fm.eras.map((e) => e.abbreviation)).toEqual(["AM", "AF"]);
  });

  it("round-trips a Gregorian-style leap year rule", () => {
    const fm = calendarFrontmatterSchema.parse({
      type: "calendar",
      leapYearRule: {
        intervalYears: 4,
        exceptionEveryYears: 100,
        exceptionToExceptionEveryYears: 400,
        extraDays: 1,
        monthId: "february",
      },
    });

    expect(fm.leapYearRule).toEqual({
      intervalYears: 4,
      exceptionEveryYears: 100,
      exceptionToExceptionEveryYears: 400,
      extraDays: 1,
      monthId: "february",
    });
  });

  it("falls back to defaults for malformed input rather than throwing", () => {
    const fm = calendarFrontmatterSchema.parse({ type: "calendar", months: "not an array", weekDays: 123 });
    expect(fm.months.length).toBe(12);
    expect(fm.weekDays.length).toBe(7);
  });
});
