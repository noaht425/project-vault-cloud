// Ported verbatim from the Electron app's src/common/initiative.ts.
import { z } from "zod";
import { rollDice } from "./dice";

export const combatantSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceNoteTitle: z.string().nullable().catch(null),
  ac: z.coerce.number().catch(10),
  maxHp: z.coerce.number().catch(10),
  currentHp: z.coerce.number().catch(10),
  initiativeBonus: z.coerce.number().catch(0),
  initiative: z.number().nullable().catch(null),
  conditions: z.array(z.string()).catch([]),
  isPc: z.boolean().catch(false),
});
export type Combatant = z.infer<typeof combatantSchema>;

export const encounterSchema = z
  .object({
    round: z.coerce.number().catch(1),
    combatants: z.array(combatantSchema).catch([]),
    activeCombatantId: z.string().nullable().catch(null),
  })
  .catch({ round: 1, combatants: [], activeCombatantId: null });
export type Encounter = z.infer<typeof encounterSchema>;

export function parseEncounter(data: unknown): Encounter {
  return encounterSchema.parse(data);
}

export function defaultEncounter(): Encounter {
  return encounterSchema.parse({});
}

export interface NewCombatantInput {
  name: string;
  sourceNoteTitle: string | null;
  ac: number;
  maxHp: number;
  startingHp?: number;
  initiativeBonus: number;
  isPc: boolean;
  count: number;
}

export function buildCombatants(input: NewCombatantInput, idFactory: () => string = () => crypto.randomUUID()): Combatant[] {
  const count = Math.max(1, Math.floor(input.count));
  const startingHp = input.startingHp ?? input.maxHp;
  return Array.from({ length: count }, (_, i) => ({
    id: idFactory(),
    name: count > 1 ? `${input.name} ${i + 1}` : input.name,
    sourceNoteTitle: input.sourceNoteTitle,
    ac: input.ac,
    maxHp: input.maxHp,
    currentHp: startingHp,
    initiativeBonus: input.initiativeBonus,
    initiative: null,
    conditions: [],
    isPc: input.isPc,
  }));
}

export function rollInitiativeFor(combatant: Combatant, rng: () => number = Math.random): number {
  const expr = combatant.initiativeBonus >= 0 ? `1d20+${combatant.initiativeBonus}` : `1d20${combatant.initiativeBonus}`;
  return rollDice(expr, rng)!.total;
}

export function sortedTurnOrder(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name);
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.initiativeBonus !== a.initiativeBonus) return b.initiativeBonus - a.initiativeBonus;
    return a.name.localeCompare(b.name);
  });
}

export function advanceTurn(encounter: Encounter): Encounter {
  const order = sortedTurnOrder(encounter.combatants);
  if (order.length === 0) return encounter;

  const currentIndex = order.findIndex((c) => c.id === encounter.activeCombatantId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % order.length;
  const wrapped = currentIndex !== -1 && nextIndex === 0;

  return {
    ...encounter,
    round: wrapped ? encounter.round + 1 : encounter.round,
    activeCombatantId: order[nextIndex].id,
  };
}

export function endEncounter(encounter: Encounter): Encounter {
  const combatants = encounter.combatants
    .filter((c) => c.isPc)
    .map((c) => ({ ...c, initiative: null, conditions: [] }));
  return { round: 1, combatants, activeCombatantId: null };
}

export function applyHpDelta(combatant: Combatant, delta: number): Combatant {
  return { ...combatant, currentHp: Math.max(0, Math.min(combatant.maxHp, combatant.currentHp + delta)) };
}

export function addCondition(combatant: Combatant, condition: string): Combatant {
  const trimmed = condition.trim();
  if (!trimmed || combatant.conditions.includes(trimmed)) return combatant;
  return { ...combatant, conditions: [...combatant.conditions, trimmed] };
}

export function removeCondition(combatant: Combatant, condition: string): Combatant {
  return { ...combatant, conditions: combatant.conditions.filter((c) => c !== condition) };
}

export function removeCombatant(encounter: Encounter, id: string): Encounter {
  const combatants = encounter.combatants.filter((c) => c.id !== id);
  return {
    ...encounter,
    combatants,
    activeCombatantId: encounter.activeCombatantId === id ? null : encounter.activeCombatantId,
  };
}
