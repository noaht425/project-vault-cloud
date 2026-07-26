import { describe, it, expect } from "vitest";
import { extractHistoryFacts, extractBornDiedFacts } from "../src/lib/worldTimeline";

describe("extractHistoryFacts", () => {
  it("extracts dated bullets under a History heading", () => {
    const body = `
## History
- 12 Aucaela, 400 AM: The founding of the kingdom.
- 3 Auctera, 401 AM: The first harvest festival.
`;
    expect(extractHistoryFacts(body)).toEqual([
      { date: "12 Aucaela, 400 AM", description: "The founding of the kingdom." },
      { date: "3 Auctera, 401 AM", description: "The first harvest festival." },
    ]);
  });

  it("stops at the next heading", () => {
    const body = `
## History
- 1 AM: Something happened.

## Overview
- 2 AM: Not a history bullet, should be ignored.
`;
    expect(extractHistoryFacts(body)).toEqual([{ date: "1 AM", description: "Something happened." }]);
  });

  it("returns an empty array when there's no History heading", () => {
    expect(extractHistoryFacts("Just some prose.\n- not: a heading")).toEqual([]);
  });

  it("is case-insensitive on the heading", () => {
    const body = "## history\n- 1 AM: event\n";
    expect(extractHistoryFacts(body)).toEqual([{ date: "1 AM", description: "event" }]);
  });

  it("ignores bullets that don't have a colon-space split", () => {
    const body = "## History\n- no colon here\n- 1 AM: has one\n";
    expect(extractHistoryFacts(body)).toEqual([{ date: "1 AM", description: "has one" }]);
  });
});

describe("extractBornDiedFacts", () => {
  it("extracts a bare Born:/Died: line", () => {
    const body = "Born: 5 Aucaela, 380 AM\nDied: 12 Morcaela, 405 AM";
    expect(extractBornDiedFacts(body)).toEqual([
      { date: "5 Aucaela, 380 AM", description: "Born" },
      { date: "12 Morcaela, 405 AM", description: "Died" },
    ]);
  });

  it("folds trailing sentence text after the date into the description", () => {
    const body = "Died: 33 Aucaela, 405 AM. Killed by [[Iras]].";
    expect(extractBornDiedFacts(body)).toEqual([
      { date: "33 Aucaela, 405 AM", description: "Died: Killed by [[Iras]]." },
    ]);
  });

  it("returns an empty array when there are no Born/Died lines", () => {
    expect(extractBornDiedFacts("No dates here.")).toEqual([]);
  });
});
