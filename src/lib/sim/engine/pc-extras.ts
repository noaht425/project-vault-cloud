// Racial traits, feats, and magic items — shared by the PC-note import path
// (`pcNoteToCombatant`, mode "note") and the per-PC picker in the simulator UI
// (`buildParty`, mode "picker"). Pure functions over a built Combatant.
//
// mode "note":  a written PC sheet's ac / maxHp / ability scores are final (they
//   already bake in armour, Tough, ability items), so anything that ONLY moves
//   those is recognised and reported, not re-applied.
// mode "picker": layering onto a plain template, so the ac / hp / score deltas
//   ARE applied.

import type { Ability, AutomationNode, Combatant, DamageType } from "../schema";

const mod = (score: number): number => Math.floor((score - 10) / 2);
const pbForLevel = (lvl: number): number => 2 + Math.floor((Math.max(1, Math.min(20, lvl)) - 1) / 4);

export type BuildMode = "note" | "picker";

type AtkEff = Extract<AutomationNode, { type: "attack" }>;
const DIE_ONLY = /^\s*\d+d\d+([+-]\d+)?\s*$/;

/** Rewrite each swing of the `attack` action through `fn`. */
function mutateWeaponSwings(c: Combatant, fn: (e: AtkEff) => AtkEff): Combatant {
  return {
    ...c,
    actions: c.actions.map((a) =>
      a.id !== "attack"
        ? a
        : {
            ...a,
            automation: a.automation.map((n) =>
              n.type === "target" ? { ...n, effects: n.effects.map((e) => (e.type === "attack" ? fn(e) : e)) } : n,
            ),
          },
    ),
  };
}

/** Append `n` more swings to the `attack` action, cloned from the last swing and
 *  optionally tweaked (Polearm Master haft = 1d4, off-hand = drop the mod, …). */
function addWeaponSwings(c: Combatant, n: number, tweak?: (e: AtkEff) => AtkEff): Combatant {
  return {
    ...c,
    actions: c.actions.map((a) => {
      if (a.id !== "attack") return a;
      return {
        ...a,
        automation: a.automation.map((node) => {
          if (node.type !== "target") return node;
          const swings = node.effects.filter((e): e is AtkEff => e.type === "attack");
          const last = swings[swings.length - 1];
          if (!last) return node;
          const extra = Array.from({ length: n }, () => {
            const clone = JSON.parse(JSON.stringify(last)) as AtkEff;
            return tweak ? tweak(clone) : clone;
          });
          return { ...node, effects: [...node.effects, ...extra] };
        }),
      };
    }),
  };
}

/** The weapon's own damage type (for a flat power-attack rider). */
function weaponDamageType(c: Combatant): DamageType {
  const atk = c.actions.find((a) => a.id === "attack");
  for (const n of atk?.automation ?? []) {
    if (n.type !== "target") continue;
    for (const e of n.effects) {
      if (e.type !== "attack") continue;
      const d = e.onHit.find((h) => h.type === "damage");
      if (d?.type === "damage") return d.damageType;
    }
  }
  return "slashing";
}

/** +n to the first "NdM(+k)" die in an onHit list (leaves spell strings alone). */
function bumpFirstDie(onHit: AutomationNode[], n: number): AutomationNode[] {
  let done = false;
  return onHit.map((h) => {
    if (done || h.type !== "damage" || !DIE_ONLY.test(h.amount)) return h;
    done = true;
    return { ...h, amount: h.amount.replace(/^\s*(\d+d\d+)([+-]\d+)?\s*$/, (_m, d, k) => `${d}+${(k ? Number(k) : 0) + n}`) };
  });
}

const addRider = (onHit: AutomationNode[], amount: string, type: DamageType): AutomationNode[] => [
  ...onHit,
  { type: "damage", amount, damageType: type },
];

const raiseAbility = (ab: Combatant["abilities"], key: Ability, to: number): Combatant["abilities"] =>
  ab[key] >= to ? ab : { ...ab, [key]: to };

