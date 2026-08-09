import { describe, it, expect } from 'vitest'
import { generateSettlement, type GenerationOptions } from '../src/lib/settlementGenerator'
import { defaultBuildingTypes, defaultWealthTiers, defaultGenderDistribution, type PairRelation } from '../src/lib/noteTypes/settlement'

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
    population: 4000,
    sizeId: 'city',
    districts: [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }],
    raceDistribution: [
      { race: 'human', percent: 50 },
      { race: 'elf', percent: 50 }
    ],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'None', percent: 100 }],
    buildingTypes: defaultBuildingTypes(),
    raceLifeStages: [
      { race: 'human', adulthood: 18, oldAge: 70, maxAge: 90 },
      { race: 'elf', adulthood: 30, oldAge: 400, maxAge: 500 }
    ],
    ...overrides
  }
}

describe('settlement generation: race relations (spouse/children)', () => {
  it('defaults every spouse to the SAME race as the notable when no race relations are configured (backward compatible)', () => {
    const result = generateSettlement(baseOptions(), undefined, seededRng(1), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const spouses = notables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse').map((s) => ({ notable: n, spouse: s })))
    expect(spouses.length).toBeGreaterThan(0)
    for (const { notable, spouse } of spouses) {
      expect(spouse.race).toBe(notable.race)
    }
  })

  it('lets a configured race relation produce a spouse of a DIFFERENT race', () => {
    const raceRelations: PairRelation[] = [{ a: 'human', b: 'elf', percent: 100 }]
    const result = generateSettlement(baseOptions({ raceRelations }), undefined, seededRng(2), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable && r.race === 'human')
    const spouses = notables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse'))
    expect(spouses.length).toBeGreaterThan(0)
    // 100% Human-Elf configured for human -> every human notable's spouse is an elf.
    expect(spouses.every((s) => s.race === 'elf')).toBe(true)
  })

  it("only affects a race that's actually part of a configured pair, leaving every OTHER race at its old same-race default", () => {
    // Human-elf is configured; dwarf is mentioned in no relation at all, so
    // a dwarf notable's spouse should still default to another dwarf, same
    // as if this feature didn't exist. (Not testing elf here — Human-Elf
    // being configured legitimately affects BOTH sides of that pair, since
    // it's the only relation touching either race.)
    const raceRelations: PairRelation[] = [{ a: 'human', b: 'elf', percent: 100 }]
    const options = baseOptions({
      raceRelations,
      raceDistribution: [
        { race: 'human', percent: 34 },
        { race: 'elf', percent: 33 },
        { race: 'dwarf', percent: 33 }
      ],
      raceLifeStages: [
        { race: 'human', adulthood: 18, oldAge: 70, maxAge: 90 },
        { race: 'elf', adulthood: 30, oldAge: 400, maxAge: 500 },
        { race: 'dwarf', adulthood: 25, oldAge: 200, maxAge: 250 }
      ]
    })
    const result = generateSettlement(options, undefined, seededRng(3), sequenceIds('r'))
    const dwarfNotables = result.residents.filter((r) => r.notable && r.race === 'dwarf')
    const dwarfSpouses = dwarfNotables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse'))
    expect(dwarfSpouses.length).toBeGreaterThan(0)
    expect(dwarfSpouses.every((s) => s.race === 'dwarf')).toBe(true)
  })

  it('gives a child EITHER parent\'s race when the parents differ, never inventing a third "mixed" race', () => {
    const raceRelations: PairRelation[] = [{ a: 'human', b: 'elf', percent: 100 }]
    const result = generateSettlement(baseOptions({ raceRelations, population: 8000 }), undefined, seededRng(4), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable && r.race === 'human')
    const children = notables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'child'))
    expect(children.length).toBeGreaterThan(5)
    const races = new Set(children.map((c) => c.race))
    // Every child is either human (the notable) or elf (the spouse) — never anything else.
    for (const race of races) expect(['human', 'elf']).toContain(race)
    // Confirms it's genuinely a coin flip, not always one side.
    expect(races.has('human')).toBe(true)
    expect(races.has('elf')).toBe(true)
  })

  it('gives every child the SAME race as the notable when no spouse was generated at all', () => {
    const raceRelations: PairRelation[] = [{ a: 'human', b: 'elf', percent: 100 }]
    // rng() always returns a high value so the 0.6 "has a spouse" roll
    // always fails — every notable with children has no spouse on record.
    const alwaysHighRng = (): number => 0.99
    const result = generateSettlement(baseOptions({ raceRelations }), undefined, alwaysHighRng, sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    for (const notable of notables) {
      expect(notable.relatives.some((rel) => rel.relation === 'spouse')).toBe(false)
      for (const child of notable.relatives.filter((rel) => rel.relation === 'child')) {
        expect(child.race).toBe(notable.race)
      }
    }
  })
})

describe('settlement generation: gender relations (spouse)', () => {
  const genderDistribution = defaultGenderDistribution()

  it('draws a spouse\'s gender independently from genderDistribution when no gender relations are configured (backward compatible)', () => {
    const result = generateSettlement(baseOptions({ genderDistribution }), undefined, seededRng(5), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const spouseGenders = notables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse').map((s) => s.gender))
    expect(spouseGenders.length).toBeGreaterThan(20)
    // Independent draw from a 4-option distribution should show real variety, not collapse to one gender.
    expect(new Set(spouseGenders).size).toBeGreaterThan(1)
  })

  it('lets a configured gender relation force a specific spouse gender', () => {
    const genderRelations: PairRelation[] = [{ a: 'Male', b: 'Female', percent: 100 }]
    const result = generateSettlement(baseOptions({ genderDistribution, genderRelations }), undefined, seededRng(6), sequenceIds('r'))
    const maleNotables = result.residents.filter((r) => r.notable && r.gender === 'Male')
    const spouses = maleNotables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse'))
    expect(spouses.length).toBeGreaterThan(0)
    expect(spouses.every((s) => s.gender === 'Female')).toBe(true)
  })

  it("only affects a gender that's actually part of a configured pair, leaving every OTHER gender at its old independent-draw default", () => {
    // Male-Female is configured; Non-binary is mentioned in no relation at
    // all, so a Non-binary notable's spouse should still be an independent
    // draw, same as if this feature didn't exist. (Not testing Female here
    // — Male-Female being configured legitimately affects BOTH sides.)
    const genderRelations: PairRelation[] = [{ a: 'Male', b: 'Female', percent: 100 }]
    // Large population — Non-binary is only 5% of the gender mix, so this
    // needs a big enough notable pool for a reliable sample of non-binary
    // spouses (each notable also only has ~60% odds of having a spouse at
    // all).
    const result = generateSettlement(
      baseOptions({ genderDistribution, genderRelations, population: 40000 }),
      undefined,
      seededRng(7),
      sequenceIds('r')
    )
    const nonbinaryNotables = result.residents.filter((r) => r.notable && r.gender === 'Non-binary')
    const spouseGenders = nonbinaryNotables.flatMap((n) => n.relatives.filter((rel) => rel.relation === 'spouse').map((s) => s.gender))
    expect(spouseGenders.length).toBeGreaterThan(10)
    // Untouched by genderRelations -> still an independent draw, so more than one outcome should appear.
    expect(new Set(spouseGenders).size).toBeGreaterThan(1)
  })
})
