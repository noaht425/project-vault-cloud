import { describe, it, expect } from "vitest";
import { extractWikiLinkTitles } from "../src/lib/wikiLinks";

describe("extractWikiLinkTitles", () => {
  it("extracts a plain [[Title]] link", () => {
    expect(extractWikiLinkTitles("See [[Alice]] for details.")).toEqual(["Alice"]);
  });

  it("extracts the title from [[Title|Alias]], ignoring the alias", () => {
    expect(extractWikiLinkTitles("[[Alice|the queen]] ruled here.")).toEqual(["Alice"]);
  });

  it("extracts the title from [[Title#Heading]], ignoring the heading", () => {
    expect(extractWikiLinkTitles("[[Alice#Early Life]] was interesting.")).toEqual(["Alice"]);
  });

  it("extracts multiple links in order, allowing duplicates", () => {
    expect(extractWikiLinkTitles("[[Alice]] met [[Bob]] then [[Alice]] again.")).toEqual([
      "Alice",
      "Bob",
      "Alice",
    ]);
  });

  it("trims whitespace inside the brackets", () => {
    expect(extractWikiLinkTitles("[[  Alice  ]]")).toEqual(["Alice"]);
  });

  it("returns an empty array when there are no links", () => {
    expect(extractWikiLinkTitles("Just plain text.")).toEqual([]);
  });

  it("skips an empty [[]] rather than emitting a blank title", () => {
    expect(extractWikiLinkTitles("[[]] and [[Alice]]")).toEqual(["Alice"]);
  });
});