const withResist = (c: Combatant, t: DamageType): Combatant =>
  c.resistances.includes(t) ? c : { ...c, resistances: [...c.resistances, t] };

const withSpecialRule = (c: Combatant, r: Combatant["specialRules"][number]): Combatant => ({
  ...c,
  specialRules: [...c.specialRules, r],
});

// ----------------------------- racial traits ------------------------------

const RACE_PATTERNS: [RegExp, string][] = [
  [/dragonborn|draconblood|ravenite/i, "dragonborn"],
  [/half[-\s]?orc/i, "half-orc"],
  [/\borc\b/i, "orc"],
  [/halfling|lightfoot|stout|ghostwise/i, "halfling"],
  [/tiefling|infernal|abyssal legacy/i, "tiefling"],
  [/aasimar/i, "aasimar"],
  [/dwarf|dwarven|duergar/i, "dwarf"],
  [/goliath/i, "goliath"],
  [/\bgnome\b|rock gnome|deep gnome|svirfneblin/i, "gnome"],
  [/\belf\b|eladrin|\bdrow\b|half[-\s]?elf/i, "elf"],
  [/human|variant human/i, "human"],
];

export function raceKey(s: string): string | null {
  for (const [re, k] of RACE_PATTERNS) if (re.test(s)) return k;
  return null;
}

const DRACONIC: [RegExp, DamageType][] = [
  [/silver|white/i, "cold"],
  [/blue|bronze/i, "lightning"],
  [/green/i, "poison"],
  [/black|copper/i, "acid"],
  [/gold|brass|red/i, "fire"],
];

function dragonbornBreath(c: Combatant, level: number, ancestry: string): Combatant {
  const type = DRACONIC.find(([re]) => re.test(ancestry))?.[1] ?? "fire";
  const save: Ability = type === "acid" || type === "poison" ? "con" : "dex";
  const dice = level >= 16 ? "5d6" : level >= 11 ? "4d6" : level >= 6 ? "3d6" : "2d6";
  const dc = 8 + pbForLevel(level) + mod(c.abilities.con);
  const c2 = withResist(c, type);
  return {
    ...c2,
    resources: { ...c2.resources, breath_weapon: { max: 1, recharge: "shortRest" } },
    actions: [
      ...c2.actions,
      {
        id: "breath-weapon",
        name: "Breath Weapon",
        cost: { action: 1 },
        recharge: "none",
        limitedUse: { resource: "breath_weapon", amount: 1 },
        automation: [
          {
            type: "target",
            who: { who: "area", shape: "cone", size: 15 },
            effects: [
              {
                type: "save",
                ability: save,
                dc,
                onFail: [{ type: "damage", amount: dice, damageType: type }],
                onSuccess: [{ type: "damage", amount: dice, damageType: type, half: true }],
              },
            ],
          },
        ],
        text: "racial breath weapon (recharges on a short rest)",
      },
    ],
    ai: { ...c2.ai, opener: [...c2.ai.opener, "breath-weapon"] },
  };
}

/** Apply racial traits that touch the fight. `raw` is the note's race string. */
export function applyRace(c: Combatant, raw: string, level: number): { c: Combatant; notes: string[] } {
  const key = raceKey(raw || "");
  if (!key) return { c, notes: raw ? [`race "${raw}" not recognised — no racial traits applied`] : [] };
  const notes: string[] = [];
  let out = c;
  switch (key) {
    case "dragonborn":
      out = dragonbornBreath(out, level, raw);
      notes.push("Dragonborn: breath weapon (scaling, 1/short rest) + damage resistance");
      break;
    case "half-orc":
    case "orc":
      out = withSpecialRule(out, { rule: "undyingReturn", returnHp: 1, oncePer: "encounter" });
      notes.push("Relentless Endurance: drops to 1 HP instead of 0, once per fight");
      notes.push("Savage Attacks (extra weapon die on a crit) is not modeled");
      break;
    case "tiefling":
      out = withResist(out, "fire");
      notes.push("Hellish Resistance: fire resistance");
      break;
    case "aasimar":
      out = withResist(withResist(out, "necrotic"), "radiant");
      notes.push("Celestial Resistance: necrotic + radiant resistance");
      break;
    case "dwarf":
      out = withResist(out, "poison");
      notes.push("Dwarven Resilience: poison resistance");
      break;
    case "halfling":
      notes.push("Halfling Lucky / Brave: reroll-1s and fear advantage are not modeled");
      break;
    case "goliath":
      notes.push("Stone's Endurance (1/short-rest damage soak) is not modeled");
      break;
    case "elf":
      notes.push("Fey Ancestry (charm advantage, no sleep) is not modeled");
      break;
    default:
      break;
  }
  return { c: out, notes };
}

