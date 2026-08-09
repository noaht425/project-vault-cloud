import { describe, it, expect } from 'vitest'
import { buildPromotedNpcFrontmatter, buildPromotedLocationFrontmatter } from '../src/lib/settlementPromotion'
import type { SettlementBuilding, SettlementResident } from '../src/lib/noteTypes/settlement'

function makeNotable(overrides: Partial<SettlementResident> = {}): SettlementResident {
  return {
    id: 'r1',
    name: 'Borin Ironbeard',
    race: 'dwarf',
    age: 52,
    gender: 'Male',
    professionBuildingId: 'b1',
    jobTitle: 'Owner',
    employmentStatus: 'employed',
    homeless: false,
    homeBuildingId: null,
    wealthTierId: 'middle',
    districtId: 'main',
    religion: 'The Old Faith',
    notable: true,
    flavorTag: '',
    personalityLine: 'Gruff but fair',
    goal: 'wants to retire, but no one else can take over',
    stats: { str: 14, dex: 10, con: 13, int: 9, wis: 11, cha: 12 },
    proficiencies: ["Smith's Tools", 'Athletics'],
    appearance: 'Has short, thick, gray hair, and blue eyes.',
    relatives: [],
    educated: false,
    linkedNoteTitle: null,
    ...overrides
  }
}

function makeStub(overrides: Partial<SettlementResident> = {}): SettlementResident {
  return {
    ...makeNotable({
      notable: false,
      personalityLine: '',
      goal: '',
      stats: null,
      proficiencies: [],
      appearance: '',
      flavorTag: 'Whistles constantly, off-key.'
    }),
    ...overrides
  }
}

describe('buildPromotedNpcFrontmatter', () => {
  it('marks a notable resident with role Notable and keeps their rolled stats', () => {
    const { frontmatter } = buildPromotedNpcFrontmatter(makeNotable(), 'Main District', 'Middle')
    expect(frontmatter.type).toBe('npc')
    expect(frontmatter.role).toBe('Notable')
    expect(frontmatter.stats).toEqual({ str: 14, dex: 10, con: 13, int: 9, wis: 11, cha: 12 })
  })

  it('marks a stub resident with role Resident and falls back to default stats', () => {
    const { frontmatter } = buildPromotedNpcFrontmatter(makeStub(), 'Main District', 'Middle')
    expect(frontmatter.role).toBe('Resident')
    expect(frontmatter.stats).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })
  })

  it("weaves personality/goal into a notable's body, and the flavor tag into a stub's body", () => {
    const notableBody = buildPromotedNpcFrontmatter(makeNotable(), 'Main District', 'Middle').body
    expect(notableBody).toContain('Gruff but fair.')
    expect(notableBody).toContain('Borin Ironbeard wants to retire, but no one else can take over.')

    const stubBody = buildPromotedNpcFrontmatter(makeStub(), 'Main District', 'Middle').body
    expect(stubBody).toContain('Whistles constantly, off-key.')
  })

  it("weaves a notable's family into the body as a Family section, gendered by the notable's own gender", () => {
    const body = buildPromotedNpcFrontmatter(
      makeNotable({
        gender: 'Female',
        relatives: [
          { id: 'f1', name: 'Elena Brightwater', relation: 'spouse', gender: 'Female', age: 34, race: 'dwarf', livingStatus: 'alive' },
          { id: 'f2', name: 'Aldric Ashworth', relation: 'parent', gender: 'Male', age: 95, race: 'dwarf', livingStatus: 'deceased' }
        ]
      }),
      'Main District',
      'Middle'
    ).body
    expect(body).toContain('## Family')
    expect(body).toContain('Married to Elena Brightwater (34)')
    expect(body).toContain('Daughter of Aldric Ashworth (deceased)')
  })

  it('omits the Family section entirely when a resident has no relatives', () => {
    const body = buildPromotedNpcFrontmatter(makeStub(), 'Main District', 'Middle').body
    expect(body).not.toContain('## Family')
  })

  it('includes race/age/gender/district/wealth-tier/religion facts', () => {
    const body = buildPromotedNpcFrontmatter(makeNotable(), 'Main District', 'Middle').body
    expect(body).toContain('dwarf, age 52, Male')
    expect(body).toContain('Lives in Main District.')
    expect(body).toContain('Middle class.')
    expect(body).toContain('Follows [[The Old Faith]].')
  })

  it('includes an Educated. fact only when the resident is marked educated', () => {
    const educatedBody = buildPromotedNpcFrontmatter(makeNotable({ educated: true }), 'Main District', 'Middle').body
    expect(educatedBody).toContain('Educated.')

    const uneducatedBody = buildPromotedNpcFrontmatter(makeNotable({ educated: false }), 'Main District', 'Middle').body
    expect(uneducatedBody).not.toContain('Educated.')
  })

  it('includes proficiencies and an Appearance section when present', () => {
    const body = buildPromotedNpcFrontmatter(makeNotable(), 'Main District', 'Middle').body
    expect(body).toContain("Proficient in: Smith's Tools, Athletics.")
    expect(body).toContain('## Appearance\nHas short, thick, gray hair, and blue eyes.')
  })

  it('omits the proficiencies line and Appearance section for a stub with none', () => {
    const body = buildPromotedNpcFrontmatter(makeStub(), 'Main District', 'Middle').body
    expect(body).not.toContain('Proficient in')
    expect(body).not.toContain('## Appearance')
  })

  it('omits empty district/wealth-tier facts gracefully rather than leaving blank fragments', () => {
    const body = buildPromotedNpcFrontmatter(makeNotable({ religion: '' }), '', '')
    expect(body.body).not.toContain('Lives in')
    expect(body.body).not.toContain('class.')
    expect(body.body).not.toContain('Follows')
  })
})

describe('buildPromotedLocationFrontmatter', () => {
  const building: SettlementBuilding = {
    id: 'b1',
    name: 'The Rusty Anchor',
    buildingTypeId: 'tavern',
    wealthTierId: 'middle',
    districtId: 'harborside',
    linkedNoteTitle: null,
    inventory: []
  }

  it('sets locationType to "location" and summarizes the building type + district', () => {
    const { frontmatter } = buildPromotedLocationFrontmatter(building, 'Tavern', 'Harborside', 'Middle')
    expect(frontmatter.type).toBe('location')
    expect(frontmatter.locationType).toBe('location')
    expect(frontmatter.summary).toBe('Tavern in Harborside')
  })

  it('mentions the wealth tier in the body when known', () => {
    const { body } = buildPromotedLocationFrontmatter(building, 'Tavern', 'Harborside', 'Middle')
    expect(body).toBe('Middle-tier establishment.')
  })

  it('falls back to generic labels when building type/district/tier are unknown', () => {
    const { frontmatter, body } = buildPromotedLocationFrontmatter(building, '', '', '')
    expect(frontmatter.summary).toBe('Building')
    expect(body).toBe('')
  })
})
