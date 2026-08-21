import { describe, it, expect } from 'vitest'
import { generatePlaceName, PLACE_NAME_STYLES, PLACE_NAME_SYLLABLE_BANK } from '../src/lib/placeNames'

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

describe('PLACE_NAME_SYLLABLE_BANK', () => {
  it('has syllables in every position with at least one tag each', () => {
    for (const position of ['start', 'middle', 'end'] as const) {
      const pool = PLACE_NAME_SYLLABLE_BANK.filter((s) => s.position === position)
      expect(pool.length, `${position} pool`).toBeGreaterThan(0)
      expect(pool.every((s) => s.tags.length > 0)).toBe(true)
    }
  })
})

describe('PLACE_NAME_STYLES', () => {
  it('ships the 4 starting styles', () => {
    expect(PLACE_NAME_STYLES.map((s) => s.id).sort()).toEqual(['east-asian', 'germanic-norse', 'romance-latin', 'slavic-eastern-european'].sort())
  })
})

describe('generatePlaceName', () => {
  it('produces a capitalized single word', () => {
    const name = generatePlaceName(PLACE_NAME_STYLES[0], seededRng(1))
    expect(name).not.toContain(' ')
    expect(name[0]).toBe(name[0].toUpperCase())
  })

  it('is deterministic given the same rng', () => {
    const a = generatePlaceName(PLACE_NAME_STYLES[0], seededRng(99))
    const b = generatePlaceName(PLACE_NAME_STYLES[0], seededRng(99))
    expect(a).toBe(b)
  })

  it('never produces a word with 3+ consecutive vowels, 4+ consecutive consonants, a tripled letter, or over 10 characters', () => {
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
    for (const style of PLACE_NAME_STYLES) {
      for (let i = 0; i < 300; i++) {
        const name = generatePlaceName(style, rng)
        expect(isPronounceable(name), `${style.id}: "${name}"`).toBe(true)
      }
    }
  })

  it('germanic-norse favors its own signature endings (-burg/-heim/-stad/-holm/-vik) far more than romance-latin', () => {
    const germanicMarkers = /burg|heim|stad|holm|vik$/i
    const countMatches = (style: (typeof PLACE_NAME_STYLES)[number], pattern: RegExp): number => {
      const rng = seededRng(42)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generatePlaceName(style, rng))) count++
      }
      return count
    }
    const germanic = PLACE_NAME_STYLES.find((s) => s.id === 'germanic-norse')!
    const romance = PLACE_NAME_STYLES.find((s) => s.id === 'romance-latin')!
    expect(countMatches(germanic, germanicMarkers)).toBeGreaterThan(countMatches(romance, germanicMarkers))
  })

  it('slavic-eastern-european favors its own signature endings (-grad/-sk/-ov/-itz) far more than east-asian', () => {
    const slavicMarkers = /grad|sk$|ov$|itz/i
    const countMatches = (style: (typeof PLACE_NAME_STYLES)[number], pattern: RegExp): number => {
      const rng = seededRng(11)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generatePlaceName(style, rng))) count++
      }
      return count
    }
    const slavic = PLACE_NAME_STYLES.find((s) => s.id === 'slavic-eastern-european')!
    const eastAsian = PLACE_NAME_STYLES.find((s) => s.id === 'east-asian')!
    expect(countMatches(slavic, slavicMarkers)).toBeGreaterThan(countMatches(eastAsian, slavicMarkers))
  })

  it('east-asian favors its own signature endings (-shan/-jing/-zhou/-shima) far more than germanic-norse', () => {
    const eastAsianMarkers = /shan|jing|zhou|shima/i
    const countMatches = (style: (typeof PLACE_NAME_STYLES)[number], pattern: RegExp): number => {
      const rng = seededRng(13)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generatePlaceName(style, rng))) count++
      }
      return count
    }
    const eastAsian = PLACE_NAME_STYLES.find((s) => s.id === 'east-asian')!
    const germanic = PLACE_NAME_STYLES.find((s) => s.id === 'germanic-norse')!
    expect(countMatches(eastAsian, eastAsianMarkers)).toBeGreaterThan(countMatches(germanic, eastAsianMarkers))
  })

  it('romance-latin favors its own signature endings (-ia/-ona/-ille/-eira/-etta) far more than slavic-eastern-european', () => {
    const romanceMarkers = /ia$|ona$|ille$|eira$|etta$/i
    const countMatches = (style: (typeof PLACE_NAME_STYLES)[number], pattern: RegExp): number => {
      const rng = seededRng(24)
      let count = 0
      for (let i = 0; i < 300; i++) {
        if (pattern.test(generatePlaceName(style, rng))) count++
      }
      return count
    }
    const romance = PLACE_NAME_STYLES.find((s) => s.id === 'romance-latin')!
    const slavic = PLACE_NAME_STYLES.find((s) => s.id === 'slavic-eastern-european')!
    expect(countMatches(romance, romanceMarkers)).toBeGreaterThan(countMatches(slavic, romanceMarkers))
  })

  it('falls back to picking uniformly among every style when none is given, staying deterministic for a fixed rng', () => {
    const a = generatePlaceName(null, seededRng(55))
    const b = generatePlaceName(null, seededRng(55))
    expect(a).toBe(b)
  })
})
