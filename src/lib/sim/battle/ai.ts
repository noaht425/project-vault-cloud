// Battle-mode turn brain: reuse the engine's action scorer to pick WHAT to do,
// then add the spatial layer — pick a concrete target, path toward it (or kite
// away), and expose geometry seams so the shared interpreter resolves targets
// and cover on the grid.

import type { Action, AutomationNode } from "../schema";
import { chooseBest } from "../engine/ai";
import { provokeOpportunityAttacks } from "../engine/reactions";
import { isIncapacitated, livingEnemies, say, type CombatantState } from "../engine/state";
import {
  BattleState,
  boxOfUnit,
  deriveZones,
  nearestEnemyFt,
  posOf,
  recordFrame,
  speedFt,
  unitReachFt,
} from "./state";
import { footprint } from "./grid";
import {
  boxOf,
  coneCells,
  coverAcBonus,
  coverBetween,
  feetBetweenBoxes,
  hasLineOfSight,
  lineTemplateCells,
  sphereCells,
  type Box,
} from "./geometry";
import { canOccupy, pathToward, reachable, type MoveContext } from "./movement";

export interface BattleIntentPlan {
  action?: Action;
  targetId?: string;
  /** unit ids an AoE template caught */
  templateHitIds?: string[];
  templateCells?: string[];
  /** the actor must close to melee for this action */
  needsMelee: boolean;
}

// -------------------------------------------------------------- pick an action

const isAoeNode = (n: AutomationNode): boolean =>
  n.type === "target" && (n.who.who === "area" || n.who.who === "eachEnemy");

function actionHasAoe(a: Action): boolean {
  return a.automation.some(isAoeNode);
}

/** the enemy this unit should aim at: the side's shared focus if it's sane, else grid-nearest with sight */
function pickTarget(state: BattleState, u: CombatantState): CombatantState | undefined {
  const foes = livingEnemies(state, u);
  if (!foes.length) return undefined;
  const focusId = u.side === "party" ? state.focusId : u.ref.ai.focusFire ? state.monsterFocusId : undefined;
  const focus = focusId ? state.units.get(focusId) : undefined;
  const me = boxOfUnit(state, u);
  const withSight = foes.filter((f) => hasLineOfSight(state.grid, me, boxOfUnit(state, f)));
  const pool = withSight.length ? withSight : foes;
  if (focus && focus.alive && !focus.downed && pool.includes(focus)) return focus;
  return [...pool].sort(
    (a, b) => feetBetweenBoxes(me, boxOfUnit(state, a)) - feetBetweenBoxes(me, boxOfUnit(state, b)),
  )[0];
}

/** try centring an AoE template to catch the most enemies and fewest allies */
function planTemplate(
  state: BattleState,
  u: CombatantState,
  node: Extract<AutomationNode, { type: "target" }>,
): { hitIds: string[]; cells: string[] } {
  const shape = node.who.who === "area" && "shape" in node.who ? node.who.shape : "sphere";
  const size = node.who.who === "area" && "size" in node.who ? node.who.size : 20;
  const foes = livingEnemies(state, u);
  const me = posOf(state, u.id);
  const boxes = new Map<string, Box>();
  for (const x of state.units.values()) if (x.alive) boxes.set(x.id, boxOfUnit(state, x));

  const score = (cells: Set<string>): number => {
    let s = 0;
    for (const x of state.units.values()) {
      if (!x.alive || x.downed) continue;
      const hit = boxCellsIn(boxes.get(x.id)!, cells);
      if (!hit) continue;
      s += x.side === u.side ? -3 : x.side === "monster" && u.side === "monster" ? -3 : 2;
    }
    return s;
  };

  let best: { hitIds: string[]; cells: string[]; s: number } = { hitIds: [], cells: [], s: -Infinity };
  const centres = foes.map((f) => posOf(state, f.id));
  for (const c of centres) {
    let cells: Set<string>;
    if (shape === "cone") cells = coneCells(state.grid, me.x, me.y, c.x, c.y, size);
    else if (shape === "line") cells = lineTemplateCells(state.grid, me.x, me.y, c.x, c.y, size);
    else cells = sphereCells(state.grid, c.x, c.y, size);
    const s = score(cells);
    if (s > best.s) {
      const hitIds = [...state.units.values()]
        .filter((x) => x.alive && !x.downed && boxCellsIn(boxes.get(x.id)!, cells))
        .map((x) => x.id);
      best = { hitIds, cells: [...cells], s };
    }
  }
  return { hitIds: best.hitIds, cells: best.cells };
}

function boxCellsIn(b: Box, cells: Set<string>): boolean {
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (cells.has(`${x},${y}`)) return true;
  return false;
}

export function planTurn(state: BattleState, u: CombatantState): BattleIntentPlan {
  const action = chooseBest(state, u) ?? u.ref.actions.find((a) => a.id === "attack");
  const target = pickTarget(state, u);
  const plan: BattleIntentPlan = { action, targetId: target?.id, needsMelee: false };
  if (!action) return plan;

  if (actionHasAoe(action)) {
    const node = action.automation.find(isAoeNode) as Extract<AutomationNode, { type: "target" }> | undefined;
    if (node) {
      const t = planTemplate(state, u, node);
      plan.templateHitIds = t.hitIds;
      plan.templateCells = t.cells;
    }
  }
  // melee if it's a weapon routine and the unit isn't a deliberate skirmisher
  const weaponRoutine = action.id === "attack" || action.id === "multiattack" || /multiattack|attack/i.test(action.name);
  plan.needsMelee = weaponRoutine && !u.ref.ai.keepDistance && !actionHasAoe(action);
  return plan;
}

// ---------------------------------------------------------------- move / kite

