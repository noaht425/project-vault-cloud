import { describe, expect, it } from "vitest";
import {
  loadCustomMonsters,
  exportCustomMonsters,
  draftToCombatant,
  emptyDraft,
  suggestedPb,
  parseStatblock,
  extractStatblockSection,
  npcNoteToMonster,
  pcNoteToCombatant,
  parseClassRefFeatures,
} from "../src/lib/sim/ui";
import { runScenarioOnce, runScenario, standardParty, buildParty } from "../src/lib/sim/engine/scenario";
import { parseCombatant, type Combatant } from "../src/lib/sim/schema";

const brute = (id: string): Combatant =>
  parseCombatant({
    id,
    name: `Brute ${id}`,
    kind: "monster",
    cr: "8",
    ac: 17,
    maxHp: "12d10+60",
    abilities: { str: 20, dex: 10, con: 20, int: 6, wis: 10, cha: 8 },
    pb: 3,
    actions: [
      {
        id: "smash",
        name: "Smash",
        cost: { action: 1 },
        recharge: "none",
        automation: [
          { type: "target", who: { who: "aiChoice" }, effects: [{ type: "attack", bonus: 9, onHit: [{ type: "damage", amount: "2d10+5", damageType: "bludgeoning" }] }] },
        ],
      },
    ],
  });

const summoner = (): Combatant =>
  parseCombatant({
    id: "custom-summoner",
    name: "Custom Summoner",
    kind: "monster",
    cr: "12",
    ac: 18,
    maxHp: "16d10+96",
    abilities: { str: 16, dex: 14, con: 22, int: 16, wis: 14, cha: 18 },
    pb: 5,
    actions: [
      {
        id: "call",
        name: "Call the Brutes",
        cost: { action: 1 },
        recharge: "none",
        automation: [{ type: "summon", statBlock: "custom-add", count: "2", max: 4 }],
      },
      {
        id: "zap",
        name: "Zap",
        cost: { action: 1 },
        recharge: "none",
        automation: [
          { type: "target", who: { who: "aiChoice" }, effects: [{ type: "attack", bonus: 10, onHit: [{ type: "damage", amount: "3d8+4", damageType: "force" }] }] },
        ],
      },
    ],
  });

