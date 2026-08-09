import { describe, it, expect } from 'vitest'
import { generateSyntheticName, PHONETIC_PROFILES, SYLLABLE_BANK, type PhoneticProfile } from '../src/lib/phoneticNames'

function seededRng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('SYLLABLE_BANK', () => {
  it('has syllables in every position with at least one tag each', () => {
    for (const position of ['start', 'middle', 'end'] as const) {
      const pool = SYLLABLE_BANK.filter((s) => s.position === position)
      expect(pool.length, `${position} pool`).toBeGreaterThan(0)
      expect(pool.every((s) => s.tags.length > 0)).toBe(true)
    }
  })
})

describe('PHONETIC_PROFILES', () => {
  it('ships the 2 proof-of-concept profiles plus the 6 expansion profiles plus the 4 round-4 profiles (12 total)', () => {
    expect(PHONETIC_PROFILES.map((p) => p.id).sort()).toEqual([
      'animalistic',
      'aquatic',
      'celestial-ethereal',
      'demonic',
      'draconic',
      'elvish-leaning',
      'fey-whimsical',
      'fire',
      'birdlike',
      'harsh-guttural',
      'insectoid-alien',
      'stony-giant-kin'
    ].sort())
  })
})

describe('generateSyntheticName', () => {
  it('produces a capitalized "First Last" pair', () => {
    const name = generateSyntheticName(PHONETIC_PROFILES[0], seededRng(1))
    const parts = name.split(' ')
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part[0]).toBe(part[0].toUpperCase())
    }
  })

  it('is deterministic given the same rng', () => {
    const a = generateSyntheticName(PHONETIC_PROFILES[0], seededRng(99))
    const b = generateSyntheticName(PHONETIC_PROFILES[0], seededRng(99))
    expect(a).toBe(b)
  })

  it('produces names within the profile\'s syllable count range', () => {
    const shortProfile: PhoneticProfile = { ...PHONETIC_PROFILES[0], syllableMin: 2, syllableMax: 2 }
    // 2 fixed syllables (start + end, no middle) — every generated word
    // should be short since it's built from exactly 2 syllable chunks.
    const rng = seededRng(5)
    for (let i = 0; i < 20; i++) {
      const name = generateSyntheticName(shortProfile, rng)
      for (const word of name.split(' ')) {
        expect(word.length).toBeGreaterThan(0)
        expect(word.length).toBeLessThanOrEqual(10)
      }
    }
  })

  it('never produces a word with 3+ consecutive vowels, 4+ consecutive consonants, a tripled letter, or over 10 characters', () => {
    // Regression coverage for the reported bad case: "Shae" + "essa" + "wyn"
    // -> "Shaeessawyn" (a-e-e triple-vowel seam, 11 characters).
    const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])
    const isPronounceable = (word: string): boolean => {
      if (word.length > 10) return false
      if (/(.)\1\1/i.test(word)) return false
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

    const rng = seededRng(7)
    for (const profile of PHONETIC_PROFILES) {
      for (let i = 0; i < 300; i++) {
        const name = generateSyntheticName(profile, rng)
        for (const word of name.split(' ')) {
          expect(isPronounceable(word), `${profile.id}: "${word}" (from "${name}")`).toBe(true)
        }
      }
    }
  })

  it('the two proof-of-concept profiles produce audibly different sound palettes over many draws', () => {
    // Elvish-leaning heavily favors fricative/sibilant sounds (f, s, sh, th, v, z);
    // harsh-guttural favors plosive/guttural sounds (k, g, kh, b, d, p, t).
    const fricativeChars = /[fsvz]|th|sh/i
    const plosiveChars = /[kgbdpt]/i

    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(42)
      let count = 0
      for (let i = 0; i < 200; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }

    const elvish = PHONETIC_PROFILES.find((p) => p.id === 'elvish-leaning')!
    const harsh = PHONETIC_PROFILES.find((p) => p.id === 'harsh-guttural')!

    const elvishFricative = countMatches(elvish, fricativeChars)
    const harshFricative = countMatches(harsh, fricativeChars)
    const elvishPlosive = countMatches(elvish, plosiveChars)
    const harshPlosive = countMatches(harsh, plosiveChars)

    expect(elvishFricative).toBeGreaterThan(harshFricative)
    expect(harshPlosive).toBeGreaterThan(elvishPlosive)
  })

  it('draconic sounds distinct from harsh-guttural despite both leaning plosive/guttural — long vowels vs short', () => {
    // Both favor plosive/guttural consonants (so a generic plosive/guttural
    // character check wouldn't discriminate them), but draconic was built
    // specifically to differ from harsh-guttural on vowel LENGTH (weighty/
    // drawn-out vs clipped) — see phoneticNames.ts's syllable-bank comment
    // for the guttural+long-vowel syllables (Khaa/Vraa/graa/graun) added
    // specifically to back this profile up, since the original bank had
    // none. "aa"/"au" is the open-long-vowel spelling those (and a couple of
    // other long-vowel syllables in the bank) use; harsh-guttural's
    // short-vowel syllables (Khaz, Hra, khor, ak, ug, gnar, zog, ...) never
    // spell a vowel doubled/diphthonged this way.
    const longVowelMarkers = /aa|au/i

    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(11)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }

    const draconic = PHONETIC_PROFILES.find((p) => p.id === 'draconic')!
    const harsh = PHONETIC_PROFILES.find((p) => p.id === 'harsh-guttural')!

    expect(countMatches(draconic, longVowelMarkers)).toBeGreaterThan(countMatches(harsh, longVowelMarkers))
  })

  it('fey-whimsical favors nasal/liquid/long sounds far more than harsh-guttural', () => {
    const feyMarkers = /nyo|lae|loon|lyoo/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(12)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const fey = PHONETIC_PROFILES.find((p) => p.id === 'fey-whimsical')!
    const harsh = PHONETIC_PROFILES.find((p) => p.id === 'harsh-guttural')!
    expect(countMatches(fey, feyMarkers)).toBeGreaterThan(countMatches(harsh, feyMarkers))
  })

  it('aquatic favors sibilant+liquid+long sounds far more than stony-giant-kin', () => {
    const aquaticMarkers = /zhae|zhoo|shaal/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(13)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const aquatic = PHONETIC_PROFILES.find((p) => p.id === 'aquatic')!
    const stony = PHONETIC_PROFILES.find((p) => p.id === 'stony-giant-kin')!
    expect(countMatches(aquatic, aquaticMarkers)).toBeGreaterThan(countMatches(stony, aquaticMarkers))
  })

  it('stony-giant-kin favors plosive/nasal/short sounds far more than elvish-leaning or celestial-ethereal', () => {
    const plosiveChars = /[kgbdpt]/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(14)
      let count = 0
      for (let i = 0; i < 200; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const stony = PHONETIC_PROFILES.find((p) => p.id === 'stony-giant-kin')!
    const elvish = PHONETIC_PROFILES.find((p) => p.id === 'elvish-leaning')!
    const celestial = PHONETIC_PROFILES.find((p) => p.id === 'celestial-ethereal')!
    expect(countMatches(stony, plosiveChars)).toBeGreaterThan(countMatches(elvish, plosiveChars))
    expect(countMatches(stony, plosiveChars)).toBeGreaterThan(countMatches(celestial, plosiveChars))
  })

  it('celestial-ethereal favors fricative/liquid/long sounds far more than harsh-guttural', () => {
    const fricativeChars = /[fsvz]|th|sh/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(15)
      let count = 0
      for (let i = 0; i < 200; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const celestial = PHONETIC_PROFILES.find((p) => p.id === 'celestial-ethereal')!
    const harsh = PHONETIC_PROFILES.find((p) => p.id === 'harsh-guttural')!
    expect(countMatches(celestial, fricativeChars)).toBeGreaterThan(countMatches(harsh, fricativeChars))
  })

  it('insectoid-alien favors affricate/sibilant/short "clicking" sounds far more than elvish-leaning or fey-whimsical', () => {
    const insectoidMarkers = /tzi|tza|chik|tik|chiss/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(16)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const insectoid = PHONETIC_PROFILES.find((p) => p.id === 'insectoid-alien')!
    const elvish = PHONETIC_PROFILES.find((p) => p.id === 'elvish-leaning')!
    const fey = PHONETIC_PROFILES.find((p) => p.id === 'fey-whimsical')!
    expect(countMatches(insectoid, insectoidMarkers)).toBeGreaterThan(countMatches(elvish, insectoidMarkers))
    expect(countMatches(insectoid, insectoidMarkers)).toBeGreaterThan(countMatches(fey, insectoidMarkers))
  })

  it('animalistic favors nasal+guttural sounds together far more than harsh-guttural, which is plosive-heavy not nasal-heavy', () => {
    // A generic char-class marker (e.g. /[mn]/ or /ng|mn/) saturates at this
    // bank size — plosive/nasal letters show up incidentally across many
    // unrelated syllables' spellings, and syllable-seam concatenation can
    // coincidentally produce "ng"/"mn" regardless of profile. Matching
    // animalistic's own dedicated syllable spellings directly (same
    // approach the insectoid-alien test above uses) is the reliable marker.
    const nasalGutturalMarker = /ngar|nagh|mrag|rhag|mnar/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(21)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const animalistic = PHONETIC_PROFILES.find((p) => p.id === 'animalistic')!
    const harsh = PHONETIC_PROFILES.find((p) => p.id === 'harsh-guttural')!
    expect(countMatches(animalistic, nasalGutturalMarker)).toBeGreaterThan(countMatches(harsh, nasalGutturalMarker))
  })

  it('fire favors plosive sounds far more than insectoid-alien, despite both leaning affricate/sibilant', () => {
    // A generic plosive char class (/[kgbdpt]/) saturates near 100% for
    // BOTH profiles at this bank size — plosive letters show up incidentally
    // in plenty of non-plosive-tagged syllable spellings too (e.g.
    // insectoid's own "tik"/"chik" spellings contain a 'k'). Matching fire's
    // own dedicated syllable spellings directly (same approach the
    // insectoid-alien test above uses for itself) is the reliable marker.
    const fireMarkers = /tzak|krix|zhak|skrag|grix|tzik/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(22)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const fire = PHONETIC_PROFILES.find((p) => p.id === 'fire')!
    const insectoid = PHONETIC_PROFILES.find((p) => p.id === 'insectoid-alien')!
    expect(countMatches(fire, fireMarkers)).toBeGreaterThan(countMatches(insectoid, fireMarkers))
  })

  it('birdlike favors short vowels far more than fey-whimsical, despite both leaning liquid — quick chirps vs long airy sing-song', () => {
    // Both profiles lean heavily on liquid sounds (so a generic liquid check
    // wouldn't discriminate them) — birdlike was built specifically to
    // differ from fey-whimsical on vowel LENGTH, same "aa/au" long-vowel
    // marker the draconic-vs-harsh-guttural test above uses. fey-whimsical
    // should show this marker far more; birdlike should show it far less.
    const longVowelMarkers = /aa|au/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(23)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const birdlike = PHONETIC_PROFILES.find((p) => p.id === 'birdlike')!
    const fey = PHONETIC_PROFILES.find((p) => p.id === 'fey-whimsical')!
    expect(countMatches(fey, longVowelMarkers)).toBeGreaterThan(countMatches(birdlike, longVowelMarkers))
  })

  it('demonic favors fricative sounds far more than draconic, which is plosive-dominant not fricative-dominant, despite both leaning guttural/long-vowel', () => {
    // Both profiles lean on guttural + long vowels (so a generic guttural/
    // long-vowel check wouldn't discriminate them) — demonic was built to
    // swap draconic's plosive dominance for fricative dominance, for a
    // raspy/growling resonance instead of draconic's weighty/clipped one.
    const fricativeChars = /[fsvz]|th|sh/i
    const plosiveChars = /[kgbdpt]/i
    const countMatches = (profile: PhoneticProfile, pattern: RegExp): number => {
      const rng = seededRng(24)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generateSyntheticName(profile, rng))) count++
      }
      return count
    }
    const demonic = PHONETIC_PROFILES.find((p) => p.id === 'demonic')!
    const draconic = PHONETIC_PROFILES.find((p) => p.id === 'draconic')!
    expect(countMatches(demonic, fricativeChars)).toBeGreaterThan(countMatches(draconic, fricativeChars))
    expect(countMatches(draconic, plosiveChars)).toBeGreaterThan(countMatches(demonic, plosiveChars))
  })
})
