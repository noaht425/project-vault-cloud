// A different name-generation mechanism from settlementNames.ts's whole-name
// pools: instead of picking a pre-written name, a PhoneticProfile weights
// which small syllable chunks get combined into one, letting a custom race
// have a distinctive INVENTED sound (e.g. "elves lean on f/s/sh sounds")
// without hand-writing a name list for every conceivable fantasy race. This
// is a proof-of-concept sized bank (~54 syllables, 2 contrasting profiles)
// meant to be iterated on — confirmed with the user as a starting point, not
// a finished feature. Deliberately a separate, third option alongside
// baseline races and inspiration-source pooling (see CustomRaceDef in
// noteTypes/settlement.ts) rather than combinable with either — keeps
// "pick from a list" and "synthesize from sound" from tangling together.

export const PHONETIC_MANNER_TAGS = ['fricative', 'plosive', 'nasal', 'liquid', 'sibilant', 'affricate'] as const
export const PHONETIC_PLACE_TAGS = ['front-of-mouth', 'back-of-mouth', 'guttural'] as const
export const PHONETIC_VOWEL_TAGS = ['long-vowel', 'short-vowel'] as const
export const PHONETIC_TAGS = [...PHONETIC_MANNER_TAGS, ...PHONETIC_PLACE_TAGS, ...PHONETIC_VOWEL_TAGS] as const
export type PhoneticTag = (typeof PHONETIC_TAGS)[number]

export type SyllablePosition = 'start' | 'middle' | 'end'

export interface PhoneticSyllable {
  text: string
  position: SyllablePosition
  tags: PhoneticTag[]
}

export interface PhoneticProfile {
  id: string
  name: string
  description: string
  // Missing tags default to a small flat weight (see TAG_DEFAULT_WEIGHT) so
  // no syllable is ever literally unreachable — a profile just makes some
  // sounds much more likely than others, not exclusive.
  tagWeights: Partial<Record<PhoneticTag, number>>
  syllableMin: number
  syllableMax: number
}

