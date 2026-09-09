// Browser-facing facade for the fight simulator UI. Everything here is pure TS
// (no server deps) and safe to import into a client component. The `/simulator`
// route is the only consumer.

import { MONSTER_FIXTURES } from "./fixtures";
import { MINIONS } from "./engine/minions";
import { TEMPLATE_IDS, type Loadout } from "./engine/templates";
import { encounterBudget } from "./encounterBudget";
import {
  levelLadder,
  runScenario,
  runScenarioOnce,
  scenarioSweep,
  standardParty,
  type PartyMemberSpec,
} from "./engine/scenario";
import { parseCombatant, type Combatant } from "./schema";
import type { MonteCarloResult } from "./engine/montecarlo";
import type { CombatResult } from "./engine/loop";

export type { PartyMemberSpec, MonteCarloResult, CombatResult, Loadout, Combatant };
export { standardParty, TEMPLATE_IDS };

/** map a PC note's class string to the nearest sim template */
export function classToTemplate(cls: string): string {
  const c = (cls || "").toLowerCase();
  if (/barbarian/.test(c)) return "totem-barbarian";
  if (/\bbard\b/.test(c)) return "lore-bard";
  if (/cleric/.test(c)) return "life-cleric";
  if (/druid/.test(c)) return "moon-druid";
  if (/monk/.test(c)) return "open-hand-monk";
  if (/paladin/.test(c)) return "vengeance-paladin";
  if (/ranger/.test(c)) return "hunter-ranger";
  if (/rogue/.test(c)) return "assassin-rogue";
  if (/sorcerer/.test(c)) return "draconic-sorcerer";
  if (/warlock/.test(c)) return "warlock";
  if (/wizard/.test(c)) return "blaster-wizard";
  return "gwm-fighter"; // fighter, artificer, unknown → the martial default
}

/** short "+2 wpn · +1 AC" style summary for a collapsed loadout row */
export function loadoutSummary(l: Loadout | undefined): string {
  if (!l) return "";
  const bits: string[] = [];
  if (l.weaponBonus) bits.push(`+${l.weaponBonus} wpn`);
  if (l.acItem) bits.push(`+${l.acItem} AC`);
  if (l.saveItem) bits.push(`+${l.saveItem} saves`);
  if (l.resilientCon) bits.push("Res(Con)");
  if (l.toughHp) bits.push("Tough");
  return bits.join(" · ");
}

export interface MonsterOption {
  id: string;
  name: string;
  cr: string;
  kind: "boss" | "monster" | "minion";
}

// "Boss" vs "monster" is just a picker grouping: a block with legendary actions
// is a boss (a solo encounter centrepiece), everything else is a standalone
// monster. Custom-loaded blocks follow the same rule and get a "· custom" tag.
const byCrThenName = (a: MonsterOption, b: MonsterOption): number =>
  (Number(a.cr) || 0) - (Number(b.cr) || 0) || a.name.localeCompare(b.name);

function toOption(m: Combatant, custom: boolean): MonsterOption {
  return {
    id: m.id,
    name: custom ? `${m.name} · custom` : m.name,
    cr: m.cr ?? "?",
    kind: m.legendaryActions ? "boss" : "monster",
  };
}

/**
 * Everything you can drop into the enemy list: bosses, then standalone monsters,
 * then the minion pool. `custom` is the loaded-from-JSON pack (see
 * loadCustomMonsters); its entries slot into the boss / monster groups by the
 * same legendary-actions rule.
 */
export function monsterOptions(custom: Combatant[] = []): MonsterOption[] {
  const fixtures = [
    ...MONSTER_FIXTURES.map((m) => toOption(m, false)),
    ...custom.map((m) => toOption(m, true)),
  ];
  const bosses = fixtures.filter((m) => m.kind === "boss").sort(byCrThenName);
  const monsters = fixtures.filter((m) => m.kind === "monster").sort(byCrThenName);
  const minions = Object.values(MINIONS).map((m) => ({
    id: m.id,
    name: m.name,
    cr: m.cr ?? "?",
    kind: "minion" as const,
  }));
  return [...bosses, ...monsters, ...minions];
}

