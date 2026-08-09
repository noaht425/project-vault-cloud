import { describe, it, expect } from "vitest";
import {
  parseRelationships,
  computeFamilyTreeLayout,
  checkRelationshipPlausibility,
  addRelationshipEdge,
  removeRelationshipEdge,
} from "../src/lib/noteTypes/familyTree";

describe("parseRelationships", () => {
  it("parses all four relation phrases", () => {
    const body = `
## Relationships
- [[Alice]] parent of [[Bob]]
- [[Carol]] child of [[Bob]]
- [[Alice]] spouse of [[Dave]]
- [[Bob]] sibling of [[Eve]]
`;
    expect(parseRelationships(body)).toEqual([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Bob", b: "Carol", relation: "parent" },
      { a: "Alice", b: "Dave", relation: "spouse" },
      { a: "Bob", b: "Eve", relation: "sibling" },
    ]);
  });

  it("parses all four social relation phrases", () => {
    const body = `
## Relationships
- [[Alice]] friend of [[Bob]]
- [[Alice]] rival of [[Carol]]
- [[Alice]] enemy of [[Dave]]
- [[Alice]] romantic partner of [[Eve]]
`;
    expect(parseRelationships(body)).toEqual([
      { a: "Alice", b: "Bob", relation: "friend" },
      { a: "Alice", b: "Carol", relation: "rival" },
      { a: "Alice", b: "Dave", relation: "enemy" },
      { a: "Alice", b: "Eve", relation: "romantic" },
    ]);
  });

  it("is case-insensitive on the relation phrase and heading", () => {
    const body = "## relationships\n- [[Alice]] PARENT OF [[Bob]]\n";
    expect(parseRelationships(body)).toEqual([{ a: "Alice", b: "Bob", relation: "parent" }]);
  });

  it("ignores prose and unrelated headings, only reading lines under Relationships", () => {
    const body = `
## Overview
- [[Alice]] parent of [[Bob]]

## Relationships
- [[Carol]] parent of [[Dave]]
`;
    expect(parseRelationships(body)).toEqual([{ a: "Carol", b: "Dave", relation: "parent" }]);
  });

  it("merges multiple Relationships sections", () => {
    const body = `
## Relationships
- [[Alice]] parent of [[Bob]]

## Notes

## Relationships
- [[Carol]] spouse of [[Dave]]
`;
    expect(parseRelationships(body)).toEqual([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Carol", b: "Dave", relation: "spouse" },
    ]);
  });

  it("silently skips malformed lines instead of throwing", () => {
    const body = "## Relationships\n- Alice parent of Bob\n- [[Alice]] married to [[Bob]]\n- not a bullet at all\n";
    expect(parseRelationships(body)).toEqual([]);
  });

  it("returns nothing when there is no Relationships heading", () => {
    expect(parseRelationships("just prose, no relationships here")).toEqual([]);
  });
});

