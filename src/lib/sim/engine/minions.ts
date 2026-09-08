// Summoned / raised minion stat blocks. A `summon` automation node names one of
// these by id; the interpreter spawns `initCombatant`s from the registry and
// drops them into the initiative order on the summoner's side. They also show
// up in the enemy picker's "Minions" group as standalone options.
//
// Kept deliberately light. Both entries are SRD 5.2.1 (CC-BY-4.0); homebrew
// summons live in the git-ignored local monster JSON, not here.

import type { Combatant } from "../schema";
import { parseCombatant } from "../schema";

const AI = {
  targetPriority: "squishiest" as const,
  aoeMinTargets: 2,
  opener: [] as string[],
  saveLegendaryResistanceFor: [] as string[],
  keepDistance: false,
  neverRetreat: true,
  focusFire: true,
};

function minion(base: Partial<Combatant> & Pick<Combatant, "id" | "name" | "ac" | "maxHp" | "abilities" | "pb">): Combatant {
  return parseCombatant({
    kind: "monster",
    size: "medium",
    proficientSaves: [],
    saveBonusAll: 0,
    resistances: [],
    resistancesNonmagical: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    specialRules: [],
    resources: {},
    traits: [],
    reactions: [],
    ai: AI,
    ...base,
  });
}

const fireElemental = minion({
  id: "fire-elemental",
  name: "Fire Elemental",
  cr: "5",
  ac: 13,
  maxHp: "12d10+36",
  speeds: { walk: 50 },
  abilities: { str: 10, dex: 17, con: 16, int: 6, wis: 10, cha: 7 },
  pb: 3,
  immunities: ["fire", "poison"],
  conditionImmunities: ["exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
  actions: [
    {
      id: "multiattack",
      name: "Multiattack",
      cost: { action: 1 },
      recharge: "none",
      automation: [{ type: "useAction", action: "touch", times: 2 }],
    },
    {
      id: "touch",
      name: "Fire Touch",
      cost: {},
      recharge: "none",
      automation: [
        {
          type: "target",
          who: { who: "aiChoice" },
          effects: [
            {
              type: "attack",
              bonus: 6,
              onHit: [
                { type: "damage", amount: "2d6", damageType: "fire" },
                { type: "damage", amount: "1d10", damageType: "fire" },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const chainDevil = minion({
  id: "chain-devil",
  name: "Chain Devil",
  cr: "8",
  ac: 16,
  maxHp: "10d8+40",
  speeds: { walk: 30 },
  abilities: { str: 18, dex: 15, con: 18, int: 11, wis: 12, cha: 14 },
  pb: 3,
  immunities: ["fire", "poison"],
  resistances: ["cold"],
  resistancesNonmagical: ["bludgeoning", "piercing", "slashing"],
  conditionImmunities: ["poisoned"],
  actions: [
    {
      id: "multiattack",
      name: "Multiattack",
      cost: { action: 1 },
      recharge: "none",
      automation: [{ type: "useAction", action: "chain", times: 2 }],
    },
    {
      id: "chain",
      name: "Animated Chain",
      cost: {},
      recharge: "none",
      automation: [
        {
          type: "target",
          who: { who: "aiChoice" },
          effects: [
            {
              type: "attack",
              bonus: 8,
              onHit: [
                { type: "damage", amount: "2d6+4", damageType: "slashing" },
                {
                  type: "save",
                  ability: "str",
                  dc: 15,
                  onFail: [{ type: "applyCondition", condition: "restrained", durationRounds: 1, saveEnds: { ability: "str", dc: 15, at: "endOfTurn" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

export const MINIONS: Record<string, Combatant> = {
  "fire-elemental": fireElemental,
  "chain-devil": chainDevil,
};

/**
 * Minions of these stat blocks vanish the instant their summoner dies. Empty
 * for the bundled SRD set; homebrew summons that revert are re-registered when
 * a custom monster pack declares them.
 */
export const REVERTS_ON_SUMMONER_DEATH = new Set<string>();
