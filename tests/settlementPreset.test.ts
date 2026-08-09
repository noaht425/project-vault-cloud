import { describe, it, expect } from 'vitest'
import {
  defaultSettlementPresetFrontmatter,
  extractPresetFields,
  presetFieldsFromPreset,
  settlementPresetFrontmatterSchema
} from '../src/lib/noteTypes/settlementPreset'
import { defaultSettlementFrontmatter } from '../src/lib/noteTypes/settlement'

describe('settlementPreset', () => {
  it('defaultSettlementPresetFrontmatter parses to a valid settlement-preset note', () => {
    const preset = defaultSettlementPresetFrontmatter()
    expect(preset.type).toBe('settlement-preset')
    expect(preset.sizeId).toBe('village')
    expect(preset.buildingTypes.length).toBeGreaterThan(0)
  })

  it('extractPresetFields pulls exactly the Setup-tab fields and nothing else', () => {
    const settlement = {
      ...defaultSettlementFrontmatter(),
      summary: 'A quiet farming town',
      climateNoteTitle: 'Temperate Plains',
      sizeId: 'town',
      targetPopulation: 1200,
      buildings: [{ id: 'b1', name: 'Farmstead 1', buildingTypeId: 'farmstead', wealthTierId: 'lower', districtId: 'main', linkedNoteTitle: null, inventory: [] }],
      residents: []
    }
    const fields = extractPresetFields(settlement)

    expect(fields).toEqual({
      sizeId: settlement.sizeId,
      targetPopulation: settlement.targetPopulation,
      districts: settlement.districts,
      raceDistribution: settlement.raceDistribution,
      customRaces: settlement.customRaces,
      raceLifeStages: settlement.raceLifeStages,
      wealthTiers: settlement.wealthTiers,
      religionDistribution: settlement.religionDistribution,
      genderDistribution: settlement.genderDistribution,
      raceRelations: settlement.raceRelations,
      genderRelations: settlement.genderRelations,
      buildingTypes: settlement.buildingTypes,
      specialties: settlement.specialties,
      activeSpecialtyIds: settlement.activeSpecialtyIds,
      religiousWorkerMultiplier: settlement.religiousWorkerMultiplier,
      religiousPracticePercent: settlement.religiousPracticePercent,
      customEducation: settlement.customEducation,
      educatedWealthTierIds: settlement.educatedWealthTierIds,
      customFactions: settlement.customFactions,
      useRandomFactionDefaults: settlement.useRandomFactionDefaults,
      randomFactionCount: settlement.randomFactionCount,
      randomFactionMaxMembers: settlement.randomFactionMaxMembers
    })
    // Explicitly NOT carried into a preset — per-settlement flavor and
    // generated output, not reusable "kind of settlement" configuration.
    expect(fields).not.toHaveProperty('summary')
    expect(fields).not.toHaveProperty('climateNoteTitle')
    expect(fields).not.toHaveProperty('buildings')
    expect(fields).not.toHaveProperty('residents')
  })

  it('a round trip through save (extractPresetFields) then apply (presetFieldsFromPreset) preserves every field', () => {
    const settlement = { ...defaultSettlementFrontmatter(), targetPopulation: 5000, sizeId: 'city' }
    const savedFields = extractPresetFields(settlement)
    const presetNote = settlementPresetFrontmatterSchema.parse({ type: 'settlement-preset', ...savedFields })
    const appliedFields = presetFieldsFromPreset(presetNote)

    expect(appliedFields).toEqual(savedFields)
  })

  it('a preset note with missing/corrupt fields falls back to sensible defaults instead of throwing', () => {
    const parsed = settlementPresetFrontmatterSchema.parse({ type: 'settlement-preset', targetPopulation: 'not a number', wealthTiers: 'garbage' })
    expect(parsed.targetPopulation).toBe(300)
    expect(parsed.wealthTiers.length).toBeGreaterThan(0)
  })
})
