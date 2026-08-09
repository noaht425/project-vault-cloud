import { describe, it, expect } from 'vitest'
import { generateAppearance } from '../src/lib/settlementAppearance'
import { BASELINE_RACES } from '../src/lib/settlementNames'
import type { CustomRaceDef } from '../src/lib/noteTypes/settlement'

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

describe('generateAppearance', () => {
  it('produces a non-empty multi-line description for every baseline race', () => {
    const rng = seededRng(1)
    for (const race of BASELINE_RACES) {
      const text = generateAppearance(race, 'Male', rng)
      expect(text.length).toBeGreaterThan(0)
      expect(text.split('\n').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('always ends with a height + build line in the "Stands F′ I″ tall and has a/an X build." shape', () => {
    const text = generateAppearance('human', 'Female', seededRng(2))
    const lastLine = text.split('\n').at(-1)
    expect(lastLine).toMatch(/^Stands \d+′ \d+″ tall and has an? \w+ build\.$/)
  })

  it('uses "an" before a vowel-starting build word (e.g. "average") and "a" otherwise', () => {
    const rng = seededRng(9)
    let sawAn = false
    let sawA = false
    for (let i = 0; i < 40; i++) {
      const lastLine = generateAppearance('human', 'Male', rng).split('\n').at(-1)!
      if (lastLine.includes(' an average build.')) sawAn = true
      if (/ a (skinny|slim|athletic|stocky|muscular|heavyset) build\./.test(lastLine)) sawA = true
    }
    expect(sawAn).toBe(true)
    expect(sawA).toBe(true)
  })

  it('describes dragonborn with scales instead of hair, and no separate skin line', () => {
    const text = generateAppearance('dragonborn', 'Male', seededRng(3))
    expect(text).toContain('scales')
    expect(text).not.toContain('hair')
    expect(text).not.toContain('skin')
  })

  it('describes every other baseline race with hair and a skin-tone line', () => {
    const rng = seededRng(4)
    for (const race of BASELINE_RACES.filter((r) => r !== 'dragonborn')) {
      const text = generateAppearance(race, 'Female', rng)
      expect(text).toContain('hair')
      expect(text).toContain('skin')
    }
  })

  it('gives orc residents a chance at tusks (race-specific special feature)', () => {
    const rng = seededRng(5)
    let sawTusks = false
    for (let i = 0; i < 30; i++) {
      if (generateAppearance('orc', 'Male', rng).includes('tusks')) sawTusks = true
    }
    expect(sawTusks).toBe(true)
  })

  it('only gives a facial-hair line to Male residents of a facial-hair-capable race, never elves', () => {
    const rng = seededRng(6)
    for (let i = 0; i < 20; i++) {
      expect(generateAppearance('elf', 'Male', rng)).not.toMatch(/beard|mustache|clean shaven|stubble|sideburns/)
    }
    let sawFacialHairLine = false
    for (let i = 0; i < 20; i++) {
      if (/beard|mustache|clean shaven|stubble|sideburns/.test(generateAppearance('dwarf', 'Male', rng))) sawFacialHairLine = true
    }
    expect(sawFacialHairLine).toBe(true)
  })

  it('falls back to the human profile for an unrecognized race id rather than crashing', () => {
    expect(() => generateAppearance('some-unknown-race', 'Male', seededRng(7))).not.toThrow()
  })

  it('is deterministic given the same rng', () => {
    const a = generateAppearance('goliath', 'Nonbinary', seededRng(8))
    const b = generateAppearance('goliath', 'Nonbinary', seededRng(8))
    expect(a).toBe(b)
  })
})

describe('generateAppearance with custom races', () => {
  function customRace(overrides: Partial<CustomRaceDef> = {}): CustomRaceDef {
    return {
      id: 'lizardfolk',
      name: 'Lizardfolk',
      inspirationSourceIds: [],
      phoneticProfileIds: [],
      heightRangeInches: [59, 75],
      specialFeatures: [],
      ...overrides
    }
  }

  it("uses the custom race's own height range instead of the human fallback range", () => {
    const race = customRace({ heightRangeInches: [100, 110] }) // deliberately outside the human range
    const rng = seededRng(1)
    for (let i = 0; i < 20; i++) {
      const text = generateAppearance('lizardfolk', 'Male', rng, [race])
      const heightMatch = text.match(/Stands (\d+)′ (\d+)″/)
      expect(heightMatch).not.toBeNull()
      const heightInches = Number(heightMatch![1]) * 12 + Number(heightMatch![2])
      expect(heightInches).toBeGreaterThanOrEqual(100)
      expect(heightInches).toBeLessThanOrEqual(110)
    }
  })

  it("eventually mentions one of the custom race's own special features", () => {
    const race = customRace({ specialFeatures: ['a ridge of small horns', 'faintly iridescent scales'] })
    const rng = seededRng(2)
    let sawFeature = false
    for (let i = 0; i < 30; i++) {
      const text = generateAppearance('lizardfolk', 'Female', rng, [race])
      if (text.includes('horns') || text.includes('scales')) sawFeature = true
    }
    expect(sawFeature).toBe(true)
  })

  it('never mentions a special feature when the custom race has none configured', () => {
    const race = customRace({ specialFeatures: [] })
    const rng = seededRng(3)
    for (let i = 0; i < 20; i++) {
      expect(generateAppearance('lizardfolk', 'Male', rng, [race])).not.toMatch(/^Has .*(horn|scale|tusk|tail)/m)
    }
  })

  it('falls back to the human profile when the race id matches no custom race either', () => {
    expect(() => generateAppearance('totally-unregistered', 'Male', seededRng(4), [customRace()])).not.toThrow()
  })
})
