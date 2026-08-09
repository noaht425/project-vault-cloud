import { describe, it, expect } from "vitest";
import {
  bornDiedByTitle,
  checkEventDeathContradictions,
  checkFamilyTreeDateContradictions,
  type EventForCheck,
  type ParentChildForCheck,
} from "../src/lib/contradictionCheck";

describe("bornDiedByTitle", () => {
  it("picks Born/Died facts out of a mixed fact list, ignoring unrelated History entries", () => {
    const facts = [
      { title: "Mira", date: "10 Aucaela, 380 AM", summary: "Born" },
      { title: "Mira", date: "5 Auctera, 402 AM", summary: "Died: Killed by bandits." },
      { title: "Mira", date: "1 Morcaela, 401 AM", summary: "Founded the guild." },
      { title: "Torvald Faire", date: "3 Aucaela, 100 AF", summary: "Founding of the village" },
    ];
    const result = bornDiedByTitle(facts);
    expect(result.get("Mira")).toEqual({ born: "10 Aucaela, 380 AM", died: "5 Auctera, 402 AM" });
    expect(result.get("Torvald Faire")).toBeUndefined();
  });

  it("keeps the first Born/Died fact when a title has more than one of the same kind", () => {
    const facts = [
      { title: "Mira", date: "10 Aucaela, 380 AM", summary: "Born" },
      { title: "Mira", date: "1 Aucaela, 379 AM", summary: "Born" },
    ];
    expect(bornDiedByTitle(facts).get("Mira")).toEqual({ born: "10 Aucaela, 380 AM", died: null });
  });
});

describe("checkEventDeathContradictions", () => {
  const bornDied = bornDiedByTitle([
    { title: "Old Tomas", date: "5 Auctera, 390 AM", summary: "Died" },
    { title: "Elowen", date: "1 Aucaela, 400 AM", summary: "Died: Passed peacefully." },
  ]);

  it("flags an event that links a person who died before the event date", () => {
    const events: EventForCheck[] = [{ title: "The Harvest Festival", date: "1 Morcaela, 395 AM", linkedTitles: ["Old Tomas"] }];
    const result = checkEventDeathContradictions(events, bornDied);
    expect(result).toHaveLength(1);
    expect(result[0].noteATitle).toBe("The Harvest Festival");
    expect(result[0].noteBTitle).toBe("Old Tomas");
  });

  it("does not flag a person who died AFTER the event", () => {
    const events: EventForCheck[] = [{ title: "The Coronation", date: "1 Morcaela, 385 AM", linkedTitles: ["Old Tomas"] }];
    expect(checkEventDeathContradictions(events, bornDied)).toHaveLength(0);
  });

  it("does not flag a linked person with no recorded death at all", () => {
    const events: EventForCheck[] = [{ title: "The Coronation", date: "1 Morcaela, 385 AM", linkedTitles: ["Someone Undated"] }];
    expect(checkEventDeathContradictions(events, bornDied)).toHaveLength(0);
  });

  it("skips an event with no date rather than treating it as always-earliest", () => {
    const events: EventForCheck[] = [{ title: "Undated Event", date: "", linkedTitles: ["Old Tomas"] }];
    expect(checkEventDeathContradictions(events, bornDied)).toHaveLength(0);
  });
});

describe("checkFamilyTreeDateContradictions", () => {
  it("flags a child recorded born before their parent", () => {
    const bornDied = bornDiedByTitle([
      { title: "Parent", date: "10 Aucaela, 380 AM", summary: "Born" },
      { title: "Child", date: "1 Aucaela, 370 AM", summary: "Born" },
    ]);
    const edges: ParentChildForCheck[] = [{ parent: "Parent", child: "Child", sourceTreeTitle: "The Family" }];
    const result = checkFamilyTreeDateContradictions(edges, bornDied);
    expect(result).toHaveLength(1);
    expect(result[0].noteATitle).toBe("Parent");
    expect(result[0].noteBTitle).toBe("Child");
  });

  it("flags a parent who died before the child was born", () => {
    const bornDied = bornDiedByTitle([
      { title: "Parent", date: "10 Aucaela, 380 AM", summary: "Died" },
      { title: "Child", date: "1 Aucaela, 390 AM", summary: "Born" },
    ]);
    const edges: ParentChildForCheck[] = [{ parent: "Parent", child: "Child", sourceTreeTitle: "The Family" }];
    expect(checkFamilyTreeDateContradictions(edges, bornDied)).toHaveLength(1);
  });

  it("does not flag a plausible parent/child pair", () => {
    const bornDied = bornDiedByTitle([
      { title: "Parent", date: "10 Aucaela, 350 AM", summary: "Born" },
      { title: "Child", date: "1 Aucaela, 380 AM", summary: "Born" },
    ]);
    const edges: ParentChildForCheck[] = [{ parent: "Parent", child: "Child", sourceTreeTitle: "The Family" }];
    expect(checkFamilyTreeDateContradictions(edges, bornDied)).toHaveLength(0);
  });
});