// ~18 syllables per position. Tags are a game-flavor approximation of real
// phonetics, not a linguistics-accurate IPA breakdown — good enough to make
// two profiles sound clearly distinct, which is the actual goal.
export const SYLLABLE_BANK: PhoneticSyllable[] = [
  // start
  { text: 'Fae', position: 'start', tags: ['fricative', 'front-of-mouth', 'long-vowel'] },
  { text: 'Sil', position: 'start', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'Shae', position: 'start', tags: ['fricative', 'sibilant', 'front-of-mouth', 'long-vowel'] },
  { text: 'Vel', position: 'start', tags: ['fricative', 'front-of-mouth', 'short-vowel'] },
  { text: 'Thal', position: 'start', tags: ['fricative', 'front-of-mouth', 'short-vowel'] },
  { text: 'El', position: 'start', tags: ['liquid', 'front-of-mouth', 'short-vowel'] },
  { text: 'Lu', position: 'start', tags: ['liquid', 'front-of-mouth', 'short-vowel'] },
  { text: 'Mi', position: 'start', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'Nae', position: 'start', tags: ['nasal', 'front-of-mouth', 'long-vowel'] },
  { text: 'Grak', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Kor', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Gor', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Bru', position: 'start', tags: ['plosive', 'front-of-mouth', 'short-vowel'] },
  { text: 'Dra', position: 'start', tags: ['plosive', 'front-of-mouth', 'short-vowel'] },
  { text: 'Khaz', position: 'start', tags: ['plosive', 'guttural', 'back-of-mouth', 'short-vowel'] },
  { text: 'Ug', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'Hra', position: 'start', tags: ['fricative', 'guttural', 'back-of-mouth', 'short-vowel'] },
  { text: 'Cha', position: 'start', tags: ['affricate', 'front-of-mouth', 'short-vowel'] },
  // Added for the draconic/fey/aquatic/insectoid profiles below (see
  // PHONETIC_PROFILES) — the original 2-profile bank had zero
  // guttural+long-vowel or affricate-at-middle/end syllables, which would
  // have made those profiles indistinguishable from harsh-guttural or
  // generically sibilant instead of genuinely their own sound. Verified via
  // a throwaway sample-output test before landing (see phoneticNames.test.ts
  // for the permanent distinctness tests that replaced it).
  { text: 'Khaa', position: 'start', tags: ['plosive', 'guttural', 'back-of-mouth', 'long-vowel'] }, // draconic
  { text: 'Vraa', position: 'start', tags: ['plosive', 'guttural', 'back-of-mouth', 'long-vowel'] }, // draconic
  { text: 'Lae', position: 'start', tags: ['liquid', 'front-of-mouth', 'long-vowel'] }, // fey
  { text: 'Nyo', position: 'start', tags: ['nasal', 'liquid', 'front-of-mouth', 'long-vowel'] }, // fey
  { text: 'Zhae', position: 'start', tags: ['sibilant', 'liquid', 'front-of-mouth', 'long-vowel'] }, // aquatic
  { text: 'Tzi', position: 'start', tags: ['affricate', 'sibilant', 'front-of-mouth', 'short-vowel'] }, // insectoid
  { text: 'Vael', position: 'start', tags: ['fricative', 'liquid', 'front-of-mouth', 'long-vowel'] }, // celestial
  // Added for the round-4 profile expansion (animalistic, fire, birdlike,
  // demonic — see PHONETIC_PROFILES below). Same reasoning as the batch
  // above: each of these 4 tag-weight emphases had zero (or near-zero)
  // matching syllables in the bank as it stood, which would have made the
  // new profile sound like a re-shuffle of an existing one instead of its
  // own texture. Sampled with the throwaway-test pattern before landing.
  { text: 'Ngar', position: 'start', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'Mrag', position: 'start', tags: ['nasal', 'liquid', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'Rhag', position: 'start', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'Nagh', position: 'start', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  // Tagged plosive-only, NOT affricate/sibilant/guttural — insectoid-alien
  // weights affricate(4) and sibilant(4) higher than fire does (3.5/3), so a
  // fire syllable tagged either would actually favor insectoid over fire.
  // Plosive is the one tag fire clearly out-weights insectoid on (3 vs 1),
  // so that's what fire's OWN dedicated syllables carry; fire's affricate/
  // sibilant weight still gets its hiss/crackle flavor by drawing from the
  // shared insectoid-tagged syllables above, same "reuse the existing bank
  // for secondary color" pattern draconic/harsh-guttural use for guttural.
  { text: 'Tzak', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'Krix', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'Zhak', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'Skrag', position: 'start', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'Chir', position: 'start', tags: ['sibilant', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'Twil', position: 'start', tags: ['liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'Sri', position: 'start', tags: ['sibilant', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'Fwit', position: 'start', tags: ['fricative', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  // Only Vraul carries 'liquid' (a deliberate single growl-flavored variant)
  // — liquid is birdlike's own top weight, so the rest of this batch avoids
  // it to keep from leaking into birdlike's pool (same fix as above).
  { text: 'Vraul', position: 'start', tags: ['fricative', 'liquid', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'Zhaul', position: 'start', tags: ['fricative', 'sibilant', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'Ghaul', position: 'start', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'Fraug', position: 'start', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  // middle
  { text: 'wen', position: 'middle', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'riel', position: 'middle', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'shi', position: 'middle', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'vash', position: 'middle', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'thil', position: 'middle', tags: ['fricative', 'front-of-mouth', 'short-vowel'] },
  { text: 'lora', position: 'middle', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'mira', position: 'middle', tags: ['nasal', 'front-of-mouth', 'long-vowel'] },
  { text: 'nel', position: 'middle', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'gor', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'dun', position: 'middle', tags: ['plosive', 'front-of-mouth', 'short-vowel'] },
  { text: 'krag', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'thok', position: 'middle', tags: ['fricative', 'plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'zul', position: 'middle', tags: ['fricative', 'sibilant', 'back-of-mouth', 'short-vowel'] },
  { text: 'grim', position: 'middle', tags: ['plosive', 'front-of-mouth', 'short-vowel'] },
  { text: 'khor', position: 'middle', tags: ['plosive', 'guttural', 'back-of-mouth', 'short-vowel'] },
  { text: 'vor', position: 'middle', tags: ['fricative', 'back-of-mouth', 'short-vowel'] },
  { text: 'essa', position: 'middle', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'aeli', position: 'middle', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'graa', position: 'middle', tags: ['plosive', 'guttural', 'back-of-mouth', 'long-vowel'] }, // draconic
  { text: 'lyoo', position: 'middle', tags: ['liquid', 'nasal', 'front-of-mouth', 'long-vowel'] }, // fey
  { text: 'shaal', position: 'middle', tags: ['sibilant', 'liquid', 'front-of-mouth', 'long-vowel'] }, // aquatic
  { text: 'tza', position: 'middle', tags: ['affricate', 'sibilant', 'front-of-mouth', 'short-vowel'] }, // insectoid
  { text: 'chik', position: 'middle', tags: ['affricate', 'sibilant', 'front-of-mouth', 'short-vowel'] }, // insectoid
  { text: 'ngar', position: 'middle', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'mrag', position: 'middle', tags: ['nasal', 'liquid', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'grum', position: 'middle', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'nagh', position: 'middle', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'tzak', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'krix', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'zhak', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'skrag', position: 'middle', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'chir', position: 'middle', tags: ['sibilant', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'twil', position: 'middle', tags: ['liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'sri', position: 'middle', tags: ['sibilant', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'fwit', position: 'middle', tags: ['fricative', 'liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'vraul', position: 'middle', tags: ['fricative', 'liquid', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'zhaul', position: 'middle', tags: ['fricative', 'sibilant', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'ghaul', position: 'middle', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'fraug', position: 'middle', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  // end
  { text: 'wyn', position: 'end', tags: ['nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'iel', position: 'end', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'ara', position: 'end', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'esh', position: 'end', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'ith', position: 'end', tags: ['fricative', 'front-of-mouth', 'short-vowel'] },
  { text: 'or', position: 'end', tags: ['liquid', 'back-of-mouth', 'short-vowel'] },
  { text: 'oth', position: 'end', tags: ['fricative', 'back-of-mouth', 'short-vowel'] },
  { text: 'ak', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'ug', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'ash', position: 'end', tags: ['fricative', 'sibilant', 'front-of-mouth', 'short-vowel'] },
  { text: 'aan', position: 'end', tags: ['nasal', 'front-of-mouth', 'long-vowel'] },
  { text: 'eth', position: 'end', tags: ['fricative', 'front-of-mouth', 'short-vowel'] },
  { text: 'orn', position: 'end', tags: ['nasal', 'back-of-mouth', 'short-vowel'] },
  { text: 'und', position: 'end', tags: ['nasal', 'plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'gnar', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'zog', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] },
  { text: 'vyn', position: 'end', tags: ['fricative', 'nasal', 'front-of-mouth', 'short-vowel'] },
  { text: 'aelle', position: 'end', tags: ['liquid', 'front-of-mouth', 'long-vowel'] },
  { text: 'graun', position: 'end', tags: ['plosive', 'guttural', 'back-of-mouth', 'long-vowel'] }, // draconic
  { text: 'loon', position: 'end', tags: ['liquid', 'nasal', 'front-of-mouth', 'long-vowel'] }, // fey
  { text: 'zhoo', position: 'end', tags: ['sibilant', 'liquid', 'front-of-mouth', 'long-vowel'] }, // aquatic
  { text: 'tik', position: 'end', tags: ['affricate', 'sibilant', 'front-of-mouth', 'short-vowel'] }, // insectoid
  { text: 'chiss', position: 'end', tags: ['affricate', 'sibilant', 'front-of-mouth', 'short-vowel'] }, // insectoid
  { text: 'nog', position: 'end', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'ragh', position: 'end', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'mnar', position: 'end', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'ang', position: 'end', tags: ['nasal', 'guttural', 'back-of-mouth', 'short-vowel'] }, // animalistic
  { text: 'grix', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'tzik', position: 'end', tags: ['plosive', 'short-vowel'] }, // fire
  { text: 'zhak', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'skrag', position: 'end', tags: ['plosive', 'back-of-mouth', 'short-vowel'] }, // fire
  { text: 'chit', position: 'end', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'wril', position: 'end', tags: ['liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'sik', position: 'end', tags: ['sibilant', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'lir', position: 'end', tags: ['liquid', 'front-of-mouth', 'short-vowel'] }, // birdlike
  { text: 'raugh', position: 'end', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'zhaun', position: 'end', tags: ['fricative', 'sibilant', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'ghraun', position: 'end', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] }, // demonic
  { text: 'fraun', position: 'end', tags: ['fricative', 'guttural', 'back-of-mouth', 'long-vowel'] } // demonic
]

// Originally a proof-of-concept pair (elvish-leaning vs. harsh-guttural)
// chosen to sound clearly different from each other — the user confirmed
// the mechanism works and asked for more. The 6 below (draconic through
// insectoid) were each built as a distinct tag-weight emphasis so they read
// as their own sound rather than a re-shuffle of the original 2 or of each
// other — see the syllable bank additions above (search "// draconic" etc.)
// added specifically to back these up, since several of these emphases
// (guttural+long-vowel, affricate at middle/end) had zero matching
// syllables in the original ~54-entry bank.
export const PHONETIC_PROFILES: PhoneticProfile[] = [
  {
    id: 'elvish-leaning',
    name: 'Elvish-leaning (soft, flowing)',
    description: 'Favors fricative/sibilant sounds (f, s, sh, th), front-of-mouth articulation, and long vowels.',
    tagWeights: {
      fricative: 4,
      sibilant: 4,
      'front-of-mouth': 3,
      'long-vowel': 3,
      liquid: 2,
      nasal: 1,
      affricate: 0.5,
      plosive: 0.3,
      'back-of-mouth': 0.3,
      guttural: 0.1,
      'short-vowel': 1
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'harsh-guttural',
    name: 'Harsh / Guttural (heavy, grinding)',
    description: 'Favors plosive/guttural sounds (k, g, kh), back-of-mouth articulation, and short vowels.',
    tagWeights: {
      plosive: 4,
      guttural: 4,
      'back-of-mouth': 3,
      'short-vowel': 3,
      nasal: 1,
      affricate: 0.5,
      liquid: 0.5,
      fricative: 0.5,
      sibilant: 0.3,
      'front-of-mouth': 0.3,
      'long-vowel': 0.2
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'draconic',
    name: 'Draconic (weighty, drawn-out)',
    description: 'Favors plosive/guttural sounds like harsh-guttural, but LONG vowels instead of short — weighty and drawn-out rather than clipped.',
    tagWeights: {
      plosive: 4,
      guttural: 4,
      'back-of-mouth': 3,
      'long-vowel': 3,
      nasal: 1,
      liquid: 0.5,
      fricative: 0.5,
      sibilant: 0.3,
      affricate: 0.5,
      'front-of-mouth': 0.3,
      'short-vowel': 0.3
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'fey-whimsical',
    name: 'Fey / Whimsical (light, airy, sing-song)',
    description: 'Favors nasal/liquid sounds, front-of-mouth articulation, and long vowels — light and airy rather than grounded.',
    tagWeights: {
      nasal: 4,
      liquid: 4,
      'front-of-mouth': 3,
      'long-vowel': 3,
      fricative: 1,
      sibilant: 1,
      affricate: 0.3,
      plosive: 0.3,
      guttural: 0.1,
      'back-of-mouth': 0.3,
      'short-vowel': 0.8
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'aquatic',
    name: 'Aquatic (flowing)',
    description: 'Favors sibilant/liquid sounds and long vowels — flowing, like water over stone.',
    tagWeights: {
      sibilant: 4,
      liquid: 4,
      'long-vowel': 3,
      fricative: 2,
      nasal: 1,
      'front-of-mouth': 1.5,
      affricate: 0.3,
      plosive: 0.3,
      guttural: 0.2,
      'back-of-mouth': 0.5,
      'short-vowel': 0.8
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'stony-giant-kin',
    name: 'Stony / Giant-kin (blunt, heavy)',
    description: 'Favors plosive/nasal sounds, back-of-mouth articulation, and short vowels — blunt and heavy. For a custom giant-flavored race (Goliath already has its own name-list bank).',
    tagWeights: {
      plosive: 4,
      nasal: 4,
      'back-of-mouth': 3,
      'short-vowel': 3,
      guttural: 1,
      liquid: 0.5,
      fricative: 0.5,
      sibilant: 0.3,
      affricate: 0.3,
      'front-of-mouth': 0.3,
      'long-vowel': 0.5
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'celestial-ethereal',
    name: 'Celestial / Ethereal (soft, open)',
    description: 'Favors fricative/liquid sounds, long vowels, and front-of-mouth articulation — softer and more open than elvish-leaning, without leaning on sibilants.',
    tagWeights: {
      fricative: 3,
      liquid: 4,
      'long-vowel': 4,
      'front-of-mouth': 3,
      nasal: 1.5,
      sibilant: 1,
      affricate: 0.3,
      plosive: 0.3,
      guttural: 0.1,
      'back-of-mouth': 0.3,
      'short-vowel': 0.8
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'insectoid-alien',
    name: 'Insectoid / Alien (clicking, buzzing)',
    description: 'Favors affricate/sibilant sounds and short vowels — clicking and buzzing rather than spoken.',
    tagWeights: {
      affricate: 4,
      sibilant: 4,
      'short-vowel': 3,
      fricative: 1.5,
      plosive: 1,
      nasal: 0.5,
      liquid: 0.3,
      'front-of-mouth': 1,
      'back-of-mouth': 1,
      guttural: 0.3,
      'long-vowel': 0.3
    },
    syllableMin: 2,
    syllableMax: 3
  },
  // Round-4 expansion (4 more, on top of the 2 proof-of-concept + 6 above).
  {
    id: 'animalistic',
    name: 'Animalistic / Feral (mammal)',
    description: 'Favors nasal/guttural sounds together and short vowels — growly and breathy rather than articulate. Mammal-flavored; see birdlike for an avian counterpart.',
    tagWeights: {
      nasal: 4,
      guttural: 4,
      'back-of-mouth': 2.5,
      'short-vowel': 3,
      liquid: 1.5,
      plosive: 1,
      fricative: 1,
      affricate: 0.5,
      sibilant: 0.3,
      'front-of-mouth': 0.5,
      'long-vowel': 0.3
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'fire',
    name: 'Fire / Ashen / Infernal (crackling, hissing, popping)',
    description: 'Favors sibilant/affricate sounds like insectoid-alien, but with plosive AND guttural weight on top — popping and crackling rather than purely clicking.',
    tagWeights: {
      affricate: 3.5,
      sibilant: 3,
      plosive: 3,
      guttural: 2,
      'short-vowel': 3,
      fricative: 1.5,
      'back-of-mouth': 1.5,
      nasal: 0.3,
      liquid: 0.3,
      'front-of-mouth': 0.5,
      'long-vowel': 0.3
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'birdlike',
    name: 'Birdlike / Avian (chirping, trilling)',
    description: 'Favors liquid/sibilant sounds, front-of-mouth articulation, and short vowels — quick chirps and trills rather than fey-whimsical\'s long airy sing-song.',
    tagWeights: {
      liquid: 3.5,
      sibilant: 2.5,
      'front-of-mouth': 3,
      'short-vowel': 3.5,
      nasal: 1,
      fricative: 1,
      affricate: 0.4,
      plosive: 0.4,
      guttural: 0.1,
      'back-of-mouth': 0.3,
      'long-vowel': 0.4
    },
    syllableMin: 2,
    syllableMax: 3
  },
  {
    id: 'demonic',
    name: 'Demonic / Devilish (infernal authority)',
    description: 'Favors fricative/guttural sounds and long vowels — a deep, resonant growl rather than draconic\'s plosive-heavy weight or fire\'s short crackling pop.',
    tagWeights: {
      guttural: 4,
      fricative: 3.5,
      'long-vowel': 3,
      'back-of-mouth': 2.5,
      liquid: 1.5,
      nasal: 1,
      sibilant: 1,
      plosive: 1,
      affricate: 0.5,
      'front-of-mouth': 0.5,
      'short-vowel': 0.5
    },
    syllableMin: 2,
    syllableMax: 3
  }
]

const TAG_DEFAULT_WEIGHT = 0.2
const BASE_SYLLABLE_WEIGHT = 0.2

function syllableScore(syllable: PhoneticSyllable, profile: PhoneticProfile): number {
  return BASE_SYLLABLE_WEIGHT + syllable.tags.reduce((sum, tag) => sum + (profile.tagWeights[tag] ?? TAG_DEFAULT_WEIGHT), 0)
}

function pickSyllable(position: SyllablePosition, profile: PhoneticProfile, rng: () => number): string {
  const pool = SYLLABLE_BANK.filter((s) => s.position === position)
  if (pool.length === 0) return ''
  const total = pool.reduce((sum, s) => sum + syllableScore(s, profile), 0)
  let roll = rng() * total
  for (const syllable of pool) {
    roll -= syllableScore(syllable, profile)
    if (roll <= 0) return syllable.text
  }
  return pool[pool.length - 1].text
}

// "Reality check" so raw syllable concatenation can't produce something
// unpronounceable — caught in practice on "Shae" + "essa" + "wyn" ->
// "Shaeessawyn" (a-e-e triple-vowel pileup at the seam, 11 characters).
// Deliberately simple heuristics, not real phonotactics: long consecutive
// runs of vowels or consonants, a tripled letter, or excess length are the
// actual failure modes seen in testing, not subtler pronounceability rules.
const MAX_WORD_LENGTH = 10
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

function isPronounceable(word: string): boolean {
  if (word.length === 0 || word.length > MAX_WORD_LENGTH) return false
  if (/(.)\1\1/i.test(word)) return false // any letter tripled in a row ("sss", "aaa")

  let vowelRun = 0
  let consonantRun = 0
  for (const ch of word.toLowerCase()) {
    if (VOWELS.has(ch)) {
      vowelRun++
      consonantRun = 0
      if (vowelRun >= 3) return false
    } else {
      consonantRun++
      vowelRun = 0
      if (consonantRun >= 4) return false
    }
  }
  return true
}

// Regenerating a few times and keeping the first pronounceable result reads
// better than filtering the syllable bank itself — the same syllable is
// fine in most combinations and only occasionally seams badly with its
// neighbor, so retrying the combination (not the syllable choice) is the
// right level to fix this at.
// Bumped from 8 to 20 when the syllable bank grew for the profile-expansion
// pass (phoneticNames.ts's PHONETIC_PROFILES) — more syllables per position
// means more possible seams, so a slightly unlucky rng draw could exhaust 8
// attempts more often than it used to (surfaced by the "Draaelle" case: Dra
// + aelle, both pre-existing syllables, seaming into a 3-vowel run). More
// attempts costs nothing but a few extra rng() calls in the rare case.
const MAX_SYNTHESIS_ATTEMPTS = 20

function synthesizeWord(profile: PhoneticProfile, rng: () => number): string {
  let fallback = ''
  for (let attempt = 0; attempt < MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    const count = Math.floor(rng() * (profile.syllableMax - profile.syllableMin + 1)) + profile.syllableMin
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const position: SyllablePosition = i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'
      parts.push(pickSyllable(position, profile, rng))
    }
    const word = parts.join('')
    if (attempt === 0) fallback = word
    if (isPronounceable(word)) return capitalize(word)
  }
  // Every attempt failed the reality check (rare, e.g. a profile paired with
  // a near-empty syllable bank) — better to return something than nothing.
  return capitalize(fallback)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Synthesizes a "First Last" name from a phonetic profile — two
 * independently-generated words, same as every other race in this app
 * producing a first+last pair. Not gendered in v1 (the profile describes a
 * SOUND, not a gender split) — flag if that turns out to matter once this
 * is in use.
 */
export function generateSyntheticName(profile: PhoneticProfile, rng: () => number = Math.random): string {
  return `${synthesizeWord(profile, rng)} ${synthesizeWord(profile, rng)}`
}
