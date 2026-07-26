import { describe, it, expect } from "vitest";
import {
  tokenize,
  extractSearchableText,
  buildSnippet,
  matchesAllTokens,
  SNIPPET_MATCH_START,
  SNIPPET_MATCH_END,
} from "../src/lib/search";

describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("Fighter Champion")).toEqual(["fighter", "champion"]);
  });

  it("collapses repeated whitespace and trims", () => {
    expect(tokenize("  Fighter   Champion  ")).toEqual(["fighter", "champion"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("extractSearchableText", () => {
  it("returns a single string as-is", () => {
    expect(extractSearchableText("Fighter")).toEqual(["Fighter"]);
  });

  it("flattens an array of strings", () => {
    expect(extractSearchableText(["a", "b"])).toEqual(["a", "b"]);
  });

  it("recursively flattens a nested object", () => {
    expect(extractSearchableText({ class: "Fighter", stats: { subclass: "Champion" } })).toEqual([
      "Fighter",
      "Champion",
    ]);
  });

  it("ignores non-string primitives", () => {
    expect(extractSearchableText({ level: 5, active: true, name: "Alice" })).toEqual(["Alice"]);
  });
});

describe("matchesAllTokens", () => {
  it("requires every token to be present, case-insensitively", () => {
    expect(matchesAllTokens("A Fighter named Alice", ["fighter", "alice"])).toBe(true);
    expect(matchesAllTokens("A Fighter named Alice", ["fighter", "bob"])).toBe(false);
  });
});

describe("buildSnippet", () => {
  it("returns null when no token matches", () => {
    expect(buildSnippet("A Fighter named Alice", ["wizard"])).toBeNull();
  });

  it("wraps the matched token with the marker characters, no ellipsis when the whole text fits", () => {
    const result = buildSnippet("A Fighter named Alice", ["fighter"]);
    expect(result).toBe(`A ${SNIPPET_MATCH_START}Fighter${SNIPPET_MATCH_END} named Alice`);
  });

  it("picks whichever token occurs earliest in the text", () => {
    const result = buildSnippet("A Fighter named Alice", ["alice", "fighter"]);
    expect(result).toBe(`A ${SNIPPET_MATCH_START}Fighter${SNIPPET_MATCH_END} named Alice`);
  });

  it("adds an ellipsis on whichever side is truncated", () => {
    const text = "x".repeat(60) + "fighter" + "y".repeat(60);
    const result = buildSnippet(text, ["fighter"]);
    expect(result?.startsWith("…")).toBe(true);
    expect(result?.endsWith("…")).toBe(true);
    expect(result).toContain(`${SNIPPET_MATCH_START}fighter${SNIPPET_MATCH_END}`);
  });
});
