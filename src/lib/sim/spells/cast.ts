// Turn a prepared Spell into concrete Actions — one per slot level it can be
// upcast to, so the existing "score every candidate action, take the best" AI
// naturally picks the right slot for the board.

import type { Action } from "../schema";
import type { CastCtx, Spell } from "./types";
import { maxSlotLevel, pactSlotLevel, type CasterKind } from "./slots";

export interface CasterCtx {
  kind: CasterKind;
  level: number;
  pb: number;
  spellMod: number;
}

function baseCtx(cc: CasterCtx): Omit<CastCtx, "slotLevel"> {
  return { casterLevel: cc.level, spellMod: cc.spellMod, pb: cc.pb, dc: 8 + cc.pb + cc.spellMod, toHit: cc.pb + cc.spellMod };
}

const costFor = (sp: Spell): Action["cost"] =>
  sp.castTime === "bonus" ? { bonus: 1 } : sp.castTime === "reaction" ? { reaction: 1 } : { action: 1 };

/** A reaction spell (Shield, Counterspell, Absorb Elements) -> a reaction Action. */
export function spellReaction(sp: Spell, cc: CasterCtx): Action | undefined {
  if (sp.castTime !== "reaction") return undefined;
  const wantLevel = sp.id === "counterspell" ? 3 : sp.level;
  // warlocks spend a pact slot for everything; anyone whose slots don't reach
  // `wantLevel` can't run it
  const resource = cc.kind === "warlock"
    ? "pactSlot"
    : maxSlotLevel(cc.kind, cc.level) >= wantLevel ? `slot${wantLevel}` : undefined;
  if (!resource) return undefined;
  const trigger = sp.id === "counterspell" ? "enemy.castsSpell" : "self.wasHitByAttack";
  return {
    id: sp.id === "shield" ? "shield" : sp.id === "counterspell" ? "counterspell" : `react-${sp.id}`,
    name: sp.name, cost: { reaction: 1 }, recharge: "none",
    trigger, isSpell: true,
    limitedUse: { resource, amount: 1 },
    automation: sp.id === "shield"
      ? [{ type: "target", who: { who: "self" }, effects: [{ type: "applyEffect", name: "shield", durationRounds: 1, mods: { acBonus: 5 } }] }]
      : [{ type: "note", text: `${sp.name} (engine hook)` }],
  };
}

/**
 * All castable variants of a leveled spell. `slotResource` overrides the slot
 * name (warlock -> "pactSlot" / "arcanumN").
 */
export function spellActions(sp: Spell, cc: CasterCtx): Action[] {
  if (!sp.build || sp.castTime === "reaction") return [];
  const ctx0 = baseCtx(cc);
  const out: Action[] = [];

  // cantrip: one free action
  if (sp.level === 0) {
    out.push({
      id: `cast-${sp.id}`, name: sp.name, cost: costFor(sp), recharge: "none", isSpell: true,
      concentration: sp.concentration || undefined,
      automation: sp.build({ ...ctx0, slotLevel: 0 }),
    });
    return out;
  }

  if (cc.kind === "warlock") {
    const pact = pactSlotLevel(cc.level);
    if (sp.level <= pact) {
      out.push({
        id: `cast-${sp.id}`, name: `${sp.name} (pact)`, cost: costFor(sp), recharge: "none", isSpell: true,
        concentration: sp.concentration || undefined,
        limitedUse: { resource: "pactSlot", amount: 1 },
        automation: sp.build({ ...ctx0, slotLevel: pact }),
      });
    } else if (sp.level >= 6 && sp.level <= 9) {
      out.push({
        id: `cast-${sp.id}`, name: `${sp.name} (Arcanum)`, cost: costFor(sp), recharge: "none", isSpell: true,
        concentration: sp.concentration || undefined,
        limitedUse: { resource: `arcanum${sp.level}`, amount: 1 },
        automation: sp.build({ ...ctx0, slotLevel: sp.level }),
      });
    }
    return out;
  }

  const top = Math.min(maxSlotLevel(cc.kind, cc.level), sp.maxUpcast ?? sp.level, 9);
  for (let slot = sp.level; slot <= top; slot++) {
    out.push({
      id: `cast-${sp.id}-${slot}`,
      name: slot === sp.level ? sp.name : `${sp.name} (${slot}${slot === 1 ? "st" : slot === 2 ? "nd" : slot === 3 ? "rd" : "th"})`,
      cost: costFor(sp), recharge: "none", isSpell: true,
      concentration: sp.concentration || undefined,
      limitedUse: { resource: `slot${slot}`, amount: 1 },
      automation: sp.build({ ...ctx0, slotLevel: slot }),
    });
  }
  return out;
}
