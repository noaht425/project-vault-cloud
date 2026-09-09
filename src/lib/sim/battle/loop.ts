// The battle-mode round loop. Same skeleton as engine/loop.ts — initiative,
// per-turn economy, start/end-of-turn ticks, legendary + lair timing, death
// saves, end check — but with a movement phase and geometry-aware action
// resolution, and it records a frame after every step.

import { abilityMod } from "../math";
import {
  actionAvailable,
  markEconomy,
  pick,
  spend,
  takeLairAction,
  takeLegendaryActions,
} from "../engine/ai";
import { runAction } from "../engine/interpreter";
import { chooseFocusTarget } from "../engine/score";
import {
  checkEnd,
  endOfTurn,
  rollDeathSave,
  startOfTurn,
} from "../engine/loop";
import { applyDamage, rollSave } from "../engine/resolve";
import {
  isIncapacitated,
  livingEnemies,
  say,
  startTurnEconomy,
  type CombatantState,
} from "../engine/state";
import { TERRAIN_GLYPH, footprint, terrainAt } from "./grid";
import { attackModsFor, geoTargetsFor, planTurn, reposition } from "./ai";
import { BattleState, deriveZones, recordFrame } from "./state";

function rollInitiative(state: BattleState): void {
  for (const u of state.units.values()) {
    if (u.ref.specialRules.some((r) => r.rule === "ambush")) u.assassinateUntilRound = 1;
  }
  const order = [...state.units.values()]
    .map((u) => ({
      id: u.id,
      init:
        state.rng.d20() +
        (u.ref.initiativeBonus ?? abilityMod(u.ref.abilities.dex)) +
        (u.assassinateUntilRound ? 100 : 0),
      side: u.side,
    }))
    .sort((a, b) => b.init - a.init || (a.side === "monster" ? -1 : 1))
    .map((x) => x.id);
  state.order = order;
  say(state, `Initiative: ${order.map((id) => state.units.get(id)!.name).join(" > ")}`);
}

function terrainString(state: BattleState): string {
  let s = "";
  for (let y = 0; y < state.grid.height; y++) {
    for (let x = 0; x < state.grid.width; x++) s += TERRAIN_GLYPH[terrainAt(state.grid, x, y)];
  }
  return s;
}

/** damage for standing in a hazard square at the start of your turn */
function hazardTick(state: BattleState, u: CombatantState): void {
  if (!u.alive || u.downed) return;
  const p = state.pos.get(u.id);
  if (!p) return;
  const fp = footprint(u.ref.size);
  let inHazard = false;
  for (let dy = 0; dy < fp && !inHazard; dy++) {
    for (let dx = 0; dx < fp; dx++) {
      if (terrainAt(state.grid, p.x + dx, p.y + dy) === "hazard") {
        inHazard = true;
        break;
      }
    }
  }
  if (!inHazard) return;
  const hz = state.grid.hazard;
  if (hz.when === "enter") return;
  let amt = rollDice(state, hz.amount);
  if (hz.save) {
    const sr = rollSave(state, u, hz.save.ability, hz.save.dc, { magical: false, stakes: "damage" });
    if (sr.passed) amt = Math.floor(amt / 2);
  }
  const dealt = applyDamage(state, u, amt, hz.damageType as never, { sourceId: u.id });
  if (dealt > 0) say(state, `${u.name} takes ${dealt} ${hz.damageType} from the hazard`, u.id);
}

function rollDice(state: BattleState, s: string): number {
  const m = /^(\d+)d(\d+)$/.exec(s.replace(/\s/g, ""));
  if (!m) return Number(s) || 0;
  return state.rng.dice(Number(m[1]), Number(m[2]));
}

function charmParalysed(state: BattleState, u: CombatantState): boolean {
  const c = u.conditions.get("charmed");
  if (!c) return false;
  const foes = livingEnemies(state, u);
  return foes.length > 0 && foes.every((f) => f.id === c.sourceId);
}

