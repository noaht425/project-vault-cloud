import { z } from 'zod'
import {
  districtSchema,
  raceShareSchema,
  customRaceDefSchema,
  raceLifeStageSchema,
  wealthTierSchema,
  religionShareSchema,
  genderShareSchema,
  pairRelationSchema,
  buildingTypeDefSchema,
  specialtyDefSchema,
  customFactionDefSchema,
  defaultDistricts,
  defaultRaceLifeStages,
  defaultWealthTiers,
  defaultBuildingTypes,
  defaultSpecialties,
  defaultGenderDistribution,
  type SettlementFrontmatter
} from './settlement'

// Holds exactly the Settlement Setup tab's generation-INPUT fields (see
// SettlementSetupTab.tsx) — everything except summary/climateNoteTitle
// (per-settlement flavor, not a reusable "kind of settlement" trait) and,
// obviously, buildings/residents/factions (generated output, never an
// input — customFactions/randomFaction* config below IS carried, same
// "config yes, generated output no" split as buildingTypes vs buildings).
// Saved from one settlement's current Setup tab via "Save as preset", then
// applied to prefill another settlement's Setup tab via "Apply preset" — a
// preset is its own note (not a setting buried in app config) so it can be
// named, browsed, renamed, and reused like anything else in the vault, and
// gets Cloud Workspace parity for free the same way Map/Settlement did.
export const settlementPresetFrontmatterSchema = z
  .object({
    type: z.literal('settlement-preset'),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(''),
    sizeId: z.string().catch('village'),
    targetPopulation: z.coerce.number().catch(300),
    districts: z.array(districtSchema).catch(() => defaultDistricts()),
    raceDistribution: z.array(raceShareSchema).catch([]),
    customRaces: z.array(customRaceDefSchema).catch([]),
    raceLifeStages: z.array(raceLifeStageSchema).catch(() => defaultRaceLifeStages()),
    wealthTiers: z.array(wealthTierSchema).catch(() => defaultWealthTiers()),
    religionDistribution: z.array(religionShareSchema).catch([]),
    genderDistribution: z.array(genderShareSchema).catch(() => defaultGenderDistribution()),
    raceRelations: z.array(pairRelationSchema).catch([]),
    genderRelations: z.array(pairRelationSchema).catch([]),
    buildingTypes: z.array(buildingTypeDefSchema).catch(() => defaultBuildingTypes()),
    specialties: z.array(specialtyDefSchema).catch(() => defaultSpecialties()),
    activeSpecialtyIds: z.array(z.string()).catch([]),
    religiousWorkerMultiplier: z.coerce.number().catch(1),
    religiousPracticePercent: z.coerce.number().catch(90),
    customEducation: z.boolean().catch(false),
    educatedWealthTierIds: z.array(z.string()).catch([]),
    customFactions: z.array(customFactionDefSchema).catch([]),
    useRandomFactionDefaults: z.boolean().catch(true),
    randomFactionCount: z.coerce.number().catch(3),
    randomFactionMaxMembers: z.coerce.number().catch(50)
  })
  .passthrough()

export type SettlementPresetFrontmatter = z.infer<typeof settlementPresetFrontmatterSchema>

export function defaultSettlementPresetFrontmatter(): SettlementPresetFrontmatter {
  return settlementPresetFrontmatterSchema.parse({ type: 'settlement-preset' })
}

export type SettlementPresetFields = Pick<
  SettlementFrontmatter,
  | 'sizeId'
  | 'targetPopulation'
  | 'districts'
  | 'raceDistribution'
  | 'customRaces'
  | 'raceLifeStages'
  | 'wealthTiers'
  | 'religionDistribution'
  | 'genderDistribution'
  | 'raceRelations'
  | 'genderRelations'
  | 'buildingTypes'
  | 'specialties'
  | 'activeSpecialtyIds'
  | 'religiousWorkerMultiplier'
  | 'religiousPracticePercent'
  | 'customEducation'
  | 'educatedWealthTierIds'
  | 'customFactions'
  | 'useRandomFactionDefaults'
  | 'randomFactionCount'
  | 'randomFactionMaxMembers'
>

/** Pulls just the reusable Setup-tab fields out of a real settlement's frontmatter — the "Save as preset" action's job. */
export function extractPresetFields(data: SettlementFrontmatter): SettlementPresetFields {
  return {
    sizeId: data.sizeId,
    targetPopulation: data.targetPopulation,
    districts: data.districts,
    raceDistribution: data.raceDistribution,
    customRaces: data.customRaces,
    raceLifeStages: data.raceLifeStages,
    wealthTiers: data.wealthTiers,
    religionDistribution: data.religionDistribution,
    genderDistribution: data.genderDistribution,
    raceRelations: data.raceRelations,
    genderRelations: data.genderRelations,
    buildingTypes: data.buildingTypes,
    specialties: data.specialties,
    activeSpecialtyIds: data.activeSpecialtyIds,
    religiousWorkerMultiplier: data.religiousWorkerMultiplier,
    religiousPracticePercent: data.religiousPracticePercent,
    customEducation: data.customEducation,
    educatedWealthTierIds: data.educatedWealthTierIds,
    customFactions: data.customFactions,
    useRandomFactionDefaults: data.useRandomFactionDefaults,
    randomFactionCount: data.randomFactionCount,
    randomFactionMaxMembers: data.randomFactionMaxMembers
  }
}

/** Same extraction, from a saved preset note's own frontmatter — the "Apply preset" action's job, prefilling another settlement's Setup tab. */
export function presetFieldsFromPreset(preset: SettlementPresetFrontmatter): SettlementPresetFields {
  return {
    sizeId: preset.sizeId,
    targetPopulation: preset.targetPopulation,
    districts: preset.districts,
    raceDistribution: preset.raceDistribution,
    customRaces: preset.customRaces,
    raceLifeStages: preset.raceLifeStages,
    wealthTiers: preset.wealthTiers,
    religionDistribution: preset.religionDistribution,
    genderDistribution: preset.genderDistribution,
    raceRelations: preset.raceRelations,
    genderRelations: preset.genderRelations,
    buildingTypes: preset.buildingTypes,
    specialties: preset.specialties,
    activeSpecialtyIds: preset.activeSpecialtyIds,
    religiousWorkerMultiplier: preset.religiousWorkerMultiplier,
    religiousPracticePercent: preset.religiousPracticePercent,
    customEducation: preset.customEducation,
    educatedWealthTierIds: preset.educatedWealthTierIds,
    customFactions: preset.customFactions,
    useRandomFactionDefaults: preset.useRandomFactionDefaults,
    randomFactionCount: preset.randomFactionCount,
    randomFactionMaxMembers: preset.randomFactionMaxMembers
  }
}
