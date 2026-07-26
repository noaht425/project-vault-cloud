import { describe, it, expect } from "vitest";
import { parseWorldDateStart, compareWorldDates } from "../src/lib/worldDate";

describe("parseWorldDateStart", () => {
  it("returns null for unparseable text", () => {
    expect(parseWorldDateStart("sometime, probably")).toBeNull();
    expect(parseWorldDateStart("")).toBeNull();
    expect(parseWorldDateStart("   ")).toBeNull();
  });

  it("treats day 1 of year 1 as epoch 0 in the main calendar", () => {
    expect(parseWorldDateStart("1 Aucaela, 1 AM")).toBe(0);
  });

  it("orders later main-calendar months within the same year after earlier ones", () => {
    const aucaela = parseWorldDateStart("1 Aucaela, 1 AM")!;
    const auctera = parseWorldDateStart("1 Auctera, 1 AM")!;
    expect(auctera).toBeGreaterThan(aucaela);
  });

  it("scales a Krotaphos-calendar date onto the main calendar's day count", () => {
    // Blython is Krotaphos's first month (30 days); day 30 is the 30th of
    // 330 days in that calendar, scaled onto MAIN_YEAR_LENGTH (400):
    // round((29/330)*400) + 1 = 36th day of the scaled year -> epoch 35.
    expect(parseWorldDateStart("30 Blython, 1 AM")).toBe(35);
  });

  it("defaults to AM when no era suffix is given", () => {
    expect(parseWorldDateStart("1 Aucaela, 1")).toBe(parseWorldDateStart("1 Aucaela, 1 AM"));
  });

  it("AF years count down (higher AF year is earlier) and sort before any AM year", () => {
    const af1 = parseWorldDateStart("1 Aucaela, 1 AF")!;
    const af5 = parseWorldDateStart("1 Aucaela, 5 AF")!;
    const am1 = parseWorldDateStart("1 Aucaela, 1 AM")!;
    expect(af5).toBeLessThan(af1);
    expect(af1).toBeLessThan(am1);
  });

  it("parses a bare year with no month/day at day-1 precision", () => {
    expect(parseWorldDateStart("10 AM")).toBe(parseWorldDateStart("1 Aucaela, 10 AM"));
  });

  it("falls back to year/era at day-1 precision when the month name isn't recognized", () => {
    expect(parseWorldDateStart("5 Blorptown, 10 AM")).toBe(parseWorldDateStart("1 Aucaela, 10 AM"));
  });

  it("sorts a dash-separated range by its start date", () => {
    expect(parseWorldDateStart("12 Aucaela, 5 AM - 20 Aucaela, 5 AM")).toBe(
      parseWorldDateStart("12 Aucaela, 5 AM")
    );
  });
});

describe("compareWorldDates", () => {
  it("sorts chronologically", () => {
    const dates = ["1 Aucaela, 5 AM", "1 Aucaela, 1 AF", "1 Aucaela, 1 AM"];
    expect([...dates].sort(compareWorldDates)).toEqual(["1 Aucaela, 1 AF", "1 Aucaela, 1 AM", "1 Aucaela, 5 AM"]);
  });

  it("sorts undated entries after every dated one", () => {
    const dates = ["", "1 Aucaela, 1 AM", "unparseable"];
    expect([...dates].sort(compareWorldDates)).toEqual(["1 Aucaela, 1 AM", "", "unparseable"]);
  });

  it("breaks ties between undated entries alphabetically", () => {
    const dates = ["zeta", "alpha"];
    expect([...dates].sort(compareWorldDates)).toEqual(["alpha", "zeta"]);
  });

  it("breaks ties between equally-dated entries by the raw string", () => {
    // Both resolve to the same day-1-precision epoch as "1 Aucaela, 10 AM".
    const dates = ["5 Blorptown, 10 AM", "10 AM"];
    expect([...dates].sort(compareWorldDates)).toEqual(["10 AM", "5 Blorptown, 10 AM"]);
  });
});