describe("custom monster loading", () => {
  it("parses a { monsters: [...] } pack, a bare array, and reports junk", () => {
    const a = loadCustomMonsters({ monsters: [brute("a"), brute("b")] });
    expect(a.monsters.map((m) => m.id)).toEqual(["a", "b"]);
    expect(a.errors).toEqual([]);

    const b = loadCustomMonsters([brute("c")]);
    expect(b.monsters).toHaveLength(1);

    const c = loadCustomMonsters({ monsters: [brute("d"), { name: "broken", kind: "monster" }] });
    expect(c.monsters.map((m) => m.id)).toEqual(["d"]);
    expect(c.errors).toHaveLength(1);

    const d = loadCustomMonsters("not json{");
    expect(d.monsters).toEqual([]);
    expect(d.errors[0]).toMatch(/not valid JSON/);

    const e = loadCustomMonsters({ monsters: [brute("x"), brute("x")] });
    expect(e.monsters).toHaveLength(1);
    expect(e.errors[0]).toMatch(/duplicate id/);
  });

  it("round-trips through export", () => {
    const pack = [brute("a"), brute("b")];
    const back = loadCustomMonsters(exportCustomMonsters(pack));
    expect(back.monsters.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("resolves a custom monster as an enemy via extraById", () => {
    const extraById = { "custom-brute": brute("custom-brute") };
    const { result } = runScenarioOnce({ party: standardParty(10), enemies: ["custom-brute x2"], seed: 1, extraById });
    expect(["party", "monster", "draw"]).toContain(result.winner);
    expect(result.contributions.some((c) => c.name.startsWith("Brute custom-brute"))).toBe(true);
  });

  it("a custom summoner's summon node resolves against the same custom pack", () => {
    const extraById = { "custom-summoner": summoner(), "custom-add": brute("custom-add") };
    const { result, log } = runScenarioOnce({ party: standardParty(12), enemies: ["custom-summoner"], seed: 2, extraById });
    expect(["party", "monster", "draw"]).toContain(result.winner);
    expect(log.some((l) => /raises \d+× Brute custom-add/.test(l))).toBe(true);
  });

  it("a custom pack still runs a full Monte-Carlo", () => {
    const extraById = { "custom-brute": brute("custom-brute") };
    const mc = runScenario({ party: standardParty(10), enemies: ["custom-brute"], trials: 60, extraById });
    expect(mc.partyWinRate).toBeGreaterThanOrEqual(0);
    expect(mc.partyWinRate).toBeLessThanOrEqual(1);
  });
});

describe('"make a monster" builder', () => {
  it("suggestedPb follows the DMG CR table", () => {
    expect(suggestedPb("2")).toBe(2);
    expect(suggestedPb("10")).toBe(4);
    expect(suggestedPb("17")).toBe(6);
    expect(suggestedPb("30")).toBe(9);
    expect(suggestedPb("1/2")).toBe(2);
  });

  it("assembles the default draft into a schema-valid, fightable combatant", () => {
    const draft = { ...emptyDraft(), name: "Test Golem" };
    const { combatant, error, warnings } = draftToCombatant(draft);
    expect(error).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(combatant!.name).toBe("Test Golem");
    expect(combatant!.id).toMatch(/^test-golem-[a-z0-9]{4}$/);
    // 2× Strike ⇒ a multiattack plus the Strike action
    expect(combatant!.actions.map((a) => a.id)).toContain("multiattack");
    expect(combatant!.actions.map((a) => a.id)).toContain("strike");

    const extraById = { [combatant!.id]: combatant! };
    const { result } = runScenarioOnce({ party: standardParty(10), enemies: [combatant!.id], seed: 1, extraById });
    expect(["party", "monster", "draw"]).toContain(result.winner);
  });

  it("carries an AoE, defenses and legendary actions through", () => {
    const draft = {
      ...emptyDraft(),
      name: "Cinder Wyrm",
      cr: "13",
      attacks: [{ name: "Bite", toHit: 12, dice: "2d10+7", type: "piercing" as const, count: 1 }],
      aoe: { name: "Fire Breath", shape: "cone" as const, size: 30, ability: "dex" as const, dc: 18, dice: "12d6", type: "fire" as const, recharge: "roll:5-6" as const },
      damage: { ...emptyDraft().damage, fire: "immune" as const, cold: "vuln" as const },
      legendary: true,
      legendaryBudget: 3,
      legendaryAttacks: ["Bite"],
    };
    const { combatant, error } = draftToCombatant(draft);
    expect(error).toBeUndefined();
    expect(combatant!.immunities).toContain("fire");
    expect(combatant!.vulnerabilities).toContain("cold");
    expect(combatant!.actions.find((a) => a.id === "area")?.recharge).toBe("roll:5-6");
    expect(combatant!.legendaryActions?.budget).toBe(3);
    expect(combatant!.legendaryActions?.options.map((o) => o.action)).toEqual(["bite"]);
  });

  it("rejects an empty name or a monster with nothing to do", () => {
    expect(draftToCombatant({ ...emptyDraft(), name: "" }).error).toMatch(/name/i);
    expect(draftToCombatant({ ...emptyDraft(), name: "Blob", attacks: [], aoe: null }).error).toMatch(/attack|area/i);
  });

  it("a builder monster round-trips through export / load", () => {
    const { combatant } = draftToCombatant({ ...emptyDraft(), name: "Round Trip" });
    const back = loadCustomMonsters(exportCustomMonsters([combatant!]));
    expect(back.errors).toEqual([]);
    expect(back.monsters[0].name).toBe("Round Trip");
  });
});

describe("paste / import a statblock", () => {
  const DRAGON_MD = `## Adult Red Dragon
*Huge dragon, chaotic evil*
**Armor Class** 19 (natural armor)
**Hit Points** 256 (19d12 + 133)
| STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|
| 27 (+8) | 10 (+0) | 25 (+7) | 16 (+3) | 13 (+1) | 23 (+6) |
**Saving Throws** Dex +6, Con +13, Wis +7, Cha +11
**Damage Immunities** fire
**Condition Immunities** frightened
**Challenge** 17 (18,000 XP)   **Proficiency Bonus** +6
### Actions
***Multiattack.*** The dragon makes three attacks: one with its bite and two with its claws.
***Bite.*** *Melee Weapon Attack:* +14 to hit, reach 10 ft., one target. *Hit:* 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.
***Claw.*** *Melee Weapon Attack:* +14 to hit, reach 5 ft., one target. *Hit:* 15 (2d6 + 8) slashing damage.
***Fire Breath (Recharge 5-6).*** The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.
### Legendary Actions
The dragon can take 3 legendary actions.
***Tail Attack.*** The dragon makes a tail attack.`;

  it("reads a 2014-style markdown stat block into a valid, fightable draft", () => {
    const { draft, error } = parseStatblock(DRAGON_MD);
    expect(error).toBeUndefined();
    expect(draft!.name).toBe("Adult Red Dragon");
    expect(draft!.size).toBe("huge");
    expect(draft!.ac).toBe(19);
    expect(draft!.hp).toBe("19d12+133");
    expect(draft!.abilities).toEqual({ str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 23 });
    expect(draft!.proficientSaves.sort()).toEqual(["cha", "con", "dex", "wis"]);
    expect(draft!.damage.fire).toBe("immune");
    expect(draft!.conditionImmunities).toContain("frightened");
    expect(draft!.cr).toBe("17");
    expect(draft!.pb).toBe(6);
    const bite = draft!.attacks.find((a) => a.name === "Bite")!;
    expect(bite.toHit).toBe(14);
    expect(bite.dice).toBe("2d10+8");
    expect(bite.type).toBe("piercing");
    expect(bite.count).toBe(1);
    expect(draft!.attacks.find((a) => a.name === "Claw")!.count).toBe(2);
    expect(draft!.aoe?.dc).toBe(21);
    expect(draft!.aoe?.dice).toBe("18d6");
    expect(draft!.aoe?.size).toBe(60);
    expect(draft!.aoe?.recharge).toBe("roll:5-6");
    expect(draft!.legendary).toBe(true);
    expect(draft!.legendaryBudget).toBe(3);
    const { combatant, error: e2 } = draftToCombatant(draft!);
    expect(e2).toBeUndefined();
    expect(combatant!.actions.map((a) => a.id)).toContain("multiattack");
  });

  it("reads a compact inline-ability stat block", () => {
    const md = `**Goblin Boss**
**Armor Class** 17 (chain shirt, shield)
**Hit Points** 21 (6d6)
**STR** 10 **DEX** 14 **CON** 10 **INT** 10 **WIS** 8 **CHA** 10
**Challenge** 1 (200 XP)
### Actions
***Multiattack.*** The goblin boss makes two attacks with its scimitar.
***Scimitar.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.`;
    const { draft, error } = parseStatblock(md);
    expect(error).toBeUndefined();
    expect(draft!.name).toBe("Goblin Boss");
    expect(draft!.ac).toBe(17);
    expect(draft!.abilities.dex).toBe(14);
    expect(draft!.cr).toBe("1");
    const sci = draft!.attacks.find((a) => a.name === "Scimitar")!;
    expect(sci.toHit).toBe(4);
    expect(sci.dice).toBe("1d6+2");
    expect(sci.count).toBe(2);
  });

  it("reads a 5e.tools bestiary JSON entry (with its @-tags)", () => {
    const json = JSON.stringify({
      name: "Ogre",
      size: ["L"],
      type: "giant",
      ac: [{ ac: 11, from: ["hide armor"] }],
      hp: { average: 59, formula: "7d10 + 21" },
      str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
      cr: "2",
      immune: ["fire"],
      action: [{ name: "Greatclub", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}13 ({@damage 2d8 + 4}) bludgeoning damage."] }],
    });
    const { draft, error } = parseStatblock(json);
    expect(error).toBeUndefined();
    expect(draft!.name).toBe("Ogre");
    expect(draft!.size).toBe("large");
    expect(draft!.ac).toBe(11);
    expect(draft!.hp).toBe("7d10+21");
    expect(draft!.abilities.str).toBe(19);
    expect(draft!.damage.fire).toBe("immune");
    const gc = draft!.attacks.find((a) => a.name === "Greatclub")!;
    expect(gc.toHit).toBe(6);
    expect(gc.dice).toBe("2d8+4");
    expect(gc.type).toBe("bludgeoning");
  });

  it("extracts a '## Stat Block' section (keeping its ### sub-headings)", () => {
    const body = `Prose about the villain.

## Stat Block

**Armor Class** 16
**Hit Points** 90 (12d10 + 24)
**STR** 18 **DEX** 12 **CON** 15 **INT** 10 **WIS** 12 **CHA** 14
**Challenge** 6
### Actions
***Longsword.*** *Melee Weapon Attack:* +7 to hit, reach 5 ft. *Hit:* 8 (1d8 + 4) slashing damage.

## Notes
He hates dogs.`;
    const section = extractStatblockSection(body)!;
    expect(section).toContain("### Actions");
    expect(section).not.toContain("hates dogs");

    const { combatant, error } = npcNoteToMonster({ title: "Sir Villain", body });
    expect(error).toBeUndefined();
    expect(combatant!.name).toBe("Sir Villain");
    expect(combatant!.ac).toBe(16);
    expect(combatant!.actions.some((a) => a.id === "longsword")).toBe(true);
  });

  it("falls back to frontmatter + a generic attack when a note has no stat block", () => {
    const { combatant, warnings } = npcNoteToMonster({
      title: "Random Bandit",
      body: "Just a guy.",
      frontmatter: { ac: 13, maxHp: 27, cr: "1/2", stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 10 } },
    });
    expect(combatant!.name).toBe("Random Bandit");
    expect(combatant!.ac).toBe(13);
    expect(combatant!.actions.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/no "## Stat Block"|generic/i);
  });

  it("a parsed monster runs a fight", () => {
    const { draft } = parseStatblock(DRAGON_MD);
    const { combatant } = draftToCombatant(draft!);
    const extraById = { [combatant!.id]: combatant! };
    const { result } = runScenarioOnce({ party: standardParty(16), enemies: [combatant!.id], seed: 1, extraById });
    expect(["party", "monster", "draw"]).toContain(result.winner);
  });
});

describe("import a PC from its note", () => {
  const pc = (over: Record<string, unknown>): { title: string; frontmatter: Record<string, unknown> } => ({
    title: String(over.name ?? "PC"),
    frontmatter: { type: "pc", level: 12, ac: 17, maxHp: 100, stats: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 10 }, ...over },
  });

  it("builds a martial PC from the note's real stats + class rules", () => {
    const r = pcNoteToCombatant(pc({ name: "Bront", class: "Battlemaster Fighter", level: 14, ac: 19, maxHp: 148, stats: { str: 20, dex: 14, con: 16, int: 10, wis: 12, cha: 8 } }));
    expect(r.error).toBeUndefined();
    const c = r.spec!.combatant;
    expect(c.kind).toBe("pc");
    expect(c.level).toBe(14);
    expect(c.ac).toBe(19);
    expect(c.maxHp).toBe(148);
    expect(c.abilities.str).toBe(20);
    expect(c.pb).toBe(5);
    expect(c.proficientSaves.sort()).toEqual(["con", "str"]);
    // Extra Attack 3 at fighter 11+: the attack action swings 3 times
    const atk = c.actions.find((a) => a.id === "attack")!;
    const effects = (atk.automation[0] as { effects: unknown[] }).effects;
    expect(effects.length).toBe(3);
    // to-hit uses the real STR mod (+5) + PB (+5)
    expect((effects[0] as { bonus: number }).bonus).toBe(10);
  });

  it("builds a real spellcaster with the note's casting stat", () => {
    const r = pcNoteToCombatant(pc({ name: "Ari", class: "Evocation Wizard", level: 15, ac: 15, maxHp: 92, stats: { str: 8, dex: 14, con: 14, int: 20, wis: 12, cha: 10 } }));
    expect(r.error).toBeUndefined();
    const c = r.spec!.combatant;
    expect(c.templateId).toBe("wizard");
    // real slot-backed spell actions
    expect(c.actions.filter((a) => a.isSpell && a.limitedUse?.resource.startsWith("slot")).length).toBeGreaterThan(15);
    expect(c.abilities.int).toBe(20);
  });

  it("a paladin keeps a weapon attack + spell slots and shares its aura", () => {
    const sera = pcNoteToCombatant(pc({ name: "Sera", class: "Devotion Paladin", level: 12, ac: 20, maxHp: 118, stats: { str: 18, dex: 10, con: 16, int: 8, wis: 12, cha: 18 } }));
    const c = sera.spec!.combatant;
    expect(c.templateId).toBe("paladin");
    expect(c.actions.some((a) => a.id === "attack")).toBe(true);
    expect(c.actions.some((a) => a.isSpell)).toBe(true);
    const bront = pcNoteToCombatant(pc({ name: "Bront", class: "Fighter", level: 12 })).spec!.combatant;
    const party = buildParty([
      { template: "x", level: 12, combatant: c, name: "Sera" },
      { template: "x", level: 12, combatant: bront, name: "Bront" },
    ]);
    const paladin = party.find((p) => p.templateId === "paladin")!;
    if (paladin.saveBonusAll > 0) {
      expect(party.find((p) => p.name === "Bront")!.saveBonusAll).toBeGreaterThanOrEqual(paladin.saveBonusAll);
    }
  });

  it("an unrecognised class falls back to a template with the PC's real stats", () => {
    const r = pcNoteToCombatant(pc({ name: "Nyx", class: "Blood Hunter", level: 10, ac: 16, maxHp: 84, stats: { str: 17, dex: 15, con: 14, int: 12, wis: 10, cha: 10 } }));
    expect(r.error).toBeUndefined();
    expect(r.spec!.combatant.ac).toBe(16);
    expect(r.spec!.combatant.abilities.str).toBe(17);
    expect(r.warnings.join(" ")).toMatch(/unrecognised class/i);
  });

  it("reads Extra Attack / a homebrew Sneak buff / Rage / Uncanny Dodge out of a class-reference body", () => {
    const body = `## Level 2
Cunning Action.
## Level 5 Extra Attack
You can attack twice.
## Level 11
You can attack three times when you take the Attack action.
## Level 3
Your Sneak Attack deals an extra 8d6 damage instead of the normal amount.
## Level 5 Uncanny Dodge
Use your reaction to halve an attack's damage.
## Level 6
Path of the Berserker. You gain Rage.`;
    const f6 = parseClassRefFeatures(body, 6);
    expect(f6.extraAttack).toBe(2);
    expect(f6.sneakDice).toBe(8); // above the by-level baseline -> an explicit override
    expect(f6.rage).toBe(true);
    expect(f6.uncannyDodge).toBe(true);
    const f12 = parseClassRefFeatures(body, 12);
    expect(f12.extraAttack).toBe(3);
    // a ref that only quotes the level-1 "1d6" is ignored (the by-level table wins)
    expect(parseClassRefFeatures("## Level 1 Sneak Attack\nyou deal an extra 1d6 damage; it increases per the table.", 13).sneakDice).toBeUndefined();
  });

  it("a class reference bumps the attack count on the built PC", () => {
    const classRefBody = "## Level 5\nExtra Attack.\n## Level 11\nYou can attack three times.\n## Level 20\nYou can attack four times.";
    const r = pcNoteToCombatant({ ...pc({ name: "Bront", class: "Fighter", level: 11 }), classRefBody });
    const atk = r.spec!.combatant.actions.find((a) => a.id === "attack")!;
    expect((atk.automation[0] as { effects: unknown[] }).effects.length).toBe(3);
    expect(r.warnings.join(" ")).toMatch(/class reference: .*Extra Attack \(3\)/);
  });

  it("an imported PC actually fights", () => {
    const c = pcNoteToCombatant(pc({ name: "Bront", class: "Fighter", level: 14, ac: 19, maxHp: 148, stats: { str: 20, dex: 12, con: 16, int: 10, wis: 12, cha: 8 } })).spec!.combatant;
    const { result } = runScenarioOnce({ party: [{ template: "x", level: 14, combatant: c, name: "Bront" }], enemies: ["gladiator"], seed: 3 });
    expect(["party", "monster", "draw"]).toContain(result.winner);
    expect(result.contributions.some((x) => x.name === "Bront")).toBe(true);
  });
});
