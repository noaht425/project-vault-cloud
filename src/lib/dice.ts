// Ported verbatim from the Electron app's src/common/dice.ts (pure, no
// Electron/DOM dependency). wrapBareDiceInBackticks isn't ported — nothing
// here wires inline click-to-roll into PreviewPane yet, same "not done,
// not regressed" scope cut as other deferred pieces.
export interface DiceGroup {
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: "kh" | "kl"; n: number };
  rolls: number[]; // every die's final face, before keep-filtering (post-reroll, if any)
  kept: number[]; // the dice from this group actually summed
  // Parallel to `rolls`: the original face for any die that got rerolled
  // (e.g. Great Weapon Fighting-style "reroll 1s and 2s"), undefined where
  // no reroll happened. Omitted entirely when no die in the group rerolled.
  rerolledFrom?: (number | undefined)[];
}

export interface RollOptions {
  /** Reroll any die landing at or below this value, once, keeping the new result unconditionally. */
  rerollAtOrBelow?: number;
}

export interface DiceRollResult {
  id: string;
  notation: string;
  groups: DiceGroup[]; // one per dice term, in the order they appeared
  modifier: number; // sum of all flat +/-N terms
  total: number;
  rolledAt: number; // epoch ms
}

interface ParsedDiceTerm {
  type: "dice";
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: "kh" | "kl"; n: number };
}

interface ParsedModifierTerm {
  type: "modifier";
  sign: 1 | -1;
  value: number;
}

type ParsedTerm = ParsedDiceTerm | ParsedModifierTerm;

const MAX_DICE = 100;
const MAX_SIDES = 1000;
const MAX_TERMS = 20;

const TERM_RE = /([+-]?)(\d*d\d+(?:(?:kh|kl)\d+)?|\d+)/gi;
const DICE_TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;

function parseDiceExpression(input: string): ParsedTerm[] | null {
  const cleaned = input.trim().replace(/\s*([+-])\s*/g, "$1");
  if (!cleaned) return null;

  const terms: ParsedTerm[] = [];
  let consumedUpTo = 0;
  TERM_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TERM_RE.exec(cleaned))) {
    if (match.index !== consumedUpTo) return null;
    consumedUpTo = TERM_RE.lastIndex;

    const sign: 1 | -1 = match[1] === "-" ? -1 : 1;
    const body = match[2];

    if (/d/i.test(body)) {
      const diceMatch = body.match(DICE_TERM_RE);
      if (!diceMatch) return null;
      const count = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1;
      const sides = parseInt(diceMatch[2], 10);
      if (count < 1 || count > MAX_DICE || sides < 2 || sides > MAX_SIDES) return null;
      const keep = diceMatch[3]
        ? { mode: diceMatch[3].toLowerCase() as "kh" | "kl", n: parseInt(diceMatch[4], 10) }
        : undefined;
      if (keep && (keep.n < 1 || keep.n > count)) return null;
      terms.push({ type: "dice", sign, count, sides, keep });
    } else {
      terms.push({ type: "modifier", sign, value: parseInt(body, 10) });
    }

    if (terms.length > MAX_TERMS) return null;
  }

  if (consumedUpTo !== cleaned.length || terms.length === 0) return null;
  return terms;
}

/** `rng` is injectable so tests can get deterministic results. */
export function rollDice(input: string, rng: () => number = Math.random, options: RollOptions = {}): DiceRollResult | null {
  const terms = parseDiceExpression(input);
  if (!terms) return null;

  const groups: DiceGroup[] = [];
  let modifier = 0;
  let total = 0;

  for (const term of terms) {
    if (term.type === "modifier") {
      modifier += term.sign * term.value;
      total += term.sign * term.value;
      continue;
    }

    const rolls = Array.from({ length: term.count }, () => Math.floor(rng() * term.sides) + 1);

    let rerolledFrom: (number | undefined)[] | undefined;
    if (options.rerollAtOrBelow !== undefined) {
      const threshold = options.rerollAtOrBelow;
      rolls.forEach((roll, i) => {
        if (roll > threshold) return;
        rerolledFrom ??= new Array(rolls.length).fill(undefined);
        rerolledFrom[i] = roll;
        rolls[i] = Math.floor(rng() * term.sides) + 1;
      });
    }

    let kept = rolls;
    if (term.keep) {
      const sorted = [...rolls].sort((a, b) => b - a);
      kept = term.keep.mode === "kh" ? sorted.slice(0, term.keep.n) : sorted.slice(-term.keep.n);
    }
    total += term.sign * kept.reduce((sum, r) => sum + r, 0);
    groups.push({
      sign: term.sign,
      count: term.count,
      sides: term.sides,
      keep: term.keep,
      rolls,
      kept,
      rerolledFrom,
    });
  }

  return {
    id: `${Date.now()}-${Math.floor(rng() * 1e9)}`,
    notation: input.trim(),
    groups,
    modifier,
    total,
    rolledAt: Date.now(),
  };
}
