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
import {
  parseCombatant,
  ABILITIES,
  DAMAGE_TYPES,
  SIZES,
  type Ability,
  type Combatant,
  type Condition,
  type DamageType,
  type Size,
} from "./schema";
import { validateCombatant } from "./validate";
import type { MonteCarloResult } from "./engine/montecarlo";
import type { CombatResult } from "./engine/loop";

export type { PartyMemberSpec, MonteCarloResult, CombatResult, Loadout, Combatant, Ability, DamageType, Condition, Size };
export { standardParty, TEMPLATE_IDS, ABILITIES, DAMAGE_TYPES, SIZES };

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

// ------------------------------------------------------ "make a monster" builder
//
// A simplified stat block a form can drive, and `draftToCombatant` which
// assembles it into a real `Combatant` (multiattack + per-attack actions, an
// optional save-AoE, optional legendary actions) and runs it past
// `parseCombatant` / `validateCombatant`. The output drops into
// `SimSetup.customMonsters` exactly like a JSON-loaded block.

/** DMG "monster statistics by CR" proficiency bonus. */
export function suggestedPb(cr: string): number {
  const n = Number(String(cr).includes("/") ? 0 : cr);
  if (!Number.isFinite(n)) return 2;
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}

export interface BuilderAttack {
  name: string;
  toHit: number;
  dice: string; // "2d10+8"
  type: DamageType;
  count: number; // how many of this attack per turn (multiattack)
}

export interface BuilderAoe {
  name: string;
  shape: "cone" | "line" | "sphere" | "emanation";
  size: number; // feet
  ability: Ability;
  dc: number;
  dice: string;
  type: DamageType;
  recharge: "none" | "roll:5-6" | "roll:4-6";
}

/** none = no interaction; the rest map to resistances / immunities / vulnerabilities */
export type DmgDefense = "none" | "resist" | "immune" | "vuln";

export interface BuilderDraft {
  name: string;
  cr: string;
  size: Size;
  ac: number;
  hp: string; // "18d12+108" or a flat "250"
  abilities: Record<Ability, number>;
  pb: number;
  proficientSaves: Ability[];
  damage: Record<DamageType, DmgDefense>;
  conditionImmunities: Condition[];
  attacks: BuilderAttack[];
  aoe: BuilderAoe | null;
  legendary: boolean;
  legendaryBudget: number;
  /** attack names that a legendary action may spend */
  legendaryAttacks: string[];
  ai: { targetPriority: "highestThreat" | "squishiest" | "lowestHp" | "nearest"; keepDistance: boolean; neverRetreat: boolean };
}

/** condition immunities offered in the builder (the ones that matter to the sim) */
export const BUILDER_CONDITIONS: Condition[] = [
  "blinded", "charmed", "frightened", "grappled", "paralyzed", "poisoned",
  "prone", "restrained", "stunned", "exhaustion",
];

export function emptyDraft(): BuilderDraft {
  return {
    name: "",
    cr: "10",
    size: "large",
    ac: 16,
    hp: "12d10+60",
    abilities: { str: 18, dex: 12, con: 18, int: 10, wis: 12, cha: 12 },
    pb: 4,
    proficientSaves: [],
    damage: Object.fromEntries(DAMAGE_TYPES.map((d) => [d, "none"])) as Record<DamageType, DmgDefense>,
    conditionImmunities: [],
    attacks: [{ name: "Strike", toHit: 8, dice: "2d8+4", type: "slashing", count: 2 }],
    aoe: null,
    legendary: false,
    legendaryBudget: 3,
    legendaryAttacks: [],
    ai: { targetPriority: "highestThreat", keepDistance: false, neverRetreat: false },
  };
}

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "monster";

export interface BuilderResult {
  combatant?: Combatant;
  error?: string;
  warnings: string[];
}

