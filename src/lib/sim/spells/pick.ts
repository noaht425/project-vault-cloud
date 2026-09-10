// Per-PC spell selection. `makeCaster` stamps `spellClass` / `casterKind` /
// `spellAbility` onto a built caster; this overlay rebuilds that PC's spell
// actions from an explicit id list (the ⚙ picker's checkboxes), replacing the
// auto-prepared set. Non-spell actions (weapon attack, Rage, Action Surge,
// Channel Divinity …) are untouched.

import type { Combatant } from "../schema";
import { abilityMod } from "../math";
import { SPELLS_BY_ID } from "./catalog";
import { spellActions, spellReaction, type CasterCtx } from "./cast";
import type { CasterKind } from "./slots";

const pbFor = (lvl: number): number => 2 + Math.floor((Math.max(1, Math.min(20, lvl)) - 1) / 4);

/** Replace `c`'s spell list with exactly the spells in `ids` (cantrips + leveled
 *  + reaction spells). No-op when `ids` is empty (keeps the auto-prepared list). */
export function applyPickedSpells(c: Combatant, ids: string[], level: number): { c: Combatant; notes: string[] } {
  const notes: string[] = [];
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return { c, notes };
  if (!c.casterKind || !c.spellAbility) {
    return { c, notes: ["spell picks ignored — this PC isn't a spellcaster"] };
  }

  const cc: CasterCtx = {
    kind: c.casterKind as CasterKind,
    level,
    pb: pbFor(level),
    spellMod: abilityMod(c.abilities[c.spellAbility]),
  };

  // keep everything that isn't a spell-derived action (the warlock's Eldritch
  // Blast keeps id "attack", so preserve that even though it's flagged isSpell)
  const keptActions = c.actions.filter((a) => !a.isSpell || a.id === "attack");
  const keptReactions = c.reactions.filter((a) => !a.isSpell);

  const newActions: Combatant["actions"] = [];
  const newReactions: Combatant["reactions"] = [];
  const skipped: string[] = [];
  for (const id of uniq) {
    const sp = SPELLS_BY_ID[id];
    if (!sp) { skipped.push(id); continue; }
    if (sp.castTime === "reaction") {
      const r = spellReaction(sp, cc);
      if (r) newReactions.push(r);
      else skipped.push(sp.name);
      continue;
    }
    if (!sp.build) { skipped.push(sp.name); continue; }
    const acts = spellActions(sp, cc);
    if (acts.length) newActions.push(...acts);
    else skipped.push(sp.name);
  }
  if (skipped.length) {
    notes.push(`picked but not simulated (utility / out of slot range): ${skipped.join(", ")}`);
  }

  const actions = [...keptActions, ...newActions];
  const reactions = [...keptReactions, ...newReactions];
  const opener = c.ai.opener.filter((oid) => actions.some((a) => a.id === oid));
  return { c: { ...c, actions, reactions, ai: { ...c.ai, opener } }, notes };
}
