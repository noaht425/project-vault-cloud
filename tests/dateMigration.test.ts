import { describe, it, expect } from "vitest";
import { migrateFreeTextDate, computeDateMigration, parseCalendarDefinition, type CalendarCandidate } from "../src/lib/dateMigration";

function mainCalendar(): CalendarCandidate {
  return {
    noteTitle: "Age of the Many",
    frontmatter: {
      eras: [
        { id: "am", abbreviation: "AM" },
        { id: "af", abbreviation: "AF" },
      ],
      months: [
        { id: "aucaela", name: "Aucaela" },
        { id: "auctera", name: "Auctera" },
        { id: "morcaela", name: "Morcaela" },
        { id: "mortera", name: "Mortera" },
      ],
      defaultEraId: "am",
    },
  };
}

function krotaphosCalendar(): CalendarCandidate {
  return {
    noteTitle: "Kingdom of Krotaphos",
    frontmatter: {
      eras: [
        { id: "am", abbreviation: "AM" },
        { id: "af", abbreviation: "AF" },
      ],
      months: [
        { id: "blython", name: "Blython" },
        { id: "neemon", name: "Neemon" },
      ],
      defaultEraId: "am",
    },
  };
}

describe("migrateFreeTextDate", () => {
  it("matches a full date against the calendar whose months know that name", () => {
    const result = migrateFreeTextDate("15 Aucaela, 42 AM", [mainCalendar(), krotaphosCalendar()]);
    expect(result).toEqual({ calendarNoteTitle: "Age of the Many", eraId: "am", year: 42, monthId: "aucaela", day: 15, hour: 0, minute: 0 });
  });

  it("picks the Krotaphos calendar when the month name only exists there", () => {
    const result = migrateFreeTextDate("10 Blython, 5 AM", [mainCalendar(), krotaphosCalendar()]);
    expect(result?.calendarNoteTitle).toBe("Kingdom of Krotaphos");
    expect(result?.monthId).toBe("blython");
  });

  it("uses the first calendar's first month for a bare year", () => {
    const result = migrateFreeTextDate("50 AF", [mainCalendar(), krotaphosCalendar()]);
    expect(result).toEqual({ calendarNoteTitle: "Age of the Many", eraId: "af", year: 50, monthId: "aucaela", day: 1, hour: 0, minute: 0 });
  });

  it("falls back to defaultEraId when no AM/AF suffix is present", () => {
    const result = migrateFreeTextDate("99 Morcaela, 427", [mainCalendar()]);
    expect(result?.eraId).toBe("am");
  });

  it("returns null when no calendar knows the month name", () => {
    expect(migrateFreeTextDate("5 Frobmonth, 10 AM", [mainCalendar(), krotaphosCalendar()])).toBeNull();
  });

  it("returns null for unparseable text or no calendars", () => {
    expect(migrateFreeTextDate("sometime last week", [mainCalendar()])).toBeNull();
    expect(migrateFreeTextDate("15 Aucaela, 42 AM", [])).toBeNull();
  });
});

describe("computeDateMigration", () => {
  it("migrates only events with a parseable date and no existing structuredDate", () => {
    const events = [
      { id: "a", date: "15 Aucaela, 42 AM", hasStructuredDate: false },
      { id: "b", date: "10 Blython, 5 AM", hasStructuredDate: true },
      { id: "c", date: "", hasStructuredDate: false },
      { id: "d", date: "sometime vague", hasStructuredDate: false },
    ];
    const updates = computeDateMigration(events, [mainCalendar(), krotaphosCalendar()]);
    expect(updates).toEqual([
      { id: "a", structuredDate: { calendarNoteTitle: "Age of the Many", eraId: "am", year: 42, monthId: "aucaela", day: 15, hour: 0, minute: 0 } },
    ]);
  });

  it("is a no-op with no calendars defined", () => {
    expect(computeDateMigration([{ id: "a", date: "15 Aucaela, 42 AM", hasStructuredDate: false }], [])).toEqual([]);
  });
});

describe("parseCalendarDefinition", () => {
  it("parses a valid calendar note frontmatter into months/eras/defaultEraId", () => {
    const result = parseCalendarDefinition({
      months: [{ id: "aucaela", name: "Aucaela" }],
      eras: [{ id: "am", abbreviation: "AM" }],
      defaultEraId: "am",
    });
    expect(result).toEqual({
      months: [{ id: "aucaela", name: "Aucaela" }],
      eras: [{ id: "am", abbreviation: "AM" }],
      defaultEraId: "am",
    });
  });

  it("filters out malformed month/era entries instead of throwing", () => {
    const result = parseCalendarDefinition({
      months: [{ id: "aucaela", name: "Aucaela" }, { id: 5, name: "Bad" }, "not an object"],
      eras: [{ id: "am", abbreviation: "AM" }, {}],
    });
    expect(result).toEqual({ months: [{ id: "aucaela", name: "Aucaela" }], eras: [{ id: "am", abbreviation: "AM" }], defaultEraId: null });
  });

  it("returns null when months or eras are missing", () => {
    expect(parseCalendarDefinition({ eras: [] })).toBeNull();
    expect(parseCalendarDefinition({ months: [] })).toBeNull();
    expect(parseCalendarDefinition({})).toBeNull();
  });
});