/** Assemble a draft into a real Combatant (or return the first blocking error). */
export function draftToCombatant(draft: BuilderDraft): BuilderResult {
  const name = draft.name.trim();
  if (!name) return { error: "Give the monster a name.", warnings: [] };
  const attacks = draft.attacks.filter((a) => a.name.trim() && a.dice.trim());
  if (!attacks.length && !draft.aoe) return { error: "Add at least one attack or a breath / area effect.", warnings: [] };

  const id = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

  // per-attack actions + a multiattack when there's more than one swing
  const usedIds = new Set<string>();
  const actionFor = (a: BuilderAttack): { actionId: string; action: Combatant["actions"][number] } => {
    let aid = slugify(a.name);
    while (usedIds.has(aid)) aid += "x";
    usedIds.add(aid);
    return {
      actionId: aid,
      action: {
        id: aid,
        name: a.name.trim(),
        cost: {},
        recharge: "none",
        automation: [
          {
            type: "target",
            who: { who: "aiChoice" },
            effects: [{ type: "attack", bonus: a.toHit, onHit: [{ type: "damage", amount: a.dice.trim(), damageType: a.type }] }],
          },
        ],
      },
    };
  };
  const built = attacks.map(actionFor);
  const totalSwings = attacks.reduce((s, a) => s + Math.max(1, a.count), 0);

  const actions: Combatant["actions"] = [];
  if (totalSwings > 1) {
    actions.push({
      id: "multiattack",
      name: "Multiattack",
      cost: { action: 1 },
      recharge: "none",
      automation: built.map((b, i) => ({ type: "useAction", action: b.actionId, times: Math.max(1, attacks[i].count) })),
    });
    actions.push(...built.map((b) => b.action));
  } else if (built.length === 1) {
    actions.push({ ...built[0].action, cost: { action: 1 } });
  }

  const resources: NonNullable<Combatant["resources"]> = {};
  if (draft.aoe && draft.aoe.dice.trim()) {
    const ao = draft.aoe;
    // a recharge action needs a paired resource or the engine can't gate it
    const limitedUse = ao.recharge !== "none" ? { resource: "area", amount: 1 } : undefined;
    if (limitedUse) resources.area = { max: 1, recharge: ao.recharge };
    actions.push({
      id: "area",
      name: ao.name.trim() || "Breath",
      cost: { action: 1 },
      recharge: ao.recharge,
      ...(limitedUse ? { limitedUse } : {}),
      automation: [
        {
          type: "target",
          who: { who: "area", shape: ao.shape, size: Math.max(5, ao.size) },
          effects: [
            {
              type: "save",
              ability: ao.ability,
              dc: ao.dc,
              onFail: [{ type: "damage", amount: ao.dice.trim(), damageType: ao.type }],
              onSuccess: [{ type: "damage", amount: ao.dice.trim(), damageType: ao.type, half: true }],
            },
          ],
        },
      ],
    });
  }

  const resistances = DAMAGE_TYPES.filter((d) => draft.damage[d] === "resist");
  const immunities = DAMAGE_TYPES.filter((d) => draft.damage[d] === "immune");
  const vulnerabilities = DAMAGE_TYPES.filter((d) => draft.damage[d] === "vuln");

  const legendaryOptionIds = built
    .filter((b, i) => draft.legendaryAttacks.includes(attacks[i].name))
    .map((b) => b.actionId);

  const raw = {
    id,
    name,
    kind: "monster" as const,
    size: draft.size,
    cr: draft.cr.trim() || "10",
    ac: draft.ac,
    maxHp: draft.hp.trim() || "1",
    abilities: draft.abilities,
    pb: draft.pb,
    proficientSaves: draft.proficientSaves,
    resistances,
    immunities,
    vulnerabilities,
    conditionImmunities: draft.conditionImmunities,
    resources,
    actions,
    ai: {
      targetPriority: draft.ai.targetPriority,
      aoeMinTargets: 2,
      opener: draft.aoe ? ["area"] : [],
      saveLegendaryResistanceFor: ["stunned", "paralyzed", "banished", "controlled"],
      keepDistance: draft.ai.keepDistance,
      neverRetreat: draft.ai.neverRetreat,
      focusFire: true,
    },
    ...(draft.legendary && legendaryOptionIds.length
      ? { legendaryActions: { budget: Math.max(1, draft.legendaryBudget), options: legendaryOptionIds.map((a) => ({ action: a, cost: 1 })) } }
      : {}),
  };

  let combatant: Combatant;
  try {
    combatant = parseCombatant(raw);
  } catch (e) {
    return { error: e instanceof Error ? e.message.split("\n")[0] : String(e), warnings: [] };
  }
  const v = validateCombatant(combatant);
  return { combatant, warnings: v.ok ? v.warnings : [...v.errors, ...v.warnings] };
}

