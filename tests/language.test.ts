import { describe, it, expect } from "vitest";
import { parseWordEntries, parseGrammarRules, stripStructuredSections } from "../src/lib/noteTypes/language";

describe("parseWordEntries", () => {
  it("splits content into word entries, sorted alphabetically", () => {
    const body = `
## Word: keth

water. Noun.

## Word: aro

fire. Noun.
`;
    expect(parseWordEntries(body)).toEqual([
      { word: "aro", meaning: null, partOfSpeech: null, gender: null, content: "fire. Noun." },
      { word: "keth", meaning: null, partOfSpeech: null, gender: null, content: "water. Noun." },
    ]);
  });

  it("matches with no space between ## and Word, and no colon", () => {
    const body = "##Word keth\n\nwater\n\n## Word:aro\n\nfire\n";
    const entries = parseWordEntries(body);
    expect(entries.map((e) => e.word)).toEqual(["aro", "keth"]);
  });

  it("does not treat ordinary headings as dictionary entries", () => {
    const body = "## Phonology\n\nSome notes about sounds.\n\n## Word: keth\n\nwater\n";
    const entries = parseWordEntries(body);
    expect(entries).toEqual([{ word: "keth", meaning: null, partOfSpeech: null, gender: null, content: "water" }]);
  });

  it("pulls out optional Meaning/POS/Gender lines into their own fields", () => {
    const body = "## Word: keth\n\nMeaning: water\nPOS: noun\nGender: feminine\n\nSacred to the river clans.\n";
    const entries = parseWordEntries(body);
    expect(entries).toEqual([
      { word: "keth", meaning: "water", partOfSpeech: "noun", gender: "feminine", content: "Sacred to the river clans." },
    ]);
  });
});

describe("parseGrammarRules", () => {
  it("splits content into named grammar rules", () => {
    const body = "## Grammar: Word Order\n\nSubject-Object-Verb.\n\n## Grammar: Plural\n\nAdd -eth suffix.\n";
    expect(parseGrammarRules(body)).toEqual([
      { name: "Word Order", content: "Subject-Object-Verb." },
      { name: "Plural", content: "Add -eth suffix." },
    ]);
  });

  it("requires the colon, so a plain heading is not treated as a rule", () => {
    const body = "## Grammar Notes\n\nVerbs conjugate by tense.\n";
    expect(parseGrammarRules(body)).toEqual([]);
  });
});

describe("stripStructuredSections", () => {
  it("removes word-entry and grammar-rule sections but keeps everything else, in order", () => {
    const body =
      "## Word: keth\n\nwater\n\n## Grammar: Word Order\n\nSOV.\n\n## Phonology\n\nsome notes\n\n## Word: aro\n\nfire\n";
    expect(stripStructuredSections(body)).toBe("## Phonology\n\nsome notes\n\n");
  });

  it("returns the body unchanged when there are no structured sections", () => {
    const body = "## Phonology\n\nsome notes\n";
    expect(stripStructuredSections(body)).toBe(body);
  });
});
