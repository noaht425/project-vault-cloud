import { describe, it, expect } from 'vitest'
import { generateSettlement, relationLabel, type GenerationOptions } from '../src/lib/settlementGenerator'
import { defaultBuildingTypes, defaultWealthTiers, type RaceLifeStage } from '../src/lib/noteTypes/settlement'

// Same seeded PRNG as settlementGenerator.test.ts (mulberry32) — determinism
// just means "same seed in -> same settlement out", not hand-picked values.
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

const HUMAN_LIFE_STAGE: RaceLifeStage = { race: 'human', adulthood: 18, oldAge: 70, maxAge: 90 }

describe('relationLabel', () => {
  it('labels spouse the same regardless of gender', () => {
    expect(relationLabel('spouse', 'Female')).toBe('Married to')
    expect(relationLabel('spouse', 'Male')).toBe('Married to')
    expect(relationLabel('spouse', 'Nonbinary')).toBe('Married to')
  })

  it("labels a relative whose relation is 'parent' by the notable's own gender (the notable is that parent's child)", () => {
    expect(relationLabel('parent', 'Female')).toBe('Daughter of')
    expect(relationLabel('parent', 'Male')).toBe('Son of')
    expect(relationLabel('parent', 'Nonbinary')).toBe('Child of')
  })

  it("labels a relative whose relation is 'child' by the notable's own gender (the notable is that child's parent)", () => {
    expect(relationLabel('child', 'Female')).toBe('Mother of')
    expect(relationLabel('child', 'Male')).toBe('Father of')
    expect(relationLabel('child', 'Nonbinary')).toBe('Parent of')
  })

  it('labels sibling and grandparent by the notable\'s own gender too', () => {
    expect(relationLabel('sibling', 'Female')).toBe('Sister of')
    expect(relationLabel('sibling', 'Male')).toBe('Brother of')
    expect(relationLabel('sibling', 'Nonbinary')).toBe('Sibling of')
    expect(relationLabel('grandparent', 'Female')).toBe('Granddaughter of')
    expect(relationLabel('grandparent', 'Male')).toBe('Grandson of')
    expect(relationLabel('grandparent', 'Nonbinary')).toBe('Grandchild of')
  })
})

describe('settlement generation: notable family', () => {
  const baseOptions: GenerationOptions = {
    population: 4000,
    sizeId: 'city',
    districts: [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }],
    raceDistribution: [{ race: 'human', percent: 100 }],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'None', percent: 100 }],
    buildingTypes: defaultBuildingTypes(),
    raceLifeStages: [HUMAN_LIFE_STAGE]
  }

  it('gives notables a relatives array and stub residents none at all', () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(7), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const stubs = result.residents.filter((r) => !r.notable)
    expect(notables.length).toBeGreaterThan(20)
    expect(stubs.length).toBeGreaterThan(20)

    // At least some notables should have at least one relative — not every
    // single one will (spouse/parents are each independently rolled), but
    // across dozens of notables the pool should produce plenty.
    expect(notables.some((r) => r.relatives.length > 0)).toBe(true)
    expect(stubs.every((r) => r.relatives.length === 0)).toBe(true)
  })

  it('keeps every relative the same race as the notable (known v1 limitation)', () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(11), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    for (const notable of notables) {
      for (const relative of notable.relatives) {
        expect(relative.race).toBe(notable.race)
      }
    }
  })

  it('keeps every relative type within RELATION_TYPES and gives every relative a non-empty name', () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(13), sequenceIds('r'))
    const allRelatives = result.residents.filter((r) => r.notable).flatMap((r) => r.relatives)
    expect(allRelatives.length).toBeGreaterThan(20)
    for (const relative of allRelatives) {
      expect(['spouse', 'child', 'parent', 'sibling', 'grandparent']).toContain(relative.relation)
      expect(relative.name.length).toBeGreaterThan(0)
    }
  })

  it("keeps every 'child' relative's age plausible — the notable must already have been an adult when they were born", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(17), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const withChildren = notables.filter((r) => r.relatives.some((rel) => rel.relation === 'child'))
    expect(withChildren.length).toBeGreaterThan(0)
    for (const notable of withChildren) {
      for (const child of notable.relatives.filter((rel) => rel.relation === 'child')) {
        expect(child.age).toBeGreaterThanOrEqual(0)
        expect(child.age).toBeLessThanOrEqual(notable.age - HUMAN_LIFE_STAGE.adulthood)
      }
    }
  })

  it("keeps every 'parent'/'grandparent' relative old enough that the notable was born after they reached adulthood", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(19), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    for (const notable of notables) {
      for (const relative of notable.relatives.filter((rel) => rel.relation === 'parent' || rel.relation === 'grandparent')) {
        expect(relative.age).toBeGreaterThanOrEqual(notable.age + HUMAN_LIFE_STAGE.adulthood)
      }
    }
  })

  it('marks a parent/grandparent deceased exactly when their age exceeds the race max lifespan, and never marks a spouse/child/sibling deceased', () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(23), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    let sawDeceased = false
    for (const notable of notables) {
      for (const relative of notable.relatives) {
        if (relative.relation === 'parent' || relative.relation === 'grandparent') {
          const shouldBeDeceased = relative.age > HUMAN_LIFE_STAGE.maxAge
          expect(relative.livingStatus).toBe(shouldBeDeceased ? 'deceased' : 'alive')
          if (shouldBeDeceased) sawDeceased = true
        } else {
          expect(relative.livingStatus).toBe('alive')
        }
      }
    }
    // Confirms the deceased branch actually gets exercised across this
    // sample, not just that it's never wrongly triggered.
    expect(sawDeceased).toBe(true)
  })

  it('never regenerates relatives for an already-promoted (linkedNoteTitle set) notable', () => {
    const first = generateSettlement(baseOptions, undefined, seededRng(29), sequenceIds('r'))
    const promoted = first.residents.find((r) => r.notable)!
    promoted.linkedNoteTitle = 'Borin Ironbeard'
    const originalRelatives = promoted.relatives

    const second = generateSettlement(baseOptions, { buildings: first.buildings, residents: first.residents }, seededRng(31), sequenceIds('s'))
    const stillPromoted = second.residents.find((r) => r.id === promoted.id)!
    expect(stillPromoted.relatives).toBe(originalRelatives)
  })
})