// -------------------------------------------------- paste / import a statblock
//
// `parseStatblock` turns a pasted stat block into a `BuilderDraft` for review
// in the builder. It accepts standard stat-block **markdown** (the homebrewery
// / D&D Beyond / 5e.tools "Get as Markdown" shape, which is also what an NPC
// note's "## Stat Block" body section looks like) or **5e.tools bestiary JSON**.
// It is deliberately best-effort: it fills what it can read and returns
// `warnings` for the rest, and nothing is ever fetched from a remote — the
// caller supplies the text. Pasting content you don't have the rights to reuse
// is on you.

export interface StatblockParse {
  draft?: BuilderDraft;
  warnings: string[];
  error?: string;
}

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};
const SIZE_WORD: Record<string, Size> = {
  tiny: "tiny", small: "small", medium: "medium", large: "large", huge: "huge", gargantuan: "gargantuan",
};
const dmgSet = new Set<string>(DAMAGE_TYPES);
const condSet = new Set<string>(BUILDER_CONDITIONS);

/** first `**Label** value` on its own line */
function mdField(md: string, label: string): string | null {
  const m = new RegExp(`\\*\\*${label}\\*\\*[:\\s]*([^\\n]+)`, "i").exec(md);
  return m ? m[1].replace(/\*+/g, "").trim() : null;
}

function parseAbilityBlock(md: string): { abilities: Record<Ability, number>; saves: Ability[] } {
  const abilities: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const saves: Ability[] = [];
  // inline form: **STR** 27 (+8)  — or a table row of "27 (+8) | 10 (+0) | ..."
  for (const ab of ABILITIES) {
    const inline = new RegExp(`\\b${ab}\\b[^\\d-]{0,8}(\\d{1,2})\\b`, "i").exec(md);
    if (inline) abilities[ab] = Number(inline[1]);
  }
  // a "27 (+8) | 10 (+0) | 25 (+7) | 16 (+3) | 13 (+1) | 23 (+6)" row (order STR..CHA)
  const row = /(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)\s*\|\s*(\d{1,2})\s*\([+-]\d+\)/.exec(md);
  if (row) ABILITIES.forEach((ab, i) => (abilities[ab] = Number(row[i + 1])));
  // **Saving Throws** Dex +6, Con +13, ...
  const st = mdField(md, "Saving Throws");
  if (st) for (const ab of ABILITIES) if (new RegExp(`\\b${ab}\\b`, "i").test(st)) saves.push(ab);
  return { abilities, saves };
}

function parseDamageLine(md: string, label: string, into: Record<DamageType, DmgDefense>, kind: DmgDefense): void {
  const line = mdField(md, label);
  if (!line) return;
  for (const t of DAMAGE_TYPES) if (new RegExp(`\\b${t}\\b`, "i").test(line)) into[t] = kind;
}

/** grab each "***Name.*** body" action block from a section of markdown */
function actionBlocks(section: string): { name: string; rawName: string; body: string }[] {
  const out: { name: string; rawName: string; body: string }[] = [];
  const re = /\*{2,3}\s*([^*.\n][^*.\n]*?)\.?\s*\*{2,3}\s*([\s\S]*?)(?=\n\s*\*{2,3}\s*[^*\n]|\n\s*#{1,6}\s|\n\s*$|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const rawName = m[1].trim();
    out.push({ name: rawName.replace(/\([^)]*\)\s*$/, "").trim(), rawName, body: m[2].trim() });
  }
  return out;
}

function attackFromBody(name: string, raw: string): BuilderAttack | null {
  const body = raw.replace(/[*_]/g, " ");
  const hit = /([+-]\d+)\s*to hit/i.exec(body) || /Attack Roll:\s*([+-]\d+)/i.exec(body);
  const dmg = /(?:Hit|Damage):\s*\d+\s*\(([0-9d +-]+?)\)\s*([a-z]+)\s*damage/i.exec(body);
  if (!hit || !dmg) return null;
  const type = dmg[2].toLowerCase();
  return {
    name: name || "Attack",
    toHit: Number(hit[1]),
    dice: dmg[1].replace(/\s+/g, ""),
    type: (dmgSet.has(type) ? type : "bludgeoning") as DamageType,
    count: 1,
  };
}

