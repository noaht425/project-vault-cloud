import { describe, it, expect } from 'vitest'
import { generateSettlement, type GenerationOptions } from '../src/lib/settlementGenerator'
import { defaultBuildingTypes, defaultWealthTiers, type CustomFactionDef } from '../src/lib/noteTypes/settlement'
import { FACTION_NAME_POOL } from '../src/lib/settlementNames'

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
    population: 2000,
    districts: [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }],
    raceDistribution: [{ race: 'human', percent: 100 }],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'None', percent: 100 }],
    buildingTypes: defaultBuildingTypes(),
    ...overrides
  }
}

describe('settlement generation: factions', () => {
  it('produces no factions at all when nothing is configured (backward compatible)', () => {
    const result = generateSettlement(baseOptions(), undefined, seededRng(1), sequenceIds('r'))
    expect(result.factions).toEqual([])
  })

  it('always generates every custom faction, with membership at or under its own max', () => {
    const customFactions: CustomFactionDef[] = [
      { id: 'c1', name: "Weaver's Circle", maxMembers: 40 },
      { id: 'c2', name: 'The Nightwatch', maxMembers: 100 }
    ]
    const result = generateSettlement(baseOptions({ customFactions }), undefined, seededRng(2), sequenceIds('r'))
    const generatedNames = result.factions.map((f) => f.name)
    expect(generatedNames).toContain("Weaver's Circle")
    expect(generatedNames).toContain('The Nightwatch')

    for (const faction of result.factions) {
      expect(faction.memberCount).toBeGreaterThanOrEqual(1)
      expect(faction.memberCount).toBeLessThanOrEqual(faction.maxMembers)
    }
  })

  it('picks the requested number of DISTINCT random factions from FACTION_NAME_POOL, never inventing a name', () => {
    const result = generateSettlement(baseOptions({ randomFactionCount: 5 }), undefined, seededRng(3), sequenceIds('r'))
    expect(result.factions).toHaveLength(5)
    const names = result.factions.map((f) => f.name)
    expect(new Set(names).size).toBe(5) // no duplicates
    for (const name of names) {
      expect(FACTION_NAME_POOL).toContain(name)
    }
  })

  it('never picks more random factions than the pool has, even if asked for more', () => {
    const result = generateSettlement(
      baseOptions({ randomFactionCount: FACTION_NAME_POOL.length + 10 }),
      undefined,
      seededRng(4),
      sequenceIds('r')
    )
    expect(result.factions).toHaveLength(FACTION_NAME_POOL.length)
  })

  it('scales the default random-faction max size with population when useRandomFactionDefaults is true', () => {
    const small = generateSettlement(
      baseOptions({ population: 200, randomFactionCount: 3, useRandomFactionDefaults: true }),
      undefined,
      seededRng(5),
      sequenceIds('r')
    )
    const large = generateSettlement(
      baseOptions({ population: 50000, randomFactionCount: 3, useRandomFactionDefaults: true }),
      undefined,
      seededRng(5),
      sequenceIds('r')
    )
    expect(large.factions[0].maxMembers).toBeGreaterThan(small.factions[0].maxMembers)
  })

  it('uses the exact configured max size for random factions when useRandomFactionDefaults is false', () => {
    const result = generateSettlement(
      baseOptions({ randomFactionCount: 3, useRandomFactionDefaults: false, randomFactionMaxMembers: 17 }),
      undefined,
      seededRng(6),
      sequenceIds('r')
    )
    for (const faction of result.factions) {
      expect(faction.maxMembers).toBe(17)
    }
  })

  it('combines custom and random factions together in one list', () => {
    const customFactions: CustomFactionDef[] = [{ id: 'c1', name: 'The Old Company', maxMembers: 30 }]
    const result = generateSettlement(baseOptions({ customFactions, randomFactionCount: 2 }), undefined, seededRng(7), sequenceIds('r'))
    expect(result.factions).toHaveLength(3)
    expect(result.factions.some((f) => f.name === 'The Old Company')).toBe(true)
  })

  it('regenerates factions fresh every Generate — no "kept" concept like promoted residents/buildings have', () => {
    const options = baseOptions({ randomFactionCount: 3 })
    const first = generateSettlement(options, undefined, seededRng(8), sequenceIds('r'))
    const second = generateSettlement(options, { buildings: first.buildings, residents: first.residents }, seededRng(9), sequenceIds('s'))
    // Different seed -> at least the ids differ, confirming these aren't
    // preserved/reused across a regeneration the way linked records are.
    expect(second.factions.map((f) => f.id)).not.toEqual(first.factions.map((f) => f.id))
  })
})
