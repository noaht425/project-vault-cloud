// Place-name generation for the map generator's civilizations/settlements —
// same syllable-weighting mechanism as phoneticNames.ts's custom-race NPC
// names (see synthesizeWord there, reused here unmodified), but tuned
// toward RECOGNIZABLE REAL-WORLD PLACE-NAME MORPHOLOGY rather than fantasy-
// race sound. The user's own framing: "-burg" reads as Germanic, "-grad"
// reads as Eastern European — so each style below carries a small set of
// genuinely recognizable "signature" affixes (the 'end' position entries)
// alongside general-texture start/middle syllables.
//
// Unlike phoneticNames.ts's ONE shared bank soft-weighted per profile, each
// style here gets its OWN dedicated syllable pool (not merged with the
// others at generation time) — an early version tried the shared-bank/
// weighted approach and even with sharply lopsided tag weights, a
// meaningful fraction of names still drew a wrong-style syllable (e.g. a
// Germanic pick occasionally landing on an East Asian "-jing" ending),
// because every style still shares SOME tags (most lean 'short-vowel',
// say). "Sounds recognizably Germanic" is a harder bar than the fantasy
// profiles' "audibly different palette over many draws" — a single visibly
// wrong-culture ending undermines the whole point — so purity beats
// probabilistic blending here. Per-style pools still reuse the same tested
// synthesizeWord scoring/retry/pronounceability engine, just scoped to one
// style's own syllables. Deliberately a small, iterable starting set — same
// "proof of concept, expected to grow" spirit phoneticNames.ts's own history
// describes.
import { synthesizeWord, type PhoneticProfile, type PhoneticSyllable } from './phoneticNames'