// -------------------------------- feats ---------------------------------

interface FeatDef {
  id: string;
  re: RegExp;
  /** stat-only: already in a PC sheet's numbers, so note-import only reports it */
  passive?: boolean;
  apply: (c: Combatant, level: number, m: RegExpMatchArray) => Combatant;
  note: (applied: boolean) => string;
}

const ABBR: Record<string, Ability> = {
  str: "str", strength: "str", dex: "dex", dexterity: "dex", con: "con", constitution: "con",
  int: "int", intelligence: "int", wis: "wis", wisdom: "wis", cha: "cha", charisma: "cha",
};

const FEATS: FeatDef[] = [
  {
    id: "great-weapon-master",
    re: /great[-\s]?weapon master|\bGWM\b/i,
    apply: (c) => {
      const t = weaponDamageType(c);
      return mutateWeaponSwings(c, (e) => ({
        ...e,
        bonus: typeof e.bonus === "number" ? e.bonus - 5 : e.bonus,
        onHit: addRider(e.onHit, "10", t),
      }));
    },
    note: (ok) => (ok ? "Great Weapon Master: −5 to hit / +10 damage on weapon swings (on-crit bonus attack not modeled)" : "Great Weapon Master seen"),
  },
  {
    id: "sharpshooter",
    re: /sharp[-\s]?shooter/i,
    apply: (c) => {
      const t = weaponDamageType(c);
      return mutateWeaponSwings(c, (e) => ({
        ...e,
        bonus: typeof e.bonus === "number" ? e.bonus - 5 : e.bonus,
        onHit: addRider(e.onHit, "10", t),
      }));
    },
    note: (ok) => (ok ? "Sharpshooter: −5 to hit / +10 damage on ranged swings (cover ignored is n/a here)" : "Sharpshooter seen"),
  },
  {
    id: "polearm-master",
    re: /pole[-\s]?arm master|\bPAM\b/i,
    apply: (c) =>
      addWeaponSwings(c, 1, (e) => ({
        ...e,
        onHit: e.onHit.map((h) =>
          h.type === "damage" && DIE_ONLY.test(h.amount)
            ? { ...h, amount: h.amount.replace(/^\s*\d+d\d+/, "1d4") }
            : h,
        ),
      })),
    note: (ok) => (ok ? "Polearm Master: +1 bonus-action haft swing (1d4)" : "Polearm Master seen"),
  },
  {
    id: "crossbow-expert",
    re: /crossbow expert|\bCBE\b/i,
    apply: (c) =>
      addWeaponSwings(c, 1, (e) => ({
        ...e,
        onHit: e.onHit.map((h) =>
          h.type === "damage" && DIE_ONLY.test(h.amount)
            ? { ...h, amount: h.amount.replace(/^\s*\d+d\d+/, "1d6") }
            : h,
        ),
      })),
    note: (ok) => (ok ? "Crossbow Expert: +1 bonus-action hand-crossbow shot (1d6)" : "Crossbow Expert seen"),
  },
  {
    id: "dual-wielder",
    re: /dual wielder|two[-\s]weapon fighting/i,
    apply: (c) => ({ ...addWeaponSwings(c, 1), ac: c.ac + 1 }),
    note: (ok) => (ok ? "Dual Wielder: +1 off-hand swing, +1 AC" : "Dual Wielder seen"),
  },
  {
    id: "savage-attacker",
    re: /savage attacker/i,
    apply: (c) => c,
    note: () => "Savage Attacker (reroll weapon damage 1/turn) ≈ negligible in aggregate — not modeled",
  },
  {
    id: "heavy-armor-master",
    re: /heavy armou?r master/i,
    apply: (c) => withSpecialRule(c, { rule: "flatDamageReduction", amount: 3 }),
    note: (ok) => (ok ? "Heavy Armor Master: −3 from each hit (approx; applies to all damage in the sim, not just nonmagical b/p/s)" : "Heavy Armor Master seen"),
  },
  {
    id: "elemental-adept",
    re: /elemental adept\s*\(?\s*(acid|cold|fire|lightning|thunder)/i,
    apply: (c, _l, m) => {
      const t = m[1].toLowerCase() as DamageType;
      return {
        ...c,
        actions: c.actions.map((a) =>
          !a.isSpell
            ? a
            : {
                ...a,
                automation: mapDamageNodes(a.automation, (d) => (d.damageType === t ? { ...d, ignoreResistances: true } : d)),
              },
        ),
      };
    },
    note: (ok) => (ok ? "Elemental Adept: matching spell damage ignores resistance" : "Elemental Adept seen (specify an element, e.g. \"Elemental Adept (fire)\")"),
  },
  {
    id: "resilient",
    re: /resilient\s*\(?\s*(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)/i,
    passive: true,
    apply: (c, _l, m) => {
      const ab = ABBR[m[1].toLowerCase()];
      return c.proficientSaves.includes(ab) ? c : { ...c, proficientSaves: [...c.proficientSaves, ab] };
    },
    note: (ok) => (ok ? "Resilient: added the save proficiency (the +1 ability score is already in your sheet)" : "Resilient seen"),
  },
  {
    id: "tough",
    re: /\btough\b/i,
    passive: true,
    apply: (c, level) => ({ ...c, maxHp: (typeof c.maxHp === "number" ? c.maxHp : Number.parseInt(String(c.maxHp), 10) || 0) + 2 * level }),
    note: (ok) => (ok ? "Tough: +2 HP per level" : "Tough — its +2 HP/level is already in your sheet's HP"),
  },
  {
    id: "alert",
    re: /\balert\b/i,
    apply: (c) => withSpecialRule(c, { rule: "cannotBeSurprised" }),
    note: (ok) => (ok ? "Alert: cannot be surprised (the initiative bonus is not modeled)" : "Alert seen"),
  },
  {
    id: "lucky",
    re: /\blucky\b/i,
    apply: (c) => c,
    note: () => "Lucky (3 luck points / reroll) is not modeled",
  },
  {
    id: "war-caster",
    re: /war ?caster/i,
    apply: (c) => c,
    note: () => "War Caster (advantage on concentration saves) is not modeled",
  },
  {
    id: "sentinel",
    re: /\bsentinel\b/i,
    apply: (c) => c,
    note: () => "Sentinel (movement lock, extra opportunity attacks) needs a movement model — not simulated",
  },
  {
    id: "mobile",
    re: /\bmobile\b/i,
    apply: (c) => c,
    note: () => "Mobile (speed, disengage-on-attack) has no effect in this sim",
  },
];

/** Walk every `damage` node in an automation tree through `fn`. */
function mapDamageNodes(nodes: AutomationNode[], fn: (d: Extract<AutomationNode, { type: "damage" }>) => AutomationNode): AutomationNode[] {
  return nodes.map((n) => {
    switch (n.type) {
      case "damage":
        return fn(n);
      case "target":
        return { ...n, effects: mapDamageNodes(n.effects, fn) };
      case "attack":
        return { ...n, onHit: mapDamageNodes(n.onHit, fn), onMiss: n.onMiss ? mapDamageNodes(n.onMiss, fn) : n.onMiss };
      case "save":
        return { ...n, onFail: mapDamageNodes(n.onFail, fn), onSuccess: n.onSuccess ? mapDamageNodes(n.onSuccess, fn) : n.onSuccess };
      case "branch":
        return { ...n, then: mapDamageNodes(n.then, fn), else: n.else ? mapDamageNodes(n.else, fn) : n.else };
      default:
        return n;
    }
  });
}

const FEAT_HEADING = /^#{1,6}\s*(feats?|features? (?:&|and) traits?|feats? (?:&|and) traits?)\s*$/im;

/** Pull the text the feat scan should look at: a "## Feats" section if present,
 *  else bullet lines from the whole body, else the whole body. */
export function featScanText(body: string, fmFeats: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(fmFeats)) parts.push(fmFeats.map(String).join("\n"));
  else if (typeof fmFeats === "string" && fmFeats) parts.push(fmFeats);
  const h = FEAT_HEADING.exec(body);
  if (h) {
    const start = h.index + h[0].length;
    const next = /^#{1,6}\s+\S/m.exec(body.slice(start));
    parts.push(body.slice(start, next ? start + next.index : body.length));
  } else {
    parts.push(body);
  }
  return parts.join("\n");
}

/** Recognise & apply feats found in `text`. In "note" mode, passive stat feats
 *  are only reported (already baked into the sheet). */
export function applyFeats(c: Combatant, text: string, level: number, mode: BuildMode): { c: Combatant; notes: string[]; found: string[] } {
  const notes: string[] = [];
  const found: string[] = [];
  let out = c;
  for (const f of FEATS) {
    const m = f.re.exec(text);
    if (!m) continue;
    found.push(f.id);
    if (mode === "note" && f.passive) {
      // the stat boost is already in the sheet; still apply side effects that
      // aren't (Resilient's save proficiency), then report the rest as baked-in
      if (f.id === "resilient") out = f.apply(out, level, m);
      notes.push(f.note(false));
    } else {
      out = f.apply(out, level, m);
      notes.push(f.note(true));
    }
  }
  return { c: out, notes, found };
}

// ----------------------------- magic items ------------------------------

interface ItemDef {
  id: string;
  re: RegExp;
  /** effect is already in a written PC sheet (AC / HP / ability scores) — on
   *  note import it's only reported; the picker (layering onto a template) applies it */
  bakedInNote?: boolean;
  apply: (c: Combatant, m: RegExpMatchArray, mode: BuildMode) => Combatant;
  note: (applied: boolean, m: RegExpMatchArray) => string;
}

const BELT_STR: Record<string, number> = { hill: 21, stone: 23, frost: 23, fire: 25, cloud: 27, storm: 29 };
const IOUN_ABILITY: Record<string, Ability> = {
  strength: "str", intellect: "int", agility: "dex", fortitude: "con", insight: "wis", leadership: "cha",
};

/** +n to numeric spell attack rolls on `isSpell` actions, and (unless `attackOnly`)
 *  to numeric save DCs too. */
function bumpSpellNumbers(c: Combatant, n: number, attackOnly = false): Combatant {
  return {
    ...c,
    actions: c.actions.map((a) => {
      if (!a.isSpell) return a;
      const walk = (nodes: AutomationNode[]): AutomationNode[] =>
        nodes.map((nd) => {
          if (nd.type === "attack")
            return { ...nd, bonus: typeof nd.bonus === "number" ? nd.bonus + n : nd.bonus, onHit: walk(nd.onHit), onMiss: nd.onMiss ? walk(nd.onMiss) : nd.onMiss };
          if (nd.type === "save")
            return { ...nd, dc: !attackOnly && typeof nd.dc === "number" ? nd.dc + n : nd.dc, onFail: walk(nd.onFail), onSuccess: nd.onSuccess ? walk(nd.onSuccess) : nd.onSuccess };
          if (nd.type === "target") return { ...nd, effects: walk(nd.effects) };
          if (nd.type === "branch") return { ...nd, then: walk(nd.then), else: nd.else ? walk(nd.else) : nd.else };
          return nd;
        });
      return { ...a, automation: walk(a.automation) };
    }),
  };
}

const plusWeapon = (c: Combatant, n: number): Combatant =>
  mutateWeaponSwings(c, (e) => ({
    ...e,
    bonus: typeof e.bonus === "number" ? e.bonus + n : e.bonus,
    onHit: bumpFirstDie(e.onHit, n),
  }));

const MAGIC_ITEMS: ItemDef[] = [
  {
    id: "weapon-plus",
    re: /\+([123])\s*(?:magic\s*)?(?:weapon|sword|greatsword|longsword|shortsword|scimitar|rapier|dagger|axe|greataxe|handaxe|battleaxe|mace|maul|warhammer|hammer|flail|glaive|halberd|pike|lance|spear|trident|quarterstaff|staff|club|whip|morningstar|sickle|blade|bow|longbow|shortbow|crossbow)\b|\b(?:weapon|longsword|greatsword|greataxe|rapier|shortsword|scimitar|warhammer|maul|glaive|halberd|longbow|shortbow)\s*,?\s*\+([123])\b/i,
    apply: (c, m) => plusWeapon(c, Number(m[1] ?? m[2])),
    note: (ok, m) => (ok ? `+${m[1] ?? m[2]} weapon: to hit and damage` : "magic weapon seen"),
  },
  {
    id: "armor-plus",
    re: /\+([123])\s*(?:armou?r|plate|half[-\s]?plate|breastplate|chain (?:mail|shirt)|scale mail|splint|studded leather|leather armou?r|hide armou?r|ring mail|padded armou?r)\b|\b(?:armou?r|plate|breastplate|chain mail|studded leather)\s*,?\s*\+([123])\b/i,
    bakedInNote: true,
    apply: (c, m) => ({ ...c, ac: c.ac + Number(m[1] ?? m[2]) }),
    note: (ok, m) => (ok ? `+${m[1] ?? m[2]} armor: +AC` : "+X armor — assumed already in your sheet's AC"),
  },
  {
    id: "shield-plus",
    re: /\+([123])\s*shield\b|\bshield\s*,?\s*\+([123])\b/i,
    bakedInNote: true,
    apply: (c, m) => ({ ...c, ac: c.ac + Number(m[1] ?? m[2]) }),
    note: (ok, m) => (ok ? `+${m[1] ?? m[2]} shield: +AC` : "+X shield — assumed already in your sheet's AC"),
  },
  {
    id: "cloak-of-protection",
    re: /cloak of protection/i,
    apply: (c, _m, mode) => ({ ...c, saveBonusAll: c.saveBonusAll + 1, ac: mode === "picker" ? c.ac + 1 : c.ac }),
    note: (ok) => (ok ? "Cloak of Protection: +1 to all saves (AC bonus assumed already in your sheet)" : "Cloak of Protection seen"),
  },
  {
    id: "ring-of-protection",
    re: /ring of protection/i,
    apply: (c, _m, mode) => ({ ...c, saveBonusAll: c.saveBonusAll + 1, ac: mode === "picker" ? c.ac + 1 : c.ac }),
    note: (ok) => (ok ? "Ring of Protection: +1 to all saves (AC bonus assumed already in your sheet)" : "Ring of Protection seen"),
  },
  {
    id: "bracers-of-defense",
    re: /bracers of defense/i,
    bakedInNote: true,
    apply: (c) => ({ ...c, ac: c.ac + 2 }),
    note: (ok) => (ok ? "Bracers of Defense: +2 AC" : "Bracers of Defense — assumed already in your sheet's AC"),
  },
  {
    id: "staff-of-power",
    re: /staff of power/i,
    apply: (c, _m, mode) => bumpSpellNumbers({ ...c, saveBonusAll: c.saveBonusAll + 2, ac: mode === "picker" ? c.ac + 2 : c.ac }, 2),
    note: (ok) => (ok ? "Staff of Power: +2 to saves and to spell attack/DC (+2 AC assumed already in your sheet)" : "Staff of Power seen"),
  },
  {
    id: "wand-of-the-war-mage",
    re: /wand of the war ?mage[^.\n]*?\+([123])/i,
    apply: (c, m) => bumpSpellNumbers(c, Number(m[1]), true),
    note: (ok, m) => (ok ? `Wand of the War Mage +${m[1]}: to spell attack rolls` : "Wand of the War Mage seen"),
  },
  {
    id: "rod-of-the-pact-keeper",
    re: /rod of the pact ?keeper[^.\n]*?\+([123])/i,
    apply: (c, m) => bumpSpellNumbers(c, Number(m[1])),
    note: (ok, m) => (ok ? `Rod of the Pact Keeper +${m[1]}: to spell attack and save DC` : "Rod of the Pact Keeper seen"),
  },
  {
    id: "flame-tongue",
    re: /flame tongue/i,
    apply: (c) => mutateWeaponSwings(c, (e) => ({ ...e, onHit: addRider(e.onHit, "2d6", "fire") })),
    note: (ok) => (ok ? "Flame Tongue: +2d6 fire on a hit" : "Flame Tongue seen"),
  },
  {
    id: "frost-brand",
    re: /frost brand/i,
    apply: (c) => withResist(mutateWeaponSwings(c, (e) => ({ ...e, onHit: addRider(e.onHit, "1d6", "cold") })), "fire"),
    note: (ok) => (ok ? "Frost Brand: +1d6 cold on a hit, fire resistance" : "Frost Brand seen"),
  },
  {
    id: "sun-blade",
    re: /sun blade/i,
    apply: (c) => plusWeapon(c, 2),
    note: (ok) => (ok ? "Sun Blade: modeled as a +2 finesse weapon (the +1d8-vs-undead rider is conditional and left off)" : "Sun Blade seen"),
  },
  {
    id: "amulet-of-health",
    re: /amulet of health/i,
    bakedInNote: true,
    apply: (c) => ({ ...c, abilities: raiseAbility(c.abilities, "con", 19) }),
    note: (ok) => (ok ? "Amulet of Health: CON set to 19 (HP not recalculated — your sheet's HP stands)" : "Amulet of Health — its CON 19 is assumed already in your sheet"),
  },
  {
    id: "headband-of-intellect",
    re: /headband of intellect/i,
    bakedInNote: true,
    apply: (c) => ({ ...c, abilities: raiseAbility(c.abilities, "int", 19) }),
    note: (ok) => (ok ? "Headband of Intellect: INT set to 19" : "Headband of Intellect — its INT 19 is assumed already in your sheet"),
  },
  {
    id: "gauntlets-of-ogre-power",
    re: /gauntlets of ogre power/i,
    bakedInNote: true,
    apply: (c) => ({ ...c, abilities: raiseAbility(c.abilities, "str", 19) }),
    note: (ok) => (ok ? "Gauntlets of Ogre Power: STR set to 19" : "Gauntlets of Ogre Power — its STR 19 is assumed already in your sheet"),
  },
  {
    id: "belt-of-giant-strength",
    re: /belt of (hill|stone|frost|fire|cloud|storm)?\s*giant(?:'s)? strength/i,
    bakedInNote: true,
    apply: (c, m) => ({ ...c, abilities: raiseAbility(c.abilities, "str", BELT_STR[(m[1] ?? "hill").toLowerCase()] ?? 21) }),
    note: (ok, m) => (ok ? `Belt of ${m[1] ? m[1][0].toUpperCase() + m[1].slice(1) + " " : ""}Giant Strength: STR set to ${BELT_STR[(m[1] ?? "hill").toLowerCase()] ?? 21}` : "Belt of Giant Strength — its STR score is assumed already in your sheet"),
  },
  {
    id: "ioun-stone",
    re: /ioun stone of (strength|intellect|agility|fortitude|insight|leadership)/i,
    bakedInNote: true,
    apply: (c, m) => {
      const ab = IOUN_ABILITY[m[1].toLowerCase()];
      return { ...c, abilities: raiseAbility(c.abilities, ab, Math.min(20, c.abilities[ab] + 2)) };
    },
    note: (ok, m) => (ok ? `Ioun Stone of ${m[1]}: +2 to that ability (max 20)` : "Ioun Stone — its +2 ability is assumed already in your sheet"),
  },
];

const ITEM_HEADING = /^#{1,6}\s*(magic items?|equipment|gear|attunements?|inventory|items?|treasure)\s*$/im;

/** Text the item scan reads: an equipment-ish section, else bullet lines that
 *  look like gear, else nothing (don't scan prose — "he wore a cloak" ≠ an item). */
export function itemScanText(body: string, fmItems: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(fmItems)) parts.push(fmItems.map(String).join("\n"));
  else if (typeof fmItems === "string" && fmItems) parts.push(fmItems);
  const h = ITEM_HEADING.exec(body);
  if (h) {
    const start = h.index + h[0].length;
    const next = /^#{1,6}\s+\S/m.exec(body.slice(start));
    parts.push(body.slice(start, next ? start + next.index : body.length));
  } else {
    for (const line of body.split("\n")) if (/^\s*[-*+]\s|^\s*\d+\.\s/.test(line)) parts.push(line);
  }
  return parts.join("\n");
}

/** Recognise & apply magic items found in `text`, one match per item kind but
 *  scanned per line so several +1 weapons etc. don't collide. */
export function applyItems(c: Combatant, text: string, mode: BuildMode): { c: Combatant; notes: string[]; found: string[] } {
  const notes: string[] = [];
  const found: string[] = [];
  let out = c;
  const lines = text.split("\n");
  for (const def of MAGIC_ITEMS) {
    let m: RegExpMatchArray | null = null;
    for (const line of lines) {
      const hit = def.re.exec(line);
      if (hit) {
        m = hit;
        break;
      }
    }
    if (!m) continue;
    found.push(def.id);
    if (mode === "note" && def.bakedInNote) {
      notes.push(def.note(false, m));
    } else {
      out = def.apply(out, m, mode);
      notes.push(def.note(true, m));
    }
  }
  return { c: out, notes, found };
}

// --------------------- curated picker option lists ----------------------
// Display strings chosen so each one matches its table's regex above. The
// simulator's per-PC picker offers these; buildParty runs the picks through
// applyRace / applyFeats / applyItems in "picker" mode.

export const RACE_OPTIONS: string[] = [
  "Dragonborn (Red)",
  "Dragonborn (Silver)",
  "Dragonborn (Blue)",
  "Dragonborn (Green)",
  "Dragonborn (Black)",
  "Half-Orc",
  "Halfling",
  "Tiefling",
  "Aasimar",
  "Dwarf",
  "Elf",
  "Gnome",
  "Goliath",
  "Human",
];

export const FEAT_OPTIONS: string[] = [
  "Great Weapon Master",
  "Sharpshooter",
  "Polearm Master",
  "Crossbow Expert",
  "Dual Wielder",
  "Heavy Armor Master",
  "Elemental Adept (fire)",
  "Alert",
  "Resilient (Con)",
  "Tough",
  "Savage Attacker",
  "Lucky",
  "War Caster",
  "Sentinel",
  "Mobile",
];

export const ITEM_OPTIONS: string[] = [
  "+1 weapon",
  "+2 weapon",
  "+3 weapon",
  "+1 armor",
  "+2 armor",
  "+1 shield",
  "+2 shield",
  "Cloak of Protection",
  "Ring of Protection",
  "Bracers of Defense",
  "Amulet of Health",
  "Gauntlets of Ogre Power",
  "Belt of Hill Giant Strength",
  "Belt of Fire Giant Strength",
  "Belt of Storm Giant Strength",
  "Headband of Intellect",
  "Ioun Stone of Intellect",
  "Flame Tongue",
  "Frost Brand",
  "Sun Blade",
  "Wand of the War Mage, +2",
  "Rod of the Pact Keeper, +2",
  "Staff of Power",
];
