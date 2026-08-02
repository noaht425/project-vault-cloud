import { describe, it, expect } from "vitest";
import { abilityModifier, formatModifier } from "../src/lib/noteTypes/creatureStats";
import { defaultPcFrontmatter, pcFrontmatterSchema } from "../src/lib/noteTypes/pc";
import { defaultNpcFrontmatter, npcFrontmatterSchema } from "../src/lib/noteTypes/npc";

describe("abilityModifier", () => {
  it("computes the standard D&D modifier table at a few known points", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(20)).toBe(5);
  });
});

describe("formatModifier", () => {
  it("prefixes non-negative modifiers with +", () => {
    expect(formatModifier(10)).toBe("+0");
    expect(formatModifier(12)).toBe("+1");
  });

  it("leaves negative modifiers with their own -", () => {
    expect(formatModifier(8)).toBe("-1");
  });
});

describe("defaultPcFrontmatter", () => {
  it("fills in sane defaults for every field", () => {
    expect(defaultPcFrontmatter()).toEqual({
      type: "pc",
      tags: [],
      class: "",
      subclass: "",
      classRef: "",
      level: 1,
      race: "",
      ac: 10,
      hp: 10,
      maxHp: 10,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    });
  });
});

describe("pcFrontmatterSchema", () => {
  it("coerces a hand-edited string field back to a number instead of throwing", () => {
    const parsed = pcFrontmatterSchema.parse({ type: "pc", ac: "15", level: "3" });
    expect(parsed.ac).toBe(15);
    expect(parsed.level).toBe(3);
  });

  it("falls back to defaults for malformed fields rather than throwing", () => {
    const parsed = pcFrontmatterSchema.parse({ type: "pc", ac: "not a number", stats: "garbage" });
    expect(parsed.ac).toBe(10);
    expect(parsed.stats).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  });
});

describe("defaultNpcFrontmatter", () => {
  it("fills in sane defaults, with age unset (unknown, not 0)", () => {
    expect(defaultNpcFrontmatter()).toEqual({
      type: "npc",
      tags: [],
      role: "",
      cr: "",
      ac: 10,
      hp: 10,
      maxHp: 10,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      age: null,
    });
  });
});

describe("npcFrontmatterSchema", () => {
  it("accepts a set age", () => {
    expect(npcFrontmatterSchema.parse({ type: "npc", age: 34 }).age).toBe(34);
  });

  it("falls back to null for a malformed age rather than throwing", () => {
    expect(npcFrontmatterSchema.parse({ type: "npc", age: -5 }).age).toBeNull();
  });
});