function takeBattleTurn(state: BattleState, u: CombatantState): void {
  if (!livingEnemies(state, u).length) return;
  if (charmParalysed(state, u)) {
    say(state, `${u.name} is charmed and won't act`, u.id);
    return;
  }

  // recharge rolls (mirror engine/ai.ts)
  for (const a of u.ref.actions) {
    if (a.recharge.startsWith("roll:") && a.limitedUse) {
      const res = a.limitedUse.resource;
      if ((u.resources.get(res) ?? 0) <= 0) {
        const need = a.recharge === "roll:5-6" ? 5 : a.recharge === "roll:4-6" ? 4 : 6;
        if (state.rng.int(1, 6) >= need) u.resources.set(res, a.limitedUse.amount);
      }
    }
  }

  const plan = planTurn(state, u);
  reposition(state, u, plan);
  if (!u.alive || isIncapacitated(u)) return;
  deriveZones(state);

  const geo = { geoTargets: geoTargetsFor(state, u, plan), attackMods: attackModsFor(state, u) };

  // round-1 opener (Action Surge, Hunter's Mark, Frightful Presence, …)
  if (state.round === 1 && u.ref.ai.opener.length) {
    const opener = pick(state, u, u.ref.ai.opener);
    if (opener) {
      spend(u, opener);
      markEconomy(u, opener);
      runAction(state, u, opener, { geo });
      recordFrame(state, {
        kind: "action",
        actorId: u.id,
        text: `${u.name} uses ${opener.name}`,
        targetIds: plan.targetId ? [plan.targetId] : undefined,
      });
      if (opener.cost.action) return;
    }
  }
  if (u.actionUsedThisTurn) return;

  let action = plan.action;
  if (action && !actionAvailable(state, u, action)) {
    action = u.ref.actions.find((a) => a.id === "attack" && actionAvailable(state, u, a));
  }
  if (!action) return;

  spend(u, action);
  markEconomy(u, action);
  runAction(state, u, action, { geo });
  recordFrame(state, {
    kind: "action",
    actorId: u.id,
    text: `${u.name} uses ${action.name}`,
    targetIds: plan.templateHitIds ?? (plan.targetId ? [plan.targetId] : undefined),
    templateCells: plan.templateCells,
  });
}

function partyHpFraction(state: BattleState): number {
  let cur = 0;
  let max = 0;
  for (const u of state.units.values()) if (u.side === "party") {
    cur += Math.max(0, u.hp);
    max += u.maxHp;
  }
  return max ? cur / max : 0;
}
function monsterHpFraction(state: BattleState): number {
  let cur = 0;
  let max = 0;
  for (const u of state.units.values()) if (u.side === "monster" && u.summonerId === undefined) {
    cur += Math.max(0, u.hp);
    max += u.maxHp;
  }
  return max ? cur / max : 0;
}

export function runBattleLoop(state: BattleState): void {
  rollInitiative(state);
  deriveZones(state);
  recordFrame(state, {
    kind: "start",
    text: "The battle begins",
    terrain: { width: state.grid.width, height: state.grid.height, tiles: terrainString(state) },
  });

  while (!state.ended && state.round < state.maxRounds) {
    state.round++;
    for (const u of state.units.values()) {
      const precog = u.ref.specialRules.find((r) => r.rule === "d20Replacement");
      if (precog && precog.rule === "d20Replacement") u.d20SwapsLeft = precog.perRound;
    }
    state.focusId = chooseFocusTarget(state, "party");
    state.monsterFocusId = chooseFocusTarget(state, "monster");

    for (const u of state.units.values()) {
      if (u.side === "monster" && u.alive && u.ref.lairActions) {
        takeLairAction(state, u);
        recordFrame(state, { kind: "lair", actorId: u.id, text: `${u.name} — lair action` });
      }
    }
    checkEnd(state);
    if (state.ended) break;

    for (const id of state.order) {
      const u = state.units.get(id);
      if (!u || !u.alive || state.ended) continue;
      if (u.downed) {
        rollDeathSave(state, u);
        recordFrame(state, { kind: "turn", actorId: u.id, text: `${u.name} — death save` });
        continue;
      }
      startTurnEconomy(u);
      startOfTurn(state, u);
      if (state.ended) break;
      deriveZones(state);
      hazardTick(state, u);
      if (!u.alive) {
        recordFrame(state, { kind: "turn", actorId: u.id });
        checkEnd(state);
        if (state.ended) break;
        continue;
      }

      if (isIncapacitated(u)) {
        say(state, `${u.name} loses its turn`, u.id);
        recordFrame(state, { kind: "turn", actorId: u.id, text: `${u.name} can't act` });
      } else {
        if (u.side === "monster") u.legendaryBudget = u.legendaryMax;
        takeBattleTurn(state, u);
        recordFrame(state, { kind: "turn", actorId: u.id, text: `${u.name} ends its turn` });
      }

      endOfTurn(state, u);
      checkEnd(state);
      if (state.ended) break;

      if (u.side === "party") {
        for (const m of state.units.values()) {
          if (m.side === "monster" && m.alive) {
            takeLegendaryActions(state, m);
          }
        }
        checkEnd(state);
        if (state.ended) break;
      }
    }
  }

  if (!state.ended) {
    state.ended = true;
    state.winner = partyHpFraction(state) >= monsterHpFraction(state) ? "party" : "monster";
  }
  recordFrame(state, { kind: "end", text: `${state.winner ?? "draw"} wins after ${state.round} rounds` });
}