function aoeFromBody(name: string, raw: string): BuilderAoe | null {
  const body = raw.replace(/[*_]/g, " ");
  const dc = /DC\s*(\d+)\s*([A-Za-z]+)\s*(?:saving throw|save)/i.exec(body);
  const dmg = /(?:taking|takes?|Hit:)\s*\d+\s*\(([0-9d +-]+?)\)\s*([a-z]+)\s*damage/i.exec(body);
  if (!dc || !dmg) return null;
  const shapeM = /(\d+)[- ]?(?:foot|ft\.?)[- ]?(cone|line|cube|cylinder|sphere|radius|emanation)/i.exec(body);
  const abil = dc[2].slice(0, 3).toLowerCase();
  const rc = /\(recharge\s*(\d)(?:\s*[–-]\s*(\d))?\)/i.exec(name + " " + body);
  const type = dmg[2].toLowerCase();
  return {
    name: name || "Breath",
    shape: (() => {
      const s = shapeM?.[2].toLowerCase();
      if (s === "line") return "line";
      if (s === "radius" || s === "sphere" || s === "cylinder" || s === "cube" || s === "emanation") return "sphere";
      return "cone";
    })(),
    size: shapeM ? Number(shapeM[1]) : 30,
    ability: (ABILITIES as readonly string[]).includes(abil) ? (abil as Ability) : "dex",
    dc: Number(dc[1]),
    dice: dmg[1].replace(/\s+/g, ""),
    type: (dmgSet.has(type) ? type : "fire") as DamageType,
    recharge: rc ? (rc[1] === "4" ? "roll:4-6" : "roll:5-6") : "none",
  };
}

function applyMultiattack(text: string, attacks: BuilderAttack[]): void {
  // "one with its bite and two with its claws" / "makes two scimitar attacks"
  const NUM = `${Object.keys(WORD_NUM).join("|")}|\\d+`;
  const toN = (s: string): number => WORD_NUM[s.toLowerCase()] ?? Number(s);
  let matchedAny = false;
  for (const a of attacks) {
    const first = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(/\s+/)[0];
    // a number, then at most 4 words, then the attack's name (allow a trailing plural s)
    const m = new RegExp(`\\b(${NUM})\\b(?:\\s+\\w+){0,4}?\\s+${first}s?\\b`, "i").exec(text);
    if (m) { a.count = toN(m[1]) || a.count; matchedAny = true; }
  }
  // "makes two (melee/weapon) attacks" with no attack named and only one attack on the block
  if (!matchedAny && attacks.length === 1) {
    const m = new RegExp(`makes?\\s+(${NUM})\\s+\\w*\\s*attacks?`, "i").exec(text);
    if (m) attacks[0].count = toN(m[1]) || attacks[0].count;
  }
}

const SECTION_WORDS = /^(actions?|legendary actions?|bonus actions?|reactions?|traits?|villain actions?|lair actions?|regional effects?)$/i;

