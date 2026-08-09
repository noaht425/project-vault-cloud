import { describe, it, expect } from 'vitest'
import { generateSettlement, type GenerationOptions } from '../src/lib/settlementGenerator'
import {
  defaultBuildingTypes,
  defaultWealthTiers,
  resolveEducatedWealthTierIds,
  type BuildingTypeDef,
  type WealthTier
} from '../src/lib/noteTypes/settlement'

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

function sequenceIds(prefix: string): () => string {
  let i = 0
  return () => `${prefix}${i++}`
}

function baseOptions(overrides: Partial<GenerationOptions> = {}): GenerationOptions {
  return {
    population: 3000,
    districts: [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }],
    raceDistribution: [{ race: 'human', percent: 100 }],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'The Old Faith', percent: 100 }],
    buildingTypes: defaultBuildingTypes(),
    ...overrides
  }
}

describe('resolveEducatedWealthTierIds', () => {
  const tiers: WealthTier[] = [
    { id: 'a', name: 'Ultra-wealthy', percent: 2 },
    { id: 'b', name: 'Upper', percent: 16 },
    { id: 'c', name: 'Middle', percent: 47 },
    { id: 'd', name: 'Lower', percent: 25 },
    { id: 'e', name: 'Destitute', percent: 10 }
  ]

  it('defaults to the top half (rounded up) of tiers by list order when custom education is off', () => {
    const result = resolveEducatedWealthTierIds(tiers, false, [])
    expect(result).toEqual(new Set(['a', 'b', 'c']))
  })

  it('trusts an explicit (even empty) list outright when custom education is on', () => {
    expect(resolveEducatedWealthTierIds(tiers, true, ['d'])).toEqual(new Set(['d']))
    expect(resolveEducatedWealthTierIds(tiers, true, [])).toEqual(new Set())
  })
})

describe('settlement generation: gender distribution', () => {
  it('uses a custom genderDistribution instead of the old hardcoded default', () => {
    const result = generateSettlement(
      baseOptions({ genderDistribution: [{ id: 'x', gender: 'Xenogender', percent: 100 }] }),
      undefined,
      seededRng(1),
      sequenceIds('r')
    )
    expect(result.residents.length).toBeGreaterThan(0)
    expect(result.residents.every((r) => r.gender === 'Xenogender')).toBe(true)
  })

  it('falls back to the default distribution when omitted entirely (backward compatible)', () => {
    const result = generateSettlement(baseOptions(), undefined, seededRng(2), sequenceIds('r'))
    const genders = new Set(result.residents.map((r) => r.gender))
    expect(genders.has('Male')).toBe(true)
    expect(genders.has('Female')).toBe(true)
  })
})

describe('settlement generation: religious practice percent', () => {
  it('gives every resident a religion when religiousPracticePercent is 100 (default)', () => {
    const result = generateSettlement(baseOptions(), undefined, seededRng(3), sequenceIds('r'))
    expect(result.residents.length).toBeGreaterThan(0)
    expect(result.residents.every((r) => r.religion !== '')).toBe(true)
  })

  it('gives NO resident a religion when religiousPracticePercent is 0', () => {
    const result = generateSettlement(baseOptions({ religiousPracticePercent: 0 }), undefined, seededRng(4), sequenceIds('r'))
    expect(result.residents.length).toBeGreaterThan(0)
    expect(result.residents.every((r) => r.religion === '')).toBe(true)
  })

  it('gives roughly the configured fraction a religion, not exactly all or none, at a partial percent', () => {
    const result = generateSettlement(baseOptions({ religiousPracticePercent: 50 }), undefined, seededRng(5), sequenceIds('r'))
    const fraction = result.residents.filter((r) => r.religion !== '').length / result.residents.length
    expect(fraction).toBeGreaterThan(0.4)
    expect(fraction).toBeLessThan(0.6)
  })
})