const BUNDLED_CR_BY_ID: Record<string, string> = Object.fromEntries(
  monsterOptions().map((m) => [m.id, m.cr]),
);

/** id → Combatant for a loaded custom pack, for enemy resolution and `summon`. */
function customById(list: Combatant[]): Record<string, Combatant> {
  return Object.fromEntries(list.map((m) => [m.id, m]));
}

// --------------------------------------------------------- custom monster I/O

export interface CustomLoadResult {
  monsters: Combatant[];
  errors: string[];
}

/**
 * Parse a user-supplied JSON blob into `Combatant`s. Accepts a bare array, a
 * `{ monsters: [...] }` object, or the extract shape `{ monsters, minions }`.
 * Bad entries are skipped and reported, not thrown.
 */
export function loadCustomMonsters(json: unknown): CustomLoadResult {
  let raw: unknown;
  try {
    raw = typeof json === "string" ? JSON.parse(json) : json;
  } catch (e) {
    return { monsters: [], errors: [`not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const asObj = raw as { monsters?: unknown; minions?: unknown };
  const entries: unknown[] = Array.isArray(raw)
    ? raw
    : [
        ...(Array.isArray(asObj?.monsters) ? asObj.monsters : []),
        ...(Array.isArray(asObj?.minions) ? asObj.minions : []),
      ];
  if (!entries.length) return { monsters: [], errors: ["no monsters found — expected an array or { monsters: [...] }"] };

  const monsters: Combatant[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    try {
      const c = parseCombatant(entries[i]);
      if (seen.has(c.id)) {
        errors.push(`entry ${i + 1} ("${c.name}"): duplicate id "${c.id}" — skipped`);
        continue;
      }
      seen.add(c.id);
      monsters.push(c);
    } catch (e) {
      const name = (entries[i] as { name?: string })?.name ?? `#${i + 1}`;
      errors.push(`entry "${name}": ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  return { monsters, errors };
}

/** Serialise a custom pack back to a JSON string for download. */
export function exportCustomMonsters(list: Combatant[]): string {
  return JSON.stringify({ monsters: list }, null, 2) + "\n";
}

export interface EnemyEntry {
  id: string;
  count: number;
}

export interface SimSetup {
  party: PartyMemberSpec[];
  enemies: EnemyEntry[];
  trials: number;
  seed: number;
  /** stat blocks loaded from a user JSON file (see loadCustomMonsters) */
  customMonsters: Combatant[];
}

export interface SimResult {
  seed: number;
  mc: MonteCarloResult;
  sample: { result: CombatResult; log: string[] };
  budget: ReturnType<typeof encounterBudget>;
}

/** Expand `{id, count}` entries into the `["id", "id x3"]` form the engine takes. */
function enemyList(enemies: EnemyEntry[]): string[] {
  return enemies.filter((e) => e.id).map((e) => (e.count > 1 ? `${e.id} x${e.count}` : e.id));
}

const crById = (setup: SimSetup): Record<string, string> => ({
  ...BUNDLED_CR_BY_ID,
  ...Object.fromEntries(setup.customMonsters.map((m) => [m.id, m.cr ?? "0"])),
});

/** Run the whole thing: Monte-Carlo distribution + one narrated fight + XP budget. */
export function runSim(setup: SimSetup): SimResult {
  const enemies = enemyList(setup.enemies);
  const extraById = customById(setup.customMonsters);
  const mc = runScenario({ party: setup.party, enemies, trials: setup.trials, seed: setup.seed, extraById });
  const sample = runScenarioOnce({ party: setup.party, enemies, seed: setup.seed, extraById });

  const cr = crById(setup);
  const crs = setup.enemies.flatMap((e) => Array.from({ length: Math.max(1, e.count) }, () => cr[e.id] ?? "0"));
  const avgLevel = Math.round(
    setup.party.reduce((s, p) => s + p.level, 0) / Math.max(1, setup.party.length),
  );
  const budget = encounterBudget(crs, avgLevel, setup.party.length);

  return { seed: setup.seed, mc, sample, budget };
}

export function defaultSetup(): SimSetup {
  return {
    party: standardParty(16),
    enemies: [{ id: "adult-red-dragon", count: 1 }],
    trials: 250,
    seed: 1,
    customMonsters: [],
  };
}

// -------------------------------------------------------------- what-if sweep

export type SweepDim =
  | "level"
  | "monsterHpMult"
  | "monsterDamageMult"
  | "monsterToHitDelta"
  | "monsterDcDelta"
  | "partyToHitDelta"
  | "partyDamageMult";

export interface SweepDimInfo {
  id: SweepDim;
  label: string;
  values: number[];
  fmt: (v: number) => string;
}

export const SWEEP_DIMS: SweepDimInfo[] = [
  { id: "level", label: "Party level", values: [10, 12, 14, 16, 18, 20], fmt: (v) => `L${v}` },
  { id: "monsterHpMult", label: "Monster HP", values: [0.7, 0.85, 1, 1.15, 1.3, 1.5], fmt: (v) => `${v}×` },
  { id: "monsterDamageMult", label: "Monster damage", values: [0.8, 0.9, 1, 1.1, 1.25], fmt: (v) => `${v}×` },
  { id: "monsterToHitDelta", label: "Monster to-hit", values: [-3, -2, -1, 0, 1, 2], fmt: (v) => (v >= 0 ? `+${v}` : `${v}`) },
  { id: "monsterDcDelta", label: "Monster save DC", values: [-3, -2, -1, 0, 1, 2], fmt: (v) => (v >= 0 ? `+${v}` : `${v}`) },
  { id: "partyToHitDelta", label: "Party to-hit", values: [-2, -1, 0, 1, 2, 3], fmt: (v) => (v >= 0 ? `+${v}` : `${v}`) },
  { id: "partyDamageMult", label: "Party damage", values: [0.8, 0.9, 1, 1.1, 1.25], fmt: (v) => `${v}×` },
];

export interface SweepRow {
  value: number;
  label: string;
  winRate: number;
  tpkRate: number;
  avgRounds: number;
  hpPctOnWin: number;
}

export interface SweepOut {
  dimension: SweepDim;
  baselineValue: number; // the "no-op" value (1, 0, or the party's current level)
  rows: SweepRow[];
}

/** Run one what-if sweep across `dim`'s preset values, on the shared setup. */
export function runSweep(setup: SimSetup, dim: SweepDim): SweepOut {
  const info = SWEEP_DIMS.find((d) => d.id === dim)!;
  const enemies = enemyList(setup.enemies);
  const trials = setup.trials;
  const extraById = customById(setup.customMonsters);

  if (dim === "level") {
    const rows = levelLadder(
      { party: setup.party.map((p) => ({ template: p.template, name: p.name, loadout: p.loadout })), enemies, trials, seed: setup.seed, extraById },
      info.values,
    ).map((r) => ({
      value: r.level,
      label: `L${r.level}`,
      winRate: r.mc.partyWinRate,
      tpkRate: r.mc.tpkRate,
      avgRounds: r.mc.avgRounds,
      hpPctOnWin: r.mc.avgPartyHpPctOnWin,
    }));
    const cur = Math.round(setup.party.reduce((s, p) => s + p.level, 0) / Math.max(1, setup.party.length));
    return { dimension: dim, baselineValue: cur, rows };
  }

  const swept = scenarioSweep({ party: setup.party, enemies, trials, seed: setup.seed, extraById }, dim, info.values);
  return {
    dimension: dim,
    baselineValue: dim.endsWith("Mult") ? 1 : 0,
    rows: swept.points.map((p) => ({
      value: p.value,
      label: info.fmt(p.value),
      winRate: p.mc.partyWinRate,
      tpkRate: p.mc.tpkRate,
      avgRounds: p.mc.avgRounds,
      hpPctOnWin: p.mc.avgPartyHpPctOnWin,
    })),
  };
}