export function parseStatblockMarkdown(md: string): StatblockParse {
  const warnings: string[] = [];
  const clean = md.replace(/\r/g, "").replace(/^>\s?/gm, ""); // strip blockquote homebrewery
  const draft = emptyDraft();

  // name: the first heading or bold-only line that isn't a section label
  const lines = clean.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^#{1,4}\s+(.+?)\s*$/.exec(line);
    const b = /^\*{2}([^*][^\n*]{1,58})\*{2}\s*$/.exec(line);
    const cand = (h?.[1] ?? b?.[1] ?? "").replace(/\*+/g, "").trim();
    if (cand && !SECTION_WORDS.test(cand) && /[A-Za-z]/.test(cand)) { draft.name = cand; break; }
    if (h || b) continue; // a section heading with no name yet — keep scanning
    break; // first content line wasn't a heading/bold — stop looking
  }

  const sizeM = /\b(tiny|small|medium|large|huge|gargantuan)\b\s+[A-Za-z]/i.exec(clean);
  if (sizeM) draft.size = SIZE_WORD[sizeM[1].toLowerCase()];

  const ac = mdField(clean, "Armor Class") || mdField(clean, "AC");
  if (ac) { const n = /\d+/.exec(ac); if (n) draft.ac = Number(n[0]); } else warnings.push("no Armor Class found");

  const hp = mdField(clean, "Hit Points") || mdField(clean, "HP");
  if (hp) {
    const dice = /\(([0-9]+d[0-9]+(?:\s*[+-]\s*[0-9]+)?)\)/.exec(hp);
    const flat = /^\s*(\d+)/.exec(hp);
    draft.hp = dice ? dice[1].replace(/\s+/g, "") : flat ? flat[1] : draft.hp;
  } else warnings.push("no Hit Points found");

  const { abilities, saves } = parseAbilityBlock(clean);
  draft.abilities = abilities;
  draft.proficientSaves = saves;

  const crM = /\*\*(?:Challenge|CR)\*\*[:\s]*([0-9/]+)/i.exec(clean);
  if (crM) draft.cr = crM[1];
  else warnings.push("no Challenge rating found — defaulted to 10");
  const pbM = /Proficiency Bonus\s*\+(\d+)/i.exec(clean);
  draft.pb = pbM ? Number(pbM[1]) : suggestedPb(draft.cr);

  parseDamageLine(clean, "Damage Resistances", draft.damage, "resist");
  parseDamageLine(clean, "Damage Immunities", draft.damage, "immune");
  parseDamageLine(clean, "Damage Vulnerabilities", draft.damage, "vuln");
  const ci = mdField(clean, "Condition Immunities");
  if (ci) draft.conditionImmunities = BUILDER_CONDITIONS.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(ci));
  void condSet;

  // actions: everything from "### Actions" (or the first action-looking line) to the next "###"
  const actionsStart = /(^|\n)#{2,4}\s*Actions?\b/i.exec(clean);
  const legendaryStart = /(^|\n)#{2,4}\s*Legendary Actions?\b/i.exec(clean);
  const actionsText = actionsStart
    ? clean.slice(actionsStart.index, legendaryStart ? legendaryStart.index : undefined)
    : clean;

  const blocks = actionBlocks(actionsText);
  const attacks: BuilderAttack[] = [];
  let multiattackText = "";
  for (const b of blocks) {
    if (/^multiattack$/i.test(b.name)) { multiattackText = b.body; continue; }
    const atk = attackFromBody(b.name, b.body);
    if (atk) { attacks.push(atk); continue; }
    if (!draft.aoe) {
      const ao = aoeFromBody(b.rawName, b.body);
      if (ao) { draft.aoe = ao; continue; }
    }
  }
  if (multiattackText && attacks.length) applyMultiattack(multiattackText, attacks);
  if (attacks.length) draft.attacks = attacks;
  else if (!draft.aoe) {
    warnings.push("couldn't read any attacks — added a generic CR-scaled strike; edit it in the builder");
    draft.attacks = [genericStrike(draft.cr)];
  }

  if (legendaryStart) {
    const legText = clean.slice(legendaryStart.index);
    const budgetM = /can take (\d+) legendary/i.exec(legText) || /(\d+)\s*legendary action/i.exec(legText);
    draft.legendary = true;
    draft.legendaryBudget = budgetM ? Math.min(5, Number(budgetM[1])) : 3;
    draft.legendaryAttacks = draft.attacks.filter((a) => new RegExp(`\\b${a.name.split(/\s+/)[0]}\\b`, "i").test(legText)).map((a) => a.name);
    if (!draft.legendaryAttacks.length && draft.attacks.length) {
      draft.legendaryAttacks = [draft.attacks[0].name];
      warnings.push("legendary actions present but their names didn't match an attack — set to spend the first attack; adjust in the builder");
    }
  }

  const gotSomething = draft.attacks.length > 0 || !!draft.aoe || draft.ac !== emptyDraft().ac;
  if (!gotSomething) return { warnings, error: "couldn't read a stat block out of that text" };
  if (!draft.name) warnings.push("no name found — set one in the builder");
  return { draft, warnings };
}