describe('settlement generation: religious worker multiplier', () => {
  const religiousOnlyType: BuildingTypeDef = {
    id: 'temple',
    name: 'Temple',
    category: 'religious',
    defaultWealthTierId: 'middle',
    staffed: true,
    weight: 5,
    minSizeId: 'hamlet',
    primaryAbility: 'wis',
    secondaryAbility: 'cha',
    proficiencyPool: [],
    jobTitlePool: [],
    itemPool: []
  }
  const shopType: BuildingTypeDef = {
    id: 'shop',
    name: 'Shop',
    category: 'shop',
    defaultWealthTierId: 'middle',
    staffed: true,
    weight: 5,
    minSizeId: 'hamlet',
    primaryAbility: 'cha',
    secondaryAbility: 'int',
    proficiencyPool: [],
    jobTitlePool: [],
    itemPool: []
  }

  function countByType(result: ReturnType<typeof generateSettlement>, typeId: string): number {
    return result.buildings.filter((b) => b.buildingTypeId === typeId).length
  }

  it('produces zero religious buildings when the multiplier is 0 ("None")', () => {
    const options = baseOptions({ buildingTypes: [religiousOnlyType, shopType], religiousWorkerMultiplier: 0 })
    const result = generateSettlement(options, undefined, seededRng(6), sequenceIds('r'))
    expect(countByType(result, 'temple')).toBe(0)
    expect(countByType(result, 'shop')).toBeGreaterThan(0)
  })

  it('produces more religious buildings at a higher multiplier than at the default, all else equal', () => {
    const normalOptions = baseOptions({ buildingTypes: [religiousOnlyType, shopType] })
    const moreOptions = baseOptions({ buildingTypes: [religiousOnlyType, shopType], religiousWorkerMultiplier: 4 })

    const normalCount = countByType(generateSettlement(normalOptions, undefined, seededRng(7), sequenceIds('r')), 'temple')
    const moreCount = countByType(generateSettlement(moreOptions, undefined, seededRng(7), sequenceIds('r')), 'temple')

    expect(moreCount).toBeGreaterThan(normalCount)
  })

  it('leaves other (non-religious) building types unaffected by the multiplier', () => {
    const normalOptions = baseOptions({ buildingTypes: [religiousOnlyType, shopType] })
    const noneOptions = baseOptions({ buildingTypes: [religiousOnlyType, shopType], religiousWorkerMultiplier: 0 })

    const normalShopCount = countByType(generateSettlement(normalOptions, undefined, seededRng(8), sequenceIds('r')), 'shop')
    const noneShopCount = countByType(generateSettlement(noneOptions, undefined, seededRng(8), sequenceIds('r')), 'shop')

    // Not asserting exact equality (removing the religious budget entirely
    // shifts weighted allocation of the SAME total staffed budget toward
    // the remaining types) — just that shops didn't vanish the way temples did.
    expect(noneShopCount).toBeGreaterThan(0)
    expect(normalShopCount).toBeGreaterThan(0)
  })
})

describe('settlement generation: educated flag', () => {
  it('marks residents in the top wealth tiers educated and the rest not, by default (no custom education)', () => {
    const result = generateSettlement(baseOptions(), undefined, seededRng(9), sequenceIds('r'))
    const defaultTiers = defaultWealthTiers()
    const educatedTierIds = resolveEducatedWealthTierIds(defaultTiers, false, [])

    const withWealthTier = result.residents.filter((r) => r.wealthTierId)
    expect(withWealthTier.length).toBeGreaterThan(0)
    for (const resident of withWealthTier) {
      expect(resident.educated).toBe(educatedTierIds.has(resident.wealthTierId))
    }
  })

  it('respects an explicit custom education list, including marking everyone uneducated', () => {
    const result = generateSettlement(baseOptions({ customEducation: true, educatedWealthTierIds: [] }), undefined, seededRng(10), sequenceIds('r'))
    expect(result.residents.length).toBeGreaterThan(0)
    expect(result.residents.every((r) => r.educated === false)).toBe(true)
  })
})