describe("computeFamilyTreeLayout", () => {
  it("assigns generation 0 to nodes with no recorded parent", () => {
    const layout = computeFamilyTreeLayout([{ a: "Alice", b: "Bob", relation: "spouse" }]);
    expect(layout.nodes.map((n) => ({ name: n.name, generation: n.generation }))).toEqual([
      { name: "Alice", generation: 0 },
      { name: "Bob", generation: 0 },
    ]);
  });

  it("stacks three generations by depth", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Grandpa", b: "Dad", relation: "parent" },
      { a: "Dad", b: "Kid", relation: "parent" },
    ]);
    const byName = Object.fromEntries(layout.nodes.map((n) => [n.name, n.generation]));
    expect(byName).toEqual({ Grandpa: 0, Dad: 1, Kid: 2 });
  });

  it("places declared spouse pairs adjacent within their row", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Carol", b: "Dave", relation: "spouse" },
      { a: "Carol", b: "Bob", relation: "parent" },
    ]);
    const row0 = layout.nodes.filter((n) => n.generation === 0).sort((x, y) => x.col - y.col);
    const names = row0.map((n) => n.name);
    const carolIdx = names.indexOf("Carol");
    const daveIdx = names.indexOf("Dave");
    expect(Math.abs(carolIdx - daveIdx)).toBe(1);
  });

  it("does not hang on a circular parent chain, falling back to generation 0", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Bob", b: "Alice", relation: "parent" },
    ]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.nodes.every((n) => Number.isFinite(n.generation))).toBe(true);
  });

  it("draws a parent-child line per recorded parent, and a spouse line per couple", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Alice", b: "Kid", relation: "parent" },
      { a: "Bob", b: "Kid", relation: "parent" },
      { a: "Alice", b: "Bob", relation: "spouse" },
    ]);
    expect(layout.lines).toEqual(
      expect.arrayContaining([
        { kind: "parent-child", from: "Alice", to: "Kid" },
        { kind: "parent-child", from: "Bob", to: "Kid" },
        { kind: "spouse", from: "Alice", to: "Bob" },
      ])
    );
  });

  it("omits a sibling line when the pair already shares a recorded parent", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Alice", b: "Carol", relation: "parent" },
      { a: "Bob", b: "Carol", relation: "sibling" },
    ]);
    expect(layout.lines.some((l) => l.kind === "sibling")).toBe(false);
  });

  it("keeps a sibling line when no shared parent is on record", () => {
    const layout = computeFamilyTreeLayout([{ a: "Bob", b: "Carol", relation: "sibling" }]);
    expect(layout.lines).toContainEqual({ kind: "sibling", from: "Bob", to: "Carol" });
  });

  it("draws one deduped line per social relation kind, independent of family structure", () => {
    const layout = computeFamilyTreeLayout([
      { a: "Alice", b: "Bob", relation: "friend" },
      { a: "Bob", b: "Alice", relation: "friend" }, // reverse phrasing of the same pair — should dedupe
      { a: "Carol", b: "Dave", relation: "rival" },
      { a: "Eve", b: "Frank", relation: "enemy" },
      { a: "Grace", b: "Hank", relation: "romantic" },
    ]);
    const friendLines = layout.lines.filter((l) => l.kind === "friend");
    expect(friendLines).toHaveLength(1);
    expect(new Set([friendLines[0].from, friendLines[0].to])).toEqual(new Set(["Alice", "Bob"]));
    expect(layout.lines).toContainEqual({ kind: "rival", from: "Carol", to: "Dave" });
    expect(layout.lines).toContainEqual({ kind: "enemy", from: "Eve", to: "Frank" });
    expect(layout.lines).toContainEqual({ kind: "romantic", from: "Grace", to: "Hank" });
  });

  it("places a person with only a social tie (no family relation) at generation 0", () => {
    const layout = computeFamilyTreeLayout([{ a: "Alice", b: "Bob", relation: "rival" }]);
    expect(layout.nodes.map((n) => n.generation)).toEqual([0, 0]);
  });
});

describe("checkRelationshipPlausibility", () => {
  it("flags a parent barely older than their recorded child", () => {
    const warnings = checkRelationshipPlausibility(
      [{ a: "Borin", b: "Finn", relation: "parent" }],
      new Map([
        ["Borin", 20],
        ["Finn", 12],
      ])
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("only 8 years older");
  });

  it("flags a parent who is not actually older than their child", () => {
    const warnings = checkRelationshipPlausibility(
      [{ a: "Borin", b: "Finn", relation: "parent" }],
      new Map([
        ["Borin", 10],
        ["Finn", 30],
      ])
    );
    expect(warnings[0].message).toContain("ages look swapped or wrong");
  });

  it("does not flag a normal parent/child age gap", () => {
    const warnings = checkRelationshipPlausibility(
      [{ a: "Borin", b: "Finn", relation: "parent" }],
      new Map([
        ["Borin", 45],
        ["Finn", 20],
      ])
    );
    expect(warnings).toEqual([]);
  });

  it("flags a large spouse or romantic-partner age gap as worth double-checking", () => {
    const warnings = checkRelationshipPlausibility(
      [
        { a: "Alice", b: "Bob", relation: "spouse" },
        { a: "Carol", b: "Dave", relation: "romantic" },
      ],
      new Map([
        ["Alice", 90],
        ["Bob", 25],
        ["Carol", 90],
        ["Dave", 25],
      ])
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.message.includes("worth double-checking"))).toBe(true);
  });

  it("does not flag a modest spouse/romantic age gap", () => {
    const warnings = checkRelationshipPlausibility(
      [{ a: "Alice", b: "Bob", relation: "spouse" }],
      new Map([
        ["Alice", 40],
        ["Bob", 35],
      ])
    );
    expect(warnings).toEqual([]);
  });

  it("never checks friend/rival/enemy/sibling regardless of age gap", () => {
    const warnings = checkRelationshipPlausibility(
      [
        { a: "Alice", b: "Bob", relation: "friend" },
        { a: "Alice", b: "Bob", relation: "rival" },
        { a: "Alice", b: "Bob", relation: "enemy" },
        { a: "Alice", b: "Bob", relation: "sibling" },
      ],
      new Map([
        ["Alice", 90],
        ["Bob", 5],
      ])
    );
    expect(warnings).toEqual([]);
  });

  it("silently skips any pair missing an age on either side", () => {
    const warnings = checkRelationshipPlausibility([{ a: "Alice", b: "Bob", relation: "parent" }], new Map([["Alice", 20]]));
    expect(warnings).toEqual([]);
  });
});

