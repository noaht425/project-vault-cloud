// Ported verbatim from the Electron app's src/common/noteTypes/creatureStats.ts.
import { z } from "zod";

// z.coerce so a hand-edited frontmatter value like ac: "15" (typed as a
// string by mistake) still parses instead of throwing, and .catch() means
// one bad field falls back to a sane default instead of breaking the form.
const scoreField = z.coerce.number().catch(10);

export const abilityScoresSchema = z
  .object({
    str: scoreField,
    dex: scoreField,
    con: scoreField,
    int: scoreField,
    wis: scoreField,
    cha: scoreField,
  })
  .catch({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

export type AbilityScores = z.infer<typeof abilityScoresSchema>;
export type AbilityKey = keyof AbilityScores;

export const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(score: number): string {
  const mod = abilityModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
