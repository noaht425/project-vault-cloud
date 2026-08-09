import { describe, it, expect } from "vitest";
import {
  buildCombatants,
  rollInitiativeFor,
  sortedTurnOrder,
  advanceTurn,
  endEncounter,
  applyHpDelta,
  addCondition,
  removeCondition,
  type Combatant,
  type Encounter,
} from "../src/lib/initiative";

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function sequenceIds(ids: string[]): () => string {
  let i = 0;
  return () => ids[Math.min(i++, ids.length - 1)];
}

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: "c1",
    name: "Goblin",
    sourceNoteTitle: null,
    ac: 12,
    maxHp: 7,
    currentHp: 7,
    initiativeBonus: 0,
    initiative: null,
    conditions: [],
    isPc: false,
    ...overrides,
  };
}

describe("buildCombatants", () => {
  it("keeps a plain name when count is 1", () => {
    const [combatant] = buildCombatants(
      { name: "Goblin", sourceNoteTitle: null, ac: 12, maxHp: 7, initiativeBonus: 1, isPc: false, count: 1 },
      sequenceIds(["id-1"])
    );
    expect(combatant.name).toBe("Goblin");
    expect(combatant.currentHp).toBe(7);
    expect(combatant.initiative).toBeNull();
  });

  it("numbers combatants when count is greater than 1", () => {
    const combatants = buildCombatants(
      { name: "Goblin", sourceNoteTitle: null, ac: 12, maxHp: 7, initiativeBonus: 1, isPc: false, count: 3 },
      sequenceIds(["id-1", "id-2", "id-3"])
    );
    expect(combatants.map((c) => c.name)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]);
  });

  it("starts at startingHp when given (a note-sourced combatant already wounded)", () => {
    const [combatant] = buildCombatants(
      { name: "Bandit", sourceNoteTitle: "Bandit", ac: 12, maxHp: 11, startingHp: 4, initiativeBonus: 0, isPc: false, count: 1 },
      sequenceIds(["a"])
    );
    expect(combatant.currentHp).toBe(4);
    expect(combatant.maxHp).toBe(11);
  });
});

describe("rollInitiativeFor", () => {
  it("adds a positive initiative bonus", () => {
    const rng = sequenceRng([14 / 20]); // -> 15
    expect(rollInitiativeFor(makeCombatant({ initiativeBonus: 3 }), rng)).toBe(18);
  });

  it("subtracts a negative initiative bonus", () => {
    const rng = sequenceRng([14 / 20]); // -> 15
    expect(rollInitiativeFor(makeCombatant({ initiativeBonus: -2 }), rng)).toBe(13);
  });
});

describe("sortedTurnOrder", () => {
  it("sorts by initiative descending, then bonus, then name", () => {
    const combatants = [
      makeCombatant({ id: "a", name: "Aldric", initiative: 15, initiativeBonus: 1 }),
      makeCombatant({ id: "b", name: "Bandit", initiative: 15, initiativeBonus: 2 }),
      makeCombatant({ id: "c", name: "Cleric", initiative: 20 }),
    ];
    expect(sortedTurnOrder(combatants).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts un-rolled combatants (initiative null) after every rolled one", () => {
    const combatants = [
      makeCombatant({ id: "a", initiative: null }),
      makeCombatant({ id: "b", initiative: 5 }),
    ];
    expect(sortedTurnOrder(combatants).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("advanceTurn", () => {
  const combatants = [
    makeCombatant({ id: "a", initiative: 20 }),
    makeCombatant({ id: "b", initiative: 10 }),
  ];

  it("starts round 1 at the top of turn order on the first call", () => {
    const encounter: Encounter = { round: 1, combatants, activeCombatantId: null };
    const result = advanceTurn(encounter);
    expect(result.activeCombatantId).toBe("a");
    expect(result.round).toBe(1);
  });

  it("advances round on wraparound back to the first combatant", () => {
    const encounter: Encounter = { round: 1, combatants, activeCombatantId: "b" };
    const result = advanceTurn(encounter);
    expect(result.activeCombatantId).toBe("a");
    expect(result.round).toBe(2);
  });

  it("is a no-op on an empty encounter", () => {
    const encounter: Encounter = { round: 1, combatants: [], activeCombatantId: null };
    expect(advanceTurn(encounter)).toBe(encounter);
  });
});

describe("endEncounter", () => {
  it("keeps PCs (with HP) but drops NPCs, and resets initiative/conditions/round", () => {
    const encounter: Encounter = {
      round: 3,
      activeCombatantId: "pc1",
      combatants: [
        makeCombatant({ id: "pc1", isPc: true, currentHp: 4, initiative: 18, conditions: ["Prone"] }),
        makeCombatant({ id: "npc1", isPc: false }),
      ],
    };
    const result = endEncounter(encounter);
    expect(result.round).toBe(1);
    expect(result.activeCombatantId).toBeNull();
    expect(result.combatants).toEqual([
      expect.objectContaining({ id: "pc1", currentHp: 4, initiative: null, conditions: [] }),
    ]);
  });
});

describe("applyHpDelta", () => {
  it("clamps healing at maxHp", () => {
    const result = applyHpDelta(makeCombatant({ currentHp: 5, maxHp: 7 }), 10);
    expect(result.currentHp).toBe(7);
  });

  it("clamps damage at 0", () => {
    const result = applyHpDelta(makeCombatant({ currentHp: 3, maxHp: 7 }), -10);
    expect(result.currentHp).toBe(0);
  });
});

describe("addCondition / removeCondition", () => {
  it("does not add a duplicate condition", () => {
    const combatant = addCondition(makeCombatant({ conditions: ["Prone"] }), "Prone");
    expect(combatant.conditions).toEqual(["Prone"]);
  });

  it("trims whitespace and ignores an empty condition", () => {
    expect(addCondition(makeCombatant(), "  Poisoned  ").conditions).toEqual(["Poisoned"]);
    expect(addCondition(makeCombatant(), "   ").conditions).toEqual([]);
  });

  it("removes a condition by name", () => {
    const combatant = removeCondition(makeCombatant({ conditions: ["Prone", "Poisoned"] }), "Prone");
    expect(combatant.conditions).toEqual(["Poisoned"]);
  });
});