describe("addRelationshipEdge", () => {
  it("creates a new Relationships section when the body has none", () => {
    const body = addRelationshipEdge("", "Alice", "parent of", "Bob");
    expect(body).toBe("## Relationships\n- [[Alice]] parent of [[Bob]]\n");
    expect(parseRelationships(body)).toEqual([{ a: "Alice", b: "Bob", relation: "parent" }]);
  });

  it("appends to an existing Relationships section that runs to the end of the body", () => {
    const body = addRelationshipEdge("## Relationships\n- [[Alice]] parent of [[Bob]]\n", "Carol", "sibling of", "Bob");
    expect(parseRelationships(body)).toEqual([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Carol", b: "Bob", relation: "sibling" },
    ]);
  });

  it("appends before a following heading, keeping that section intact", () => {
    const body = addRelationshipEdge(
      "## Relationships\n- [[Alice]] parent of [[Bob]]\n\n## Notes\nSome prose\n",
      "Carol",
      "friend of",
      "Bob"
    );
    expect(parseRelationships(body)).toEqual([
      { a: "Alice", b: "Bob", relation: "parent" },
      { a: "Carol", b: "Bob", relation: "friend" },
    ]);
    expect(body).toContain("## Notes\nSome prose\n");
  });

  it("trims whitespace around the two names", () => {
    const body = addRelationshipEdge("", "  Alice  ", "parent of", "  Bob  ");
    expect(body).toBe("## Relationships\n- [[Alice]] parent of [[Bob]]\n");
  });

  it('resolves "child of" into a reversed parent edge, same as hand-typed text', () => {
    const body = addRelationshipEdge("", "Bob", "child of", "Alice");
    expect(parseRelationships(body)).toEqual([{ a: "Alice", b: "Bob", relation: "parent" }]);
  });
});

describe("removeRelationshipEdge", () => {
  it("removes the matching line and nothing else", () => {
    const body = "## Relationships\n- [[Alice]] parent of [[Bob]]\n- [[Carol]] sibling of [[Bob]]\n";
    const result = removeRelationshipEdge(body, { a: "Alice", b: "Bob", relation: "parent" });
    expect(parseRelationships(result)).toEqual([{ a: "Carol", b: "Bob", relation: "sibling" }]);
  });

  it('finds and removes a line that was originally written as "child of"', () => {
    const body = "## Relationships\n- [[Bob]] child of [[Alice]]\n";
    // parseRelationships resolves this line to {a: Alice, b: Bob, relation: parent} —
    // removal must be driven by that resolved edge, not the original text.
    const result = removeRelationshipEdge(body, { a: "Alice", b: "Bob", relation: "parent" });
    expect(parseRelationships(result)).toEqual([]);
  });

  it("leaves unrelated headings and prose untouched", () => {
    const body = "## Relationships\n- [[Alice]] parent of [[Bob]]\n\n## Notes\nSome prose\n";
    const result = removeRelationshipEdge(body, { a: "Alice", b: "Bob", relation: "parent" });
    expect(result).toContain("## Notes\nSome prose\n");
    expect(parseRelationships(result)).toEqual([]);
  });

  it("is a no-op when the target edge is not present", () => {
    const body = "## Relationships\n- [[Alice]] parent of [[Bob]]\n";
    const result = removeRelationshipEdge(body, { a: "Carol", b: "Dave", relation: "friend" });
    expect(result).toBe(body);
  });
});
