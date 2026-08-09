import { describe, it, expect } from 'vitest'
import {
  settlementFrontmatterSchema,
  defaultSettlementFrontmatter,
  defaultWealthTiers,
  defaultBuildingTypes,
  defaultDistrictsForSize,
  BUILDING_CATEGORIES,
  SETTLEMENT_SIZE_IDS,
  customRaceDefSchema
} from '../src/lib/noteTypes/settlement'

describe('defaultSettlementFrontmatter', () => {
  it('produces a settlement note with sane seeded defaults', () => {
    const fm = defaultSettlementFrontmatter()
    expect(fm.type).toBe('settlement')
    expect(fm.districts.length).toBeGreaterThan(0)
    expect(fm.buildings).toEqual([])
    expect(fm.residents).toEqual([])
  })

  it('seeds a district set for every settlement size, growing with size (more market districts for bigger towns)', () => {
    for (const sizeId of SETTLEMENT_SIZE_IDS) {
      const districts = defaultDistrictsForSize(sizeId)
      expect(districts.length).toBeGreaterThan(0)
      // Every district id is unique within its own set.
      expect(new Set(districts.map((d) => d.id)).size).toBe(districts.length)
    }
    expect(defaultDistrictsForSize('hamlet').length).toBeLessThan(defaultDistrictsForSize('metropolis').length)
  })

  it('falls back to the village set for an unrecognized size id', () => {
    expect(defaultDistrictsForSize('not-a-real-size')).toEqual(defaultDistrictsForSize('village'))
  })

  it('seeds Temple/Entertainment/University/Docks/Wealthy districts at city+ (Temple also at town), each boosting a real building type', () => {
    const buildingTypeIds = new Set(defaultBuildingTypes().map((t) => t.id))
    for (const sizeId of ['city', 'metropolis']) {
      const districts = defaultDistrictsForSize(sizeId)
      const byName = new Map(districts.map((d) => [d.name, d]))
      for (const name of ['Temple District', 'Entertainment District', 'University District', 'Docks District', 'Wealthy District']) {
        const district = byName.get(name)
        expect(district, `${name} missing at ${sizeId}`).toBeDefined()
        expect(district!.buildingTypeBoosts.length).toBeGreaterThan(0)
        for (const boost of district!.buildingTypeBoosts) {
          expect(buildingTypeIds.has(boost.buildingTypeId), `${name}'s boost references unknown type ${boost.buildingTypeId}`).toBe(true)
        }
      }
    }
    expect(defaultDistrictsForSize('town').some((d) => d.name === 'Temple District')).toBe(true)
  })

  it('boosts Manor specifically in Wealthy District (harder than in plain Residential District)', () => {
    const districts = defaultDistrictsForSize('city')
    const wealthy = districts.find((d) => d.name === 'Wealthy District')!
    const residential = districts.find((d) => d.name === 'Residential District')!
    const manorBoostIn = (d: typeof wealthy): number => d.buildingTypeBoosts.find((b) => b.buildingTypeId === 'manor')?.multiplier ?? 1
    expect(manorBoostIn(wealthy)).toBeGreaterThan(manorBoostIn(residential))
  })

  it('gives every Residential District/Quarter an actual boost toward residence building types (regression: used to be unboosted)', () => {
    for (const sizeId of SETTLEMENT_SIZE_IDS) {
      const districts = defaultDistrictsForSize(sizeId)
      const residential = districts.find((d) => d.name.startsWith('Residential'))
      if (!residential) continue
      for (const id of ['house', 'tenement', 'manor', 'farmstead']) {
        const boost = residential.buildingTypeBoosts.find((b) => b.buildingTypeId === id)
        expect(boost, `Residential district at ${sizeId} has no boost for ${id}`).toBeDefined()
        expect(boost!.multiplier).toBeGreaterThan(1)
      }
    }
  })

  it('seeds the new civic building types (theater, school, university, library) referenced by the new districts', () => {
    const types = defaultBuildingTypes()
    for (const id of ['theater', 'school', 'university', 'library']) {
      const type = types.find((t) => t.id === id)
      expect(type, `${id} missing from defaultBuildingTypes()`).toBeDefined()
      expect(type!.staffed).toBe(true)
    }
  })

  it('seeds wealth tiers that sum to 100 percent', () => {
    const tiers = defaultWealthTiers()
    expect(tiers.reduce((sum, t) => sum + t.percent, 0)).toBe(100)
  })

  it('seeds building types spanning every category', () => {
    const types = defaultBuildingTypes()
    for (const category of BUILDING_CATEGORIES) {
      expect(types.some((t) => t.category === category)).toBe(true)
    }
  })

  it('only marks building types as staffed when they are meant to generate a notable', () => {
    const types = defaultBuildingTypes()
    const residences = types.filter((t) => t.category === 'residence')
    expect(residences.every((t) => t.staffed === false)).toBe(true)
  })
})

describe('settlementFrontmatterSchema', () => {
  it('falls back to seeded defaults when fields are missing entirely', () => {
    const fm = settlementFrontmatterSchema.parse({ type: 'settlement' })
    expect(fm.wealthTiers).toEqual(defaultWealthTiers())
    expect(fm.buildingTypes).toEqual(defaultBuildingTypes())
    expect(fm.districts).toEqual(defaultDistrictsForSize('village'))
  })

  it('falls back on corrupt arrays instead of throwing', () => {
    const fm = settlementFrontmatterSchema.parse({ type: 'settlement', residents: 'not-an-array', buildings: 42 })
    expect(fm.residents).toEqual([])
    expect(fm.buildings).toEqual([])
  })

  it('round-trips a resident with notable content and a promoted note link', () => {
    const fm = settlementFrontmatterSchema.parse({
      type: 'settlement',
      residents: [
        {
          id: 'r1',
          name: 'Test Notable',
          race: 'human',
          wealthTierId: 'middle',
          districtId: 'main',
          notable: true,
          personalityLine: 'Gruff but fair',
          goal: 'wants to retire',
          stats: { str: 12, dex: 10, con: 11, int: 9, wis: 13, cha: 14 },
          linkedNoteTitle: 'Test Notable'
        }
      ]
    })
    expect(fm.residents[0].notable).toBe(true)
    expect(fm.residents[0].linkedNoteTitle).toBe('Test Notable')
    expect(fm.residents[0].stats).toEqual({ str: 12, dex: 10, con: 11, int: 9, wis: 13, cha: 14 })
  })
})

describe('customRaceDefSchema', () => {
  it('defaults inspirationSourceIds to an empty array', () => {
    const race = customRaceDefSchema.parse({ id: 'gnome', name: 'Gnome' })
    expect(race.inspirationSourceIds).toEqual([])
  })
})