function lastWord(name: string): string {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1]
}

describe('settlement generation: family surname sharing', () => {
  const baseOptions: GenerationOptions = {
    population: 4000,
    sizeId: 'city',
    districts: [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }],
    raceDistribution: [{ race: 'human', percent: 100 }],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'None', percent: 100 }],
    buildingTypes: defaultBuildingTypes(),
    raceLifeStages: [HUMAN_LIFE_STAGE]
  }

  it("gives every child the notable's own surname", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(3), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const withChildren = notables.filter((r) => r.relatives.some((rel) => rel.relation === 'child'))
    expect(withChildren.length).toBeGreaterThan(0)
    for (const notable of withChildren) {
      const notableSurname = lastWord(notable.name)
      for (const child of notable.relatives.filter((rel) => rel.relation === 'child')) {
        expect(lastWord(child.name)).toBe(notableSurname)
      }
    }
  })

  it("doesn't deliberately share the notable's surname with a spouse — any match is pure chance from the finite name pool, not the design's doing", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(5), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const spouses = notables.flatMap((r) => r.relatives.filter((rel) => rel.relation === 'spouse').map((s) => ({ notable: r, spouse: s })))
    expect(spouses.length).toBeGreaterThan(20)
    // Unlike children (always 1.0) or parents/grandparents (at least one
    // guaranteed), a spouse is never deliberately given the family
    // surname — so the observed share-rate here should sit far below
    // those, close to whatever a same-pool coincidence rate would produce
    // on its own, not systematically forced to match.
    const shareFraction = spouses.filter((s) => lastWord(s.spouse.name) === lastWord(s.notable.name)).length / spouses.length
    expect(shareFraction).toBeLessThan(0.2)
  })

  it("gives at least one parent (when any exist) the notable's own surname, but not always both", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(9), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    let sawBothShare = false
    let sawOnlyOneShare = false
    for (const notable of notables) {
      const notableSurname = lastWord(notable.name)
      const parents = notable.relatives.filter((rel) => rel.relation === 'parent')
      if (parents.length === 0) continue
      const sharingCount = parents.filter((p) => lastWord(p.name) === notableSurname).length
      expect(sharingCount).toBeGreaterThanOrEqual(1)
      if (parents.length === 2 && sharingCount === 2) sawBothShare = true
      if (parents.length === 2 && sharingCount === 1) sawOnlyOneShare = true
    }
    // Confirms the "second parent has just a chance, not a guarantee" design
    // actually produces both outcomes across this sample.
    expect(sawBothShare).toBe(true)
    expect(sawOnlyOneShare).toBe(true)
  })

  it("gives at least one grandparent (when any exist) the notable's own surname", () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(15), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    let checkedAny = false
    for (const notable of notables) {
      const notableSurname = lastWord(notable.name)
      const grandparents = notable.relatives.filter((rel) => rel.relation === 'grandparent')
      if (grandparents.length === 0) continue
      checkedAny = true
      expect(grandparents.some((g) => lastWord(g.name) === notableSurname)).toBe(true)
    }
    expect(checkedAny).toBe(true)
  })

  it('lets some but not all siblings share the surname across a large sample (not 0% and not 100%)', () => {
    const result = generateSettlement(baseOptions, undefined, seededRng(21), sequenceIds('r'))
    const notables = result.residents.filter((r) => r.notable)
    const siblingPairs = notables.flatMap((r) =>
      r.relatives.filter((rel) => rel.relation === 'sibling').map((s) => ({ shares: lastWord(s.name) === lastWord(r.name) }))
    )
    expect(siblingPairs.length).toBeGreaterThan(20)
    const shareFraction = siblingPairs.filter((p) => p.shares).length / siblingPairs.length
    expect(shareFraction).toBeGreaterThan(0)
    expect(shareFraction).toBeLessThan(1)
  })
})
