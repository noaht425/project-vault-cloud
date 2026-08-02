import { describe, it, expect } from "vitest";
import { parseSnippet } from "../src/lib/searchSnippet";

const START = "\x01";
const END = "\x02";

describe("parseSnippet", () => {
  it("splits text around one highlighted match", () => {
    expect(parseSnippet(`the ${START}quick${END} fox`)).toEqual([
      { text: "the ", highlighted: false },
      { text: "quick", highlighted: true },
      { text: " fox", highlighted: false },
    ]);
  });

  it("handles a match at the very start", () => {
    expect(parseSnippet(`${START}quick${END} fox`)).toEqual([
      { text: "quick", highlighted: true },
      { text: " fox", highlighted: false },
    ]);
  });

  it("handles a match at the very end", () => {
    expect(parseSnippet(`the ${START}quick${END}`)).toEqual([
      { text: "the ", highlighted: false },
      { text: "quick", highlighted: true },
    ]);
  });

  it("returns a single unhighlighted segment for plain text with no markers", () => {
    expect(parseSnippet("just plain text")).toEqual([{ text: "just plain text", highlighted: false }]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseSnippet("")).toEqual([]);
  });

  it("treats an unterminated marker as highlighted through to the end", () => {
    expect(parseSnippet(`before ${START}unterminated`)).toEqual([
      { text: "before ", highlighted: false },
      { text: "unterminated", highlighted: true },
    ]);
  });
});