const GERMANIC_NORSE_SYLLABLES: PhoneticSyllable[] = [
  { text: 'Wolf', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Stein', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Grim', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Hart', position: 'start', tags: ['plosive', 'back-of-mouth', 'guttural', 'short-vowel'] },
  { text: 'Ing', position: 'start', tags: ['nasal', 'back-of-mouth', 'short-vowel'] },
  { text: 'berg', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'mund', position: 'middle', tags: ['nasal', 'back-of-mouth', 'short-vowel'] },
  { text: 'helm', position: 'middle', tags: ['nasal', 'back-of-mouth', 'short-vowel'] },
  // Recognizable place-name suffixes.
  { text: 'burg', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'heim', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'stad', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'holm', position: 'end', tags: ['nasal', 'back-of-mouth', 'short-vowel'] },
  { text: 'vik', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }
]

const EAST_ASIAN_SYLLABLES: PhoneticSyllable[] = [
  { text: 'Kyo', position: 'start', tags: ['front-of-mouth', 'sibilant', 'short-vowel'] },
  { text: 'Ren', position: 'start', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'Mei', position: 'start', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'Sora', position: 'start', tags: ['liquid', 'front-of-mouth', 'short-vowel'] },
  { text: 'Haru', position: 'start', tags: ['liquid', 'front-of-mouth', 'short-vowel'] },
  { text: 'shi', position: 'middle', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'lan', position: 'middle', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'min', position: 'middle', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  // Common real-world place elements: mountain/capital/region/island/hill.
  { text: 'shan', position: 'end', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'jing', position: 'end', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'zhou', position: 'end', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'shima', position: 'end', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'oka', position: 'end', tags: ['nasal', 'front-of-mouth', 'short-vowel'] }
]

const ROMANCE_LATIN_SYLLABLES: PhoneticSyllable[] = [
  { text: 'Cal', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'Bel', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'Flor', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'Vera', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'Luc', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'ell', position: 'middle', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'ann', position: 'middle', tags: ['nasal', 'front-of-mouth', 'long-vowel'] },
  { text: 'ess', position: 'middle', tags: ['fricative', 'front-of-mouth', 'long-vowel'] },
  // Recognizable place-name suffixes.
  { text: 'ia', position: 'end', tags: ['front-of-mouth', 'long-vowel'] },
  { text: 'ona', position: 'end', tags: ['nasal', 'front-of-mouth', 'long-vowel'] },
  { text: 'ille', position: 'end', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'eira', position: 'end', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'etta', position: 'end', tags: ['front-of-mouth', 'long-vowel'] }
]

const SLAVIC_EASTERN_EUROPEAN_SYLLABLES: PhoneticSyllable[] = [
  { text: 'Nov', position: 'start', tags: ['fricative', 'short-vowel'] },
  { text: 'Rad', position: 'start', tags: ['affricate', 'short-vowel'] },
  { text: 'Vlad', position: 'start', tags: ['fricative', 'sibilant', 'short-vowel'] },
  { text: 'Grod', position: 'start', tags: ['affricate', 'short-vowel'] },
  { text: 'Kras', position: 'start', tags: ['sibilant', 'short-vowel'] },
  { text: 'vosk', position: 'middle', tags: ['fricative', 'sibilant', 'short-vowel'] },
  { text: 'yev', position: 'middle', tags: ['fricative', 'short-vowel'] },
  { text: 'gorod', position: 'middle', tags: ['affricate', 'short-vowel'] },
  // Recognizable place-name suffixes.
  { text: 'grad', position: 'end', tags: ['affricate', 'short-vowel'] },
  { text: 'sk', position: 'end', tags: ['sibilant', 'short-vowel'] },
  { text: 'ov', position: 'end', tags: ['fricative', 'short-vowel'] },
  { text: 'itz', position: 'end', tags: ['affricate', 'sibilant', 'short-vowel'] },
  { text: 'ensk', position: 'end', tags: ['sibilant', 'short-vowel'] }
]

// Combined only for sanity-checking coverage (tests) — generation itself
// always draws from one style's own pool via BANK_BY_STYLE_ID, never this
// merged list, so styles never cross-contaminate each other's sound.
export const PLACE_NAME_SYLLABLE_BANK: PhoneticSyllable[] = [
  ...GERMANIC_NORSE_SYLLABLES,
  ...EAST_ASIAN_SYLLABLES,
  ...ROMANCE_LATIN_SYLLABLES,
  ...SLAVIC_EASTERN_EUROPEAN_SYLLABLES
]

// syllableMin/Max of 2-3 (mostly start+end, sometimes +middle) produces
// single fused words like "Warburg" or "Novigrad" — a place name, not the
// looser "First Last" shape generateSyntheticName uses for people.
// tagWeights only shapes variety WITHIN a style's own pool now (see the
// file-level comment on why pools aren't shared) — every syllable in a
// style's own pool already carries mostly-identical top tags, so these
// mainly just favor plain syllables over the few tagged with a secondary
// flavor (e.g. Germanic's 'guttural'-tagged "Hart").
export const PLACE_NAME_STYLES: PhoneticProfile[] = [
  {
    id: 'germanic-norse',
    name: 'Germanic / Norse',
    description: 'Plosive-heavy, back-of-mouth consonants, mostly short vowels — recognizable -burg/-heim/-stad/-holm/-vik endings.',
    tagWeights: { plosive: 3, 'back-of-mouth': 2, 'short-vowel': 1.5, nasal: 1, guttural: 1 },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'east-asian',
    name: 'East Asian',
    description: 'Clean open front-of-mouth/nasal syllables, minimal consonant clusters — common place elements like -shan/-jing/-zhou/-shima.',
    tagWeights: { nasal: 2, 'front-of-mouth': 2, 'short-vowel': 1.5, sibilant: 1.3, liquid: 1 },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'romance-latin',
    name: 'Romance / Latin',
    description: 'Flowing liquid consonants and long vowels, front-of-mouth articulation — recognizable -ia/-ona/-ille/-eira/-etta endings.',
    tagWeights: { liquid: 2, 'long-vowel': 1.5, 'front-of-mouth': 1.5, nasal: 1, fricative: 1 },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'slavic-eastern-european',
    name: 'Slavic / Eastern European',
    description: 'Sibilant/affricate/fricative consonant clusters, mostly short vowels — recognizable -grad/-sk/-ov/-itz endings.',
    tagWeights: { sibilant: 2, affricate: 1.5, fricative: 1.5, 'short-vowel': 1.5 },
    syllableMin: 2,
    syllableMax: 3
  }
]

const BANK_BY_STYLE_ID: Record<string, PhoneticSyllable[]> = {
  'germanic-norse': GERMANIC_NORSE_SYLLABLES,
  'east-asian': EAST_ASIAN_SYLLABLES,
  'romance-latin': ROMANCE_LATIN_SYLLABLES,
  'slavic-eastern-european': SLAVIC_EASTERN_EUROPEAN_SYLLABLES
}

export function resolvePlaceNameStyle(id: string | null | undefined): PhoneticProfile | null {
  if (!id) return null
  return PLACE_NAME_STYLES.find((s) => s.id === id) ?? null
}

/**
 * Synthesizes one place name (a single fused word, e.g. "Warburg",
 * "Novigrad") from a style — falls back to picking uniformly among every
 * style (via the same rng, so it stays deterministic for a seeded caller)
 * when no style is given, which is what a territory/pin's null
 * namingStyleId ("Random / Mixed") means. Even the random fallback still
 * draws each individual name from ONE style's own pool (never blends
 * mid-word) — see the file-level comment on why purity beats blending here.
 */
export function generatePlaceName(style: PhoneticProfile | null, rng: () => number = Math.random): string {
  const resolved = style ?? PLACE_NAME_STYLES[Math.floor(rng() * PLACE_NAME_STYLES.length)]
  const bank = BANK_BY_STYLE_ID[resolved.id] ?? PLACE_NAME_SYLLABLE_BANK
  return synthesizeWord(bank, resolved, rng)
}
