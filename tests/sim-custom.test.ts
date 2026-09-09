import { describe, expect, it } from "vitest";
import { loadCustomMonsters, exportCustomMonsters } from "../src/lib/sim/ui";
import { runScenarioOnce, runScenario, standardParty } from "../src/lib/sim/engine/scenario";
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
