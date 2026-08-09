import { describe, it, expect } from "vitest";
import { parseRelationships } from "../src/lib/familyTreeRelationships";

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

  it("skips lines that don't match the [[A]] <relation> [[B]] shape", () => {
    const body = `
## Relationships
- [[Alice]] parent of [[Bob]]
Just some prose about the family.
- not a relationship line
`;
    expect(parseRelationships(body)).toEqual([{ a: "Alice", b: "Bob", relation: "parent" }]);
  });

  it("returns an empty array when there's no Relationships section", () => {
    expect(parseRelationships("Just a plain note body.")).toEqual([]);
  });
});