function genericStrike(cr: string): BuilderAttack {
  const n = Number(String(cr).includes("/") ? 0 : cr) || 1;
  const pb = suggestedPb(cr);
  const dieCount = Math.max(1, Math.round(1 + n / 6));
  return { name: "Strike", toHit: pb + 4, dice: `${dieCount}d10+${3 + Math.floor(n / 4)}`, type: "bludgeoning", count: n >= 5 ? 2 : 1 };
}

/** 5e.tools bestiary JSON entry → draft (their `{@hit}` / `{@damage}` / `{@dc}` tags parse cleanly) */
export function parse5eToolsBestiary(obj: unknown): StatblockParse {
  const warnings: string[] = [];
  const m = obj as Record<string, unknown>;
  if (!m || typeof m !== "object" || !("name" in m)) return { warnings, error: "not a 5e.tools bestiary entry" };
  const draft = emptyDraft();
  const strip = (s: string): string =>
    s.replace(/\{@hit\s+(\d+)\}/g, "+$1")
      .replace(/\{@dc\s+(\d+)\}/g, "DC $1")
      .replace(/\{@h\}/g, "Hit: ")
      .replace(/\{@(?:atk|hom|scaledamage|scaledice)[^}]*\}/g, "")
      .replace(/\{@(?:damage|dice|spell|creature|condition|skill|action|recharge|chance|hazard)\s+([^|}]+)(?:\|[^}]*)?\}/g, "$1")
      .replace(/\{@[a-z]+\s+([^|}]+)(?:\|[^}]*)?\}/g, "$1")
      .replace(/\{@[a-z]+\}/g, "")
      .trim();

  draft.name = String(m.name ?? "");
  const sz = Array.isArray(m.size) ? String(m.size[0]) : String(m.size ?? "");
  draft.size = ({ T: "tiny", S: "small", M: "medium", L: "large", H: "huge", G: "gargantuan" } as Record<string, Size>)[sz] ?? "medium";
  const ac = Array.isArray(m.ac) ? (m.ac[0] as { ac?: number } | number) : (m.ac as number | undefined);
  draft.ac = typeof ac === "number" ? ac : Number((ac as { ac?: number })?.ac) || draft.ac;
  const hp = m.hp as { average?: number; formula?: string } | undefined;
  draft.hp = hp?.formula?.replace(/\s+/g, "") || String(hp?.average ?? draft.hp);
  for (const ab of ABILITIES) if (m[ab] != null) draft.abilities[ab] = Number(m[ab]);
  draft.cr = typeof m.cr === "object" ? String((m.cr as { cr?: string }).cr ?? "10") : String(m.cr ?? "10");
  draft.pb = suggestedPb(draft.cr);
  if (m.save && typeof m.save === "object") draft.proficientSaves = ABILITIES.filter((ab) => ab in (m.save as object));
  const dmgInto = (arr: unknown, kind: DmgDefense): void => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      const s = JSON.stringify(raw).toLowerCase();
      for (const t of DAMAGE_TYPES) if (s.includes(t)) draft.damage[t] = kind;
    }
  };
  dmgInto(m.resist, "resist");
  dmgInto(m.immune, "immune");
  dmgInto(m.vulnerable, "vuln");
  if (Array.isArray(m.conditionImmune)) {
    const s = m.conditionImmune.map((x) => String(x).toLowerCase());
    draft.conditionImmunities = BUILDER_CONDITIONS.filter((c) => s.some((x) => x.includes(c)));
  }

  const acts = (Array.isArray(m.action) ? m.action : []) as { name?: string; entries?: unknown[] }[];
  const attacks: BuilderAttack[] = [];
  let multiattackText = "";
  for (const a of acts) {
    const nm = String(a.name ?? "").replace(/\([^)]*\)\s*$/, "").trim();
    const body = strip((a.entries ?? []).map((e) => (typeof e === "string" ? e : "")).join(" "));
    if (/^multiattack$/i.test(nm)) { multiattackText = body; continue; }
    const atk = attackFromBody(nm, body);
    if (atk) { attacks.push(atk); continue; }
    if (!draft.aoe) { const ao = aoeFromBody(nm, body); if (ao) draft.aoe = ao; }
  }
  if (multiattackText && attacks.length) applyMultiattack(multiattackText, attacks);
  if (attacks.length) draft.attacks = attacks;
  else if (!draft.aoe) { draft.attacks = [genericStrike(draft.cr)]; warnings.push("no attacks parsed — added a generic strike"); }

  const legN = Number((m.legendaryActions as number) ?? (Array.isArray(m.legendary) ? 3 : 0));
  if (legN > 0 && Array.isArray(m.legendary)) {
    draft.legendary = true;
    draft.legendaryBudget = Math.min(5, legN);
    const legText = JSON.stringify(m.legendary).toLowerCase();
    draft.legendaryAttacks = draft.attacks.filter((a) => legText.includes(a.name.toLowerCase().split(/\s+/)[0])).map((a) => a.name);
  }
  if (!draft.name) return { warnings, error: "entry has no name" };
  return { draft, warnings };
}

