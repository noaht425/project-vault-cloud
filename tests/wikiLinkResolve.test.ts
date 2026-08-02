import { describe, it, expect } from "vitest";
import { resolveWikiLinkTitle } from "../src/lib/wikiLinkResolve";

describe("resolveWikiLinkTitle", () => {
  it("finds a case-insensitive exact match", () => {
    const matches = [{ id: "1", name: "Alice" }];
    expect(resolveWikiLinkTitle(matches, "alice")).toBe("1");
  });

  it("picks the exact match out of several substring matches", () => {
    const matches = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Alice's Tavern" },
    ];
    expect(resolveWikiLinkTitle(matches, "Alice")).toBe("1");
  });

  it("returns null when there's no exact match", () => {
    const matches = [{ id: "2", name: "Alice's Tavern" }];
    expect(resolveWikiLinkTitle(matches, "Alice")).toBeNull();
  });

  it("returns null for an empty match list", () => {
    expect(resolveWikiLinkTitle([], "Alice")).toBeNull();
  });
});