function occupiedByOthers(state: BattleState, selfId: string): Set<string> {
  const s = new Set<string>();
  for (const x of state.units.values()) {
    if (x.id === selfId || !x.alive) continue;
    const p = posOf(state, x.id);
    const fp = footprint(x.ref.size);
    for (let dy = 0; dy < fp; dy++) for (let dx = 0; dx < fp; dx++) s.add(`${p.x + dx},${p.y + dy}`);
  }
  return s;
}

/** move `u` this turn according to `plan`. Records a "move" frame if it stepped. */
export function reposition(state: BattleState, u: CombatantState, plan: BattleIntentPlan): void {
  if (isIncapacitated(u) || !u.alive) return;
  const budget = speedFt(u);
  const ctx: MoveContext = { grid: state.grid, size: u.ref.size, blocked: occupiedByOthers(state, u.id) };
  const start = posOf(state, u.id);
  const myReach = unitReachFt(u);
  const target = plan.targetId ? state.units.get(plan.targetId) : undefined;

  let endPath: Array<[number, number]> | null = null;

  if (plan.needsMelee && target && target.alive) {
    const d = feetBetweenBoxes(boxOfUnit(state, u), boxOfUnit(state, target));
    if (d > myReach) {
      const r = pathToward(ctx, start.x, start.y, boxOfUnit(state, target), myReach, budget);
      if (r.path.length > 1) endPath = r.path;
    }
  } else if (!plan.needsMelee && nearestEnemyFt(state, u) <= myReach + 5) {
    // a ranged / caster combatant that's been pinned kites to open ground with sight
    const flood = reachable(ctx, start.x, start.y, budget);
    let bestKey: string | null = null;
    let bestGap = nearestEnemyFt(state, u);
    for (const key of flood.keys()) {
      const [x, y] = key.split(",").map(Number);
      if (!canOccupy(ctx, x, y, footprint(u.ref.size))) continue;
      const box = boxOf(x, y, footprint(u.ref.size));
      const gap = minEnemyGap(state, u, box);
      const seesTarget = !target || hasLineOfSight(state.grid, box, boxOfUnit(state, target));
      if (gap > bestGap && seesTarget) {
        bestGap = gap;
        bestKey = key;
      }
    }
    if (bestKey) {
      const [x, y] = bestKey.split(",").map(Number);
      endPath = [[start.x, start.y], [x, y]];
    }
  }

  if (!endPath) return;

  // opportunity attacks: resolve while the mover is still where it started and
  // adjacent enemies are still flagged "melee"
  const wasMelee = u.zone === "melee";
  if (wasMelee) {
    provokeOpportunityAttacks(state, u);
    if (!u.alive || isIncapacitated(u)) return;
  }

  const [ex, ey] = endPath[endPath.length - 1];
  state.pos.set(u.id, { x: ex, y: ey });
  deriveZones(state);
  recordFrame(state, {
    kind: "move",
    actorId: u.id,
    text: `${u.name} moves`,
    path: endPath,
  });
}

function minEnemyGap(state: BattleState, u: CombatantState, box: Box): number {
  let g = Infinity;
  for (const e of state.units.values()) {
    if (e.side === u.side || !e.alive || e.downed) continue;
    g = Math.min(g, feetBetweenBoxes(box, boxOfUnit(state, e)));
  }
  return g;
}

// ----------------------------------------------------- interpreter geometry seams

/** the `geoTargets` seam for a given actor + plan */
export function geoTargetsFor(state: BattleState, u: CombatantState, plan: BattleIntentPlan) {
  return (node: Extract<AutomationNode, { type: "target" }>, source: CombatantState): CombatantState[] | null => {
    const who = node.who.who;
    if (who === "self" || who === "eachAlly" || who === "lowestHpAlly" || who === "chosenEnemies") return null;
    const foes = livingEnemies(state, source);
    if (!foes.length) return [];
    const me = boxOfUnit(state, source);

    if (who === "area" || who === "eachEnemy") {
      if (plan.templateHitIds && plan.templateHitIds.length) {
        const hit = plan.templateHitIds.map((id) => state.units.get(id)).filter((x): x is CombatantState => !!x && x.alive && x.side !== source.side);
        if (hit.length) return hit;
      }
      // fall back: everyone the caster can see (front line)
      return foes.filter((f) => hasLineOfSight(state.grid, me, boxOfUnit(state, f)));
    }

    // single-target selectors
    if (plan.targetId) {
      const t = state.units.get(plan.targetId);
      if (t && t.alive && !t.downed && t.side !== source.side) return [t];
    }
    return [
      [...foes].sort((a, b) => feetBetweenBoxes(me, boxOfUnit(state, a)) - feetBetweenBoxes(me, boxOfUnit(state, b)))[0],
    ];
  };
}

/** the `attackMods` seam: cover -> +AC, and long range -> disadvantage. A ranged
 *  attacker (keepDistance, or firing from outside its own reach) shooting past
 *  ~120 ft is at its weapon's long range. Melee attacks never trip this — the
 *  attacker is adjacent. */
export function attackModsFor(state: BattleState, u: CombatantState) {
  const LONG_RANGE_FT = 120;
  return (target: CombatantState): { acBonus?: number; disadvantage?: boolean } => {
    const me = boxOfUnit(state, u);
    const tb = boxOfUnit(state, target);
    const blockers: Box[] = [];
    for (const x of state.units.values()) {
      if (!x.alive || x.id === u.id || x.id === target.id) continue;
      blockers.push(boxOfUnit(state, x));
    }
    const cover = coverBetween(state.grid, me, tb, blockers);
    const long = feetBetweenBoxes(me, tb) > LONG_RANGE_FT;
    return { acBonus: coverAcBonus(cover), disadvantage: long || undefined };
  };
}

export { say };