/** sniff JSON vs markdown and dispatch */
export function parseStatblock(text: string): StatblockParse {
  const t = text.trim();
  if (!t) return { warnings: [], error: "nothing to parse" };
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const obj = JSON.parse(t);
      const entry = Array.isArray(obj) ? obj[0] : (obj as { monster?: unknown[] }).monster?.[0] ?? obj;
      return parse5eToolsBestiary(entry);
    } catch (e) {
      return { warnings: [], error: `looks like JSON but didn't parse: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return parseStatblockMarkdown(t);
}

// ------------------------------------------------- turn an NPC note into a block

/**
 * Pull the "## Stat Block" (or Statblock / Stat-block) section out of a note
 * body. The section runs until the next heading of the same or higher level
 * (so its own `### Actions` / `### Legendary Actions` sub-headings stay in).
 */
export function extractStatblockSection(body: string): string | null {
  const head = /(^|\n)(#{1,6})\s*stat[\s-]?block\b[^\n]*\n/i.exec(body);
  if (!head) return null;
  const level = head[2].length;
  const rest = body.slice(head.index + head[0].length);
  const nextHead = new RegExp(`\\n#{1,${level}}\\s`).exec(rest);
  const section = (nextHead ? rest.slice(0, nextHead.index) : rest).trim();
  return section.length > 40 ? section : null;
}

export interface NpcNoteInput {
  title: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
}

/**
 * Build a custom monster from an NPC note: parse its "## Stat Block" body if it
 * has one, otherwise fall back to the note's frontmatter (ac / hp / stats / cr)
 * plus a generic CR-scaled attack so it can still fight.
 */
export function npcNoteToMonster(note: NpcNoteInput): { combatant?: Combatant; warnings: string[]; error?: string } {
  const fm = note.frontmatter ?? {};
  const section = note.body ? extractStatblockSection(note.body) : null;

  if (section) {
    const p = parseStatblockMarkdown(section);
    if (p.draft) {
      p.draft.name = note.title || p.draft.name;
      const r = draftToCombatant(p.draft);
      if (r.combatant) return { combatant: r.combatant, warnings: [...p.warnings, ...r.warnings] };
      return { warnings: p.warnings, error: r.error };
    }
  }

  // frontmatter-only fallback
  const draft = emptyDraft();
  draft.name = note.title || String(fm.name ?? "NPC");
  if (fm.ac != null) draft.ac = Number(fm.ac) || draft.ac;
  const hp = fm.maxHp ?? fm.hp;
  if (hp != null) draft.hp = String(hp);
  const stats = fm.stats as Partial<Record<Ability, unknown>> | undefined;
  if (stats) for (const ab of ABILITIES) if (stats[ab] != null) draft.abilities[ab] = Number(stats[ab]) || 10;
  if (fm.cr != null && String(fm.cr).trim()) draft.cr = String(fm.cr).trim();
  draft.pb = suggestedPb(draft.cr);
  draft.attacks = [genericStrike(draft.cr)];
  const r = draftToCombatant(draft);
  if (r.combatant) {
    return {
      combatant: r.combatant,
      warnings: [
        section ? "stat-block section didn't parse" : "no \"## Stat Block\" section in the note — used its frontmatter plus a generic CR-scaled attack",
        ...r.warnings,
      ],
    };
  }
  return { warnings: [], error: r.error ?? "couldn't build a monster from this note" };
}
