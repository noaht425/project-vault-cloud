import { describe, it, expect } from 'vitest'
import {
  BASELINE_NAME_BANKS,
  BASELINE_RACES,
  NAME_INSPIRATION_SOURCES,
  resolveNameBank,
  generateName,
  generateFlavorTag,
  generatePersonalityLine,
  generateGoal,
  type NameBank
} from '../src/lib/settlementNames'

function sequenceRng(values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

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

describe('BASELINE_NAME_BANKS', () => {
  it('has a non-empty male/female/neutral/last pool for every baseline race', () => {
    for (const race of BASELINE_RACES) {
      const bank = BASELINE_NAME_BANKS.find((b) => b.id === race)
      expect(bank, `missing bank for ${race}`).toBeDefined()
      expect(bank!.firstNamesMale.length).toBeGreaterThan(0)
      expect(bank!.firstNamesFemale.length).toBeGreaterThan(0)
      expect(bank!.firstNamesNeutral.length).toBeGreaterThan(0)
      expect(bank!.lastNames.length).toBeGreaterThan(0)
    }
  })

  it('keeps every Human name at equal weight (no region should dominate the pool)', () => {
    const human = BASELINE_NAME_BANKS.find((b) => b.id === 'human')!
    const allWeights = [
      ...human.firstNamesMale,
      ...human.firstNamesFemale,
      ...human.firstNamesNeutral,
      ...human.lastNames
    ].map((w) => w.weight)
    expect(allWeights.every((w) => w === 1)).toBe(true)
  })

  it('gives the Human bank a large, world-spanning pool (well beyond a single region)', () => {
    const human = BASELINE_NAME_BANKS.find((b) => b.id === 'human')!
    expect(human.firstNamesMale.length).toBeGreaterThanOrEqual(30)
    expect(human.firstNamesFemale.length).toBeGreaterThanOrEqual(30)
    expect(human.lastNames.length).toBeGreaterThanOrEqual(30)
  })
})

describe('NAME_INSPIRATION_SOURCES', () => {
  const EXPECTED_SOURCE_IDS = [
    'nordic',
    'romantic',
    'british-isles',
    'eastern-european',
    'east-asian',
    'south-asian',
    'west-asian',
    'north-african-middle-eastern',
    'central-african',
    'south-african',
    // hawaiian/maori landed in a later Electron-repo session
    // (docs/plans/2026-08-08-native-pacific-names-research.md) — their pools
    // are still being filled in, hence the lowered bound below rather than
    // this port inventing more names to hit the usual threshold.
    'hawaiian',
    'maori'
  ]
  // Still-partial pools as of the port (see the comment above) — everything
  // else must clear the usual "substantial" bar.
  const PARTIAL_SOURCE_IDS = new Set(['hawaiian', 'maori']);

  it('has exactly the confirmed real-world regional sources (no Native American entry — see file comment)', () => {
    expect(NAME_INSPIRATION_SOURCES.map((s) => s.id).sort()).toEqual([...EXPECTED_SOURCE_IDS].sort())
  })

  it('has a substantial, non-uniformly-weighted pool for every complete source', () => {
    for (const source of NAME_INSPIRATION_SOURCES) {
      if (PARTIAL_SOURCE_IDS.has(source.id)) continue
      expect(source.firstNamesMale.length, `${source.id} male`).toBeGreaterThanOrEqual(15)
      expect(source.firstNamesFemale.length, `${source.id} female`).toBeGreaterThanOrEqual(15)
      expect(source.firstNamesNeutral.length, `${source.id} neutral`).toBeGreaterThanOrEqual(5)
      expect(source.lastNames.length, `${source.id} last`).toBeGreaterThanOrEqual(15)
      // Unlike Human, each of these is a single tradition — weighting is
      // expected to vary (common/normal/rare), not be uniform.
      const weights = [...source.firstNamesMale, ...source.firstNamesFemale].map((w) => w.weight)
      expect(new Set(weights).size).toBeGreaterThan(1)
    }
  })
})

describe('resolveNameBank', () => {
  it('resolves a baseline race id to its own bank', () => {
    const bank = resolveNameBank('elf')
    expect(bank.id).toBe('elf')
  })

  it("pools a custom race's selected inspiration sources across all gender pools", () => {
    const sources: NameBank[] = [
      {
        id: 'germanic',
        name: 'Germanic',
        firstNamesMale: [{ name: 'Heinrich', weight: 1 }],
        firstNamesFemale: [{ name: 'Greta', weight: 1 }],
        firstNamesNeutral: [],
        lastNames: [{ name: 'Weber', weight: 1 }]
      },
      {
        id: 'french',
        name: 'French',
        firstNamesMale: [{ name: 'Étienne', weight: 1 }],
        firstNamesFemale: [{ name: 'Camille', weight: 1 }],
        firstNamesNeutral: [],
        lastNames: [{ name: 'Dubois', weight: 1 }]
      }
    ]
    const customRaces = [
      {
        id: 'gnome',
        name: 'Gnome',
        inspirationSourceIds: ['germanic', 'french'],
        phoneticProfileIds: [],
        heightRangeInches: [35, 47] as [number, number],
        specialFeatures: []
      }
    ]
    const bank = resolveNameBank('gnome', customRaces, sources)
    expect(bank.firstNamesMale.map((w) => w.name)).toEqual(['Heinrich', 'Étienne'])
    expect(bank.firstNamesFemale.map((w) => w.name)).toEqual(['Greta', 'Camille'])
    expect(bank.lastNames.map((w) => w.name)).toEqual(['Weber', 'Dubois'])
  })

  it('pools real inspiration sources (Nordic + Central African) for a custom race', () => {
    const customRaces = [
      {
        id: 'wanderer-folk',
        name: 'Wanderer-folk',
        inspirationSourceIds: ['nordic', 'central-african'],
        phoneticProfileIds: [],
        heightRangeInches: [59, 75] as [number, number],
        specialFeatures: []
      }
    ]
    const bank = resolveNameBank('wanderer-folk', customRaces, NAME_INSPIRATION_SOURCES)
    const nordic = NAME_INSPIRATION_SOURCES.find((s) => s.id === 'nordic')!
    const centralAfrican = NAME_INSPIRATION_SOURCES.find((s) => s.id === 'central-african')!
    expect(bank.firstNamesMale.length).toBe(nordic.firstNamesMale.length + centralAfrican.firstNamesMale.length)
    expect(bank.firstNamesMale.map((w) => w.name)).toContain('Erik')
    expect(bank.firstNamesMale.map((w) => w.name)).toContain('Emmanuel')
  })

  it('falls back to a generic bank for an unconfigured custom race', () => {
    const customRaces = [
      { id: 'gnome', name: 'Gnome', inspirationSourceIds: [], phoneticProfileIds: [], heightRangeInches: [35, 47] as [number, number], specialFeatures: [] }
    ]
    const bank = resolveNameBank('gnome', customRaces, [])
    expect(bank.id).toBe('generic')
  })

  it('falls back to a generic bank for a completely unknown race id', () => {
    const bank = resolveNameBank('nonexistent-race')
    expect(bank.id).toBe('generic')
  })
})

describe('generateName', () => {
  const bank: NameBank = {
    id: 'x',
    name: 'X',
    firstNamesMale: [{ name: 'Alan', weight: 1 }],
    firstNamesFemale: [{ name: 'Fiona', weight: 1 }],
    firstNamesNeutral: [{ name: 'Sam', weight: 1 }],
    lastNames: [{ name: 'Reed', weight: 1 }]
  }

  it("draws from the matching gender pool plus the neutral pool for 'Male'", () => {
    // generateName makes exactly 2 pickWeighted calls (first name, then last
    // name). Pool for Male is [Alan, Sam] (firstNamesMale + firstNamesNeutral)
    // — a roll of 0 always lands on the first entry.
    const rng = sequenceRng([0, 0])
    expect(generateName(bank, 'Male', rng)).toBe('Alan Reed')
  })

  it("draws from the matching gender pool plus the neutral pool for 'Female'", () => {
    const rng = sequenceRng([0.99, 0])
    expect(generateName(bank, 'Female', rng)).toBe('Sam Reed')
  })

  it('draws from all three pools combined for Nonbinary (or any other gender string)', () => {
    // Pool order for a combined draw is [male, female, neutral] = [Alan, Fiona, Sam].
    const rng = sequenceRng([0.5, 0])
    expect(generateName(bank, 'Nonbinary', rng)).toBe('Fiona Reed')
  })

  it('omits the surname when the bank has no last names', () => {
    const soloBank: NameBank = { ...bank, lastNames: [] }
    expect(generateName(soloBank, 'Male', () => 0)).toBe('Alan')
  })

  it('picks a higher-weight name noticeably more often over many draws', () => {
    const weighted: NameBank = {
      id: 'w',
      name: 'W',
      firstNamesMale: [
        { name: 'Common', weight: 9 },
        { name: 'Rare', weight: 1 }
      ],
      firstNamesFemale: [],
      firstNamesNeutral: [],
      lastNames: []
    }
    const rng = seededRng(123)
    let commonCount = 0
    for (let i = 0; i < 1000; i++) {
      if (generateName(weighted, 'Male', rng) === 'Common') commonCount++
    }
    // Expected ~900/1000 — allow generous slack for PRNG variance.
    expect(commonCount).toBeGreaterThan(750)
  })
})

describe('generation content pools', () => {
  it('generateFlavorTag/generatePersonalityLine/generateGoal all return non-empty strings', () => {
    expect(generateFlavorTag(() => 0).length).toBeGreaterThan(0)
    expect(generatePersonalityLine(() => 0).length).toBeGreaterThan(0)
    expect(generateGoal(() => 0).length).toBeGreaterThan(0)
  })
})
