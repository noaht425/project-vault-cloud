import { describe, it, expect } from 'vitest'
import { bulkDataByteSize, shouldOffloadBulkData, BULK_DATA_INLINE_THRESHOLD_BYTES } from '../src/lib/settlementBulkData'
import type { SettlementBuilding, SettlementResident } from '../src/lib/noteTypes/settlement'

function residentStub(id: string): SettlementResident {
  return {
    id,
    name: 'Resident',
    race: 'human',
    age: 30,
    gender: '',
    professionBuildingId: null,
    jobTitle: '',
    employmentStatus: 'unemployed',
    homeless: false,
    homeBuildingId: null,
    wealthTierId: 'middle',
    districtId: 'main',
    religion: '',
    notable: false,
    flavorTag: '',
    personalityLine: '',
    goal: '',
    stats: null,
    proficiencies: [],
    appearance: '',
    relatives: [],
    educated: false,
    linkedNoteTitle: null
  }
}

describe('settlementBulkData', () => {
  it('reports no offload needed for an empty settlement', () => {
    expect(shouldOffloadBulkData([], [])).toBe(false)
  })

  it('offloads once serialized residents+buildings cross the threshold', () => {
    // A crude but simple way to cross ~2MB without generating tens of
    // thousands of realistic residents: pad one resident's name.
    const padded = { ...residentStub('r1'), name: 'x'.repeat(BULK_DATA_INLINE_THRESHOLD_BYTES) }
    expect(bulkDataByteSize([padded], [])).toBeGreaterThanOrEqual(BULK_DATA_INLINE_THRESHOLD_BYTES)
    expect(shouldOffloadBulkData([padded], [])).toBe(true)
  })

  it('stays inline for a small, realistic settlement', () => {
    const residents: SettlementResident[] = Array.from({ length: 300 }, (_, i) => residentStub(`r${i}`))
    const buildings: SettlementBuilding[] = []
    expect(shouldOffloadBulkData(residents, buildings)).toBe(false)
  })
})
