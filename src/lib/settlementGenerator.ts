import { ABILITY_KEYS, type AbilityScores } from './noteTypes/creatureStats'
import {
  SETTLEMENT_SIZE_IDS,
  defaultGenderDistribution,
  resolveEducatedWealthTierIds,
  type BuildingTypeDef,
  type CustomFactionDef,
  type CustomRaceDef,
  type District,
  type Faction,
  type GenderShare,
  type NotableRelative,
  type PairRelation,
  type RaceLifeStage,
  type RaceShare,
  type RelationType,
  type ReligionShare,
  type SettlementBuilding,
  type SettlementResident,
  type SpecialtyDef,
  type WealthTier
} from './noteTypes/settlement'
import {
  FACTION_NAME_POOL,
  generateFlavorTag,
  generateGoal,
  generateName,
  generatePersonalityLine,
  resolveNameBank,
  type NameBank
} from './settlementNames'
import { generateSyntheticName, PHONETIC_PROFILES, type PhoneticProfile } from './phoneticNames'
import { generateAppearance } from './settlementAppearance'

export interface SettlementSizePreset {
  id: string
  name: string
  // The average a generated population centers on — actual generation
  // still jitters around this by ±~1% SD (see POPULATION_JITTER_SD_FRACTION
  // below), same mechanism as before; this is just the center point, not a
  // min/max range, since these presets are now much more finely grained.
  averagePopulation: number
  // Which of the 5 canonical SETTLEMENT_SIZE_IDS (noteTypes/settlement.ts)
  // this preset gates building types/items/districts as — decoupled from
  // the preset's own id so there can be many more named population presets
  // than there are gating tiers, without needing 11 separate district sets
  // or an 11-tier sizeGateMultiplier decay (which would effectively become
  // a hard cutoff instead of the soft one this engine uses everywhere).
  gatingSizeId: string
}

// Finely-grained population presets for the "pick a size" step — the user
// can always override with an exact population instead. Several presets
// share the same gatingSizeId (e.g. Small/regular/Big Village all gate as
// 'village') since gating only needs 5 tiers to stay a soft bias rather
// than a hard wall; the presets themselves can be as granular as wanted.
export const SETTLEMENT_SIZE_PRESETS: SettlementSizePreset[] = [
  { id: 'hamlet', name: 'Hamlet', averagePopulation: 100, gatingSizeId: 'hamlet' },
  { id: 'small-village', name: 'Small Village', averagePopulation: 250, gatingSizeId: 'village' },
  { id: 'village', name: 'Village', averagePopulation: 500, gatingSizeId: 'village' },
  { id: 'big-village', name: 'Big Village', averagePopulation: 1000, gatingSizeId: 'village' },
  { id: 'small-town', name: 'Small Town', averagePopulation: 2500, gatingSizeId: 'town' },
  { id: 'town', name: 'Town', averagePopulation: 5000, gatingSizeId: 'town' },
  { id: 'big-town', name: 'Big Town', averagePopulation: 7500, gatingSizeId: 'city' },
  { id: 'small-city', name: 'Small City', averagePopulation: 10000, gatingSizeId: 'city' },
  { id: 'city', name: 'City', averagePopulation: 20000, gatingSizeId: 'city' },
  { id: 'big-city', name: 'Big City', averagePopulation: 30000, gatingSizeId: 'metropolis' },
  { id: 'metropolis', name: 'Metropolis', averagePopulation: 60000, gatingSizeId: 'metropolis' }
]

// Population thresholds an unlabeled population number gates as — same 5
// canonical tiers/boundaries this engine has always used (100/1,000/
// 5,000/25,000), just no longer expressed as each preset's own min/max
// since presets are a finer-grained, separate concept now (see
// SettlementSizePreset.gatingSizeId above).
const GATING_POPULATION_THRESHOLDS: { maxPopulation: number; sizeId: string }[] = [
  { maxPopulation: 100, sizeId: 'hamlet' },
  { maxPopulation: 1000, sizeId: 'village' },
  { maxPopulation: 5000, sizeId: 'town' },
  { maxPopulation: 25000, sizeId: 'city' }
]

/** Canonical gating tier for a raw population, for callers that haven't picked a size explicitly. Clamps to 'metropolis' above the whole range. */
export function inferSizeId(population: number): string {
  for (const { maxPopulation, sizeId } of GATING_POPULATION_THRESHOLDS) {
    if (population <= maxPopulation) return sizeId
  }
  return 'metropolis'
}

/** Resolves a size preset's id to the canonical gating tier it uses (see SettlementSizePreset.gatingSizeId) — passes an already-canonical id (or any unrecognized custom value) straight through unchanged. */
export function resolveGatingSizeId(presetOrGatingId: string): string {
  const preset = SETTLEMENT_SIZE_PRESETS.find((p) => p.id === presetOrGatingId)
  return preset ? preset.gatingSizeId : presetOrGatingId
}

function sizeIndex(sizeId: string): number {
  const index = SETTLEMENT_SIZE_IDS.indexOf(sizeId as (typeof SETTLEMENT_SIZE_IDS)[number])
  return index === -1 ? SETTLEMENT_SIZE_IDS.indexOf('village') : index
}

// A SOFT size floor (confirmed with the user, not a hard cutoff): each size
// tier below a building type's minSizeId cuts its effective weight to 15%
// of the previous tier's, so a hamlet CAN still roll a guildhall, just at
// roughly 0.3% of its normal weight (two tiers below town) rather than 0.
function sizeGateMultiplier(currentSizeId: string, minSizeId: string): number {
  const diff = sizeIndex(minSizeId) - sizeIndex(currentSizeId)
  return diff <= 0 ? 1 : Math.pow(0.15, diff)
}

/** Multiplies together every active specialty's boost for one building type — stacks when more than one active specialty boosts the same type. */
function specialtyMultiplier(buildingTypeId: string, specialties: SpecialtyDef[], activeSpecialtyIds: string[]): number {
  let multiplier = 1
  for (const specialty of specialties) {
    if (!activeSpecialtyIds.includes(specialty.id)) continue
    for (const boost of specialty.boosts) {
      if (boost.buildingTypeId === buildingTypeId) multiplier *= boost.multiplier
    }
  }
  return multiplier
}

// Roughly how many residents live in one residence building — flattened
// across residence building types for v1 (a manor and a tenement currently
// hold the same "household" for generation purposes, even though their
// wealth tiers differ). Tune later if a per-type capacity turns out to
// matter more than this simplification.
const AVG_HOUSEHOLD_SIZE = 4

// Roughly how many residents "support" one staffed (shop/civic/religious/
// tavern) building — an assumption, not a simulated economy. Tuned low
// enough that even a modest village (a few hundred people) ends up with
// more than one or two shop types, not just whichever single type has the
// highest weight. A hamlet of 40 still gets at least one of whatever
// staffed types are defined.
const POPULATION_PER_STAFFED_BUILDING = 40

// Fallback only, for a caller/test that doesn't pass options.genderDistribution
// at all — the real default now lives in noteTypes/settlement.ts's
// defaultGenderDistribution() and is user-editable (Settlement Setup tab's
// Genders section), same as race/wealth/religion distribution already are.

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

/** Weighted pick by `.percent`, falling back to the last item (or null) if every percent is 0/negative or the list is empty. */
function pickByPercent<T extends { percent: number }>(items: T[], rng: () => number): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.percent), 0)
  if (items.length === 0 || total <= 0) return items[items.length - 1] ?? null
  let roll = rng() * total
  for (const item of items) {
    roll -= Math.max(0, item.percent)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

/**
 * Splits an integer `budget` across `weights` proportionally, using the
 * largest-remainder method so the per-item counts always sum to exactly
 * `budget` (plain rounding can drift a few units off). Zero total weight
 * yields an all-zero allocation rather than dividing by zero.
 */
function allocateByWeight(budget: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (weights.length === 0 || totalWeight <= 0 || budget <= 0) return weights.map(() => 0)

  const raw = weights.map((w) => (w / totalWeight) * budget)
  const floors = raw.map(Math.floor)
  const allocated = floors.reduce((sum, f) => sum + f, 0)
  const remainder = budget - allocated

  const byFractionDesc = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction)

  const result = [...floors]
  for (let i = 0; i < remainder; i++) result[byFractionDesc[i % byFractionDesc.length].index]++
  return result
}

// Box-Muller transform — a standard normal (mean 0, sd 1) value from two
// uniform rng() draws. Used instead of a dice-roll formula (the old
// 4d6-keep-highest-3) because the user specifically wants a bell curve
// centered on 10 with a stated shape: the bulk of scores in 8-12, a smaller
// "shoulder" at 7/13-14, rarer still at 6/15-17, and near-impossible beyond
// that. Mean 10 + SD 2 reproduces almost exactly that shape (±1 SD = 8-12 is
// ~68% of a normal distribution, ±2 SD = 6-14 is ~95%, beyond ±3.5 SD i.e.
// <3 or >17 is under 0.1%) — the SD wasn't tuned by trial and error, it
// falls out directly from the user's own bucket description.
function normalRandom(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// A requested population is an estimate, not a precise census — generating
// EXACTLY the typed number every single time (especially when it's the
// size preset's suspiciously round midpoint, e.g. 62500 for a Metropolis)
// reads as artificial. SD 1% of the target keeps the actual count close to
// what was asked for while landing on an ordinary-looking number almost
// every time; reuses the same normalRandom tool as ability scores/ages for
// consistency.
const POPULATION_JITTER_SD_FRACTION = 0.01

function jitterPopulation(target: number, rng: () => number): number {
  const sd = Math.max(1, target * POPULATION_JITTER_SD_FRACTION)
  return Math.max(1, Math.round(target + sd * normalRandom(rng)))
}

// -------------------- Factions --------------------

// "Somewhere close to" a faction's maxMembers, per the user's own spec —
// biased at-or-under the max (a half-normal shortfall, never an overshoot)
// since "maximum" is a real ceiling, not just a target to jitter both ways
// around like jitterPopulation does for the whole settlement.
const FACTION_MEMBER_JITTER_SD_FRACTION = 0.15

function factionMemberCount(maxMembers: number, rng: () => number): number {
  const sd = Math.max(1, maxMembers * FACTION_MEMBER_JITTER_SD_FRACTION)
  const shortfall = Math.abs(sd * normalRandom(rng))
  return Math.max(1, Math.min(maxMembers, Math.round(maxMembers - shortfall)))
}

// Used only when useRandomFactionDefaults is true — scales with the
// settlement so a hamlet's random factions aren't sized like a
// Metropolis's. Generic placeholder ratio (2% of population, floor of 5),
// same "round, clearly-tunable starting point" spirit as every other
// default constant in this file.
function defaultRandomFactionMaxMembers(population: number): number {
  return Math.max(5, Math.round(population * 0.02))
}

/**
 * Custom factions (Setup-tab config, persistent) always get generated;
 * random ones pick `randomFactionCount` distinct names from
 * FACTION_NAME_POOL (user-supplied, not invented here — see that pool's own
 * comment) each Generate. Neither kind is preserved across regeneration the
 * way promoted buildings/residents are — factions have no "promote" concept
 * (yet), so this always returns a fresh list built from current config.
 */
function generateFactions(
  customFactions: CustomFactionDef[],
  useRandomDefaults: boolean,
  randomCount: number,
  randomMaxMembers: number,
  population: number,
  rng: () => number,
  idFactory: () => string
): Faction[] {
  const customGenerated: Faction[] = customFactions.map((cf) => ({
    id: idFactory(),
    name: cf.name,
    maxMembers: cf.maxMembers,
    memberCount: factionMemberCount(cf.maxMembers, rng)
  }))

  const effectiveRandomMax = useRandomDefaults ? defaultRandomFactionMaxMembers(population) : randomMaxMembers
  const pool = [...FACTION_NAME_POOL]
  const count = Math.max(0, Math.min(Math.round(randomCount), pool.length))
  const randomGenerated: Faction[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * pool.length)
    const name = pool.splice(index, 1)[0]
    randomGenerated.push({
      id: idFactory(),
      name,
      maxMembers: effectiveRandomMax,
      memberCount: factionMemberCount(effectiveRandomMax, rng)
    })
  }

  return [...customGenerated, ...randomGenerated]
}

const ABILITY_MEAN = 10
const ABILITY_SD = 2
const ABILITY_MIN = 3
const ABILITY_MAX = 18
// How far a building type's primary/secondary ability shifts that stat's
// MEAN (not its spread) — a temple's Wisdom rolls from a mean of 14, not a
// guaranteed 14, so it still varies notable to notable.
const PRIMARY_ABILITY_BONUS = 4
const SECONDARY_ABILITY_BONUS = 2

function rollAbilityScore(mean: number, rng: () => number): number {
  const raw = Math.round(mean + ABILITY_SD * normalRandom(rng))
  return Math.min(ABILITY_MAX, Math.max(ABILITY_MIN, raw))
}

/** A notable's stats lean toward their building type's primaryAbility/secondaryAbility (a cleric's Wisdom, a tavern keeper's Charisma) — every other stat rolls from the population-average mean of 10. */
function rollAbilityScores(buildingType: BuildingTypeDef | undefined, rng: () => number): AbilityScores {
  const scores = {} as AbilityScores
  for (const key of ABILITY_KEYS) {
    let mean = ABILITY_MEAN
    if (buildingType?.primaryAbility === key) mean += PRIMARY_ABILITY_BONUS
    else if (buildingType?.secondaryAbility === key) mean += SECONDARY_ABILITY_BONUS
    scores[key] = rollAbilityScore(mean, rng)
  }
  return scores
}

/** Picks without replacement — "one or two" proficiencies (weighted toward one) from the building type's candidate pool, or none if it has no pool defined. */
function pickProficiencies(buildingType: BuildingTypeDef | undefined, rng: () => number): string[] {
  const pool = buildingType?.proficiencyPool ?? []
  if (pool.length === 0) return []
  const count = pool.length >= 2 && rng() < 0.5 ? 2 : 1
  const remaining = [...pool]
  const picked: string[] = []
  while (remaining.length > 0 && picked.length < count) {
    const index = Math.floor(rng() * remaining.length)
    picked.push(remaining.splice(index, 1)[0])
  }
  return picked
}

// Age-gated employment for STUB residents (notables are always "employed" —
// see the notable-generation loop below). The user was explicit that a
// child having a job should be a hard 0%, not just unlikely; everything
// else is a simple piecewise-linear ramp/plateau/decline shape, tunable
// here without hunting through the algorithm:
// 0% at adulthood -> ramps up to a plateau by adulthood + (oldAge-adulthood)
// * EMPLOYMENT_RAMP_FRACTION -> holds the plateau until oldAge -> ramps back
// down to a low-but-nonzero floor by maxAge (some people do work into old
// age).
const EMPLOYMENT_RAMP_FRACTION = 0.25
const EMPLOYMENT_PLATEAU_RATE = 0.75
const EMPLOYMENT_ELDERLY_FLOOR = 0.12

function employmentProbability(age: number, stage: RaceLifeStage): number {
  if (age < stage.adulthood) return 0
  const rampEnd = stage.adulthood + (stage.oldAge - stage.adulthood) * EMPLOYMENT_RAMP_FRACTION
  if (rampEnd > stage.adulthood && age < rampEnd) {
    return EMPLOYMENT_PLATEAU_RATE * ((age - stage.adulthood) / (rampEnd - stage.adulthood))
  }
  if (age <= stage.oldAge) return EMPLOYMENT_PLATEAU_RATE
  if (stage.maxAge <= stage.oldAge) return EMPLOYMENT_ELDERLY_FLOOR
  const t = Math.min(1, (age - stage.oldAge) / (stage.maxAge - stage.oldAge))
  return EMPLOYMENT_PLATEAU_RATE + (EMPLOYMENT_ELDERLY_FLOOR - EMPLOYMENT_PLATEAU_RATE) * t
}

const GENERIC_JOB_TITLES = ['Laborer', 'Hand', 'Worker']

/** A stub's job title comes from their workplace's jobTitlePool — falls back to a generic title for a building type with none configured, same fallback spirit used elsewhere in this file rather than leaving it blank. */
function pickJobTitle(buildingType: BuildingTypeDef | undefined, rng: () => number): string {
  const pool = buildingType?.jobTitlePool ?? []
  if (pool.length > 0) return pool[Math.floor(rng() * pool.length)]
  return GENERIC_JOB_TITLES[Math.floor(rng() * GENERIC_JOB_TITLES.length)]
}

// Homelessness is a deliberate state (see noteTypes/settlement.ts's
// `homeless` field comment), independent of wealth tier — only rolled for
// unemployed adults already in the settlement's lowest wealth tier (the
// last entry in `wealthTiers`, same "list order = rank" convention the UI
// already relies on for wealth-tier sorting). A tunable rate, not derived
// from anything more precise.
const HOMELESS_RATE = 0.08

// Target stock count for a shop/tavern/religious building's inventory, by
// settlement size — round numbers, not derived from anything more precise.
// Only building types with a non-empty itemPool generate inventory at all
// (see buildInventory below); civic/residence types are skipped entirely
// regardless of size.
const STOCK_COUNT_BY_SIZE: Record<string, { min: number; max: number }> = {
  hamlet: { min: 2, max: 4 },
  village: { min: 4, max: 6 },
  town: { min: 6, max: 9 },
  city: { min: 9, max: 13 },
  metropolis: { min: 13, max: 18 }
}

// Magic Item Shop draws from a much larger single pool (~375 items, see its
// itemPool in noteTypes/settlement.ts) than a mundane shop's 5-25 items, so
// the default stock counts above would barely sample it — confirmed with
// the user: a shop should pull a bigger selection (around 30 for a typical
// size), scaling with settlement size same as everything else here.
const STOCK_COUNT_OVERRIDE_BY_TYPE_ID: Record<string, Record<string, { min: number; max: number }>> = {
  'magic-item-shop': {
    town: { min: 15, max: 20 },
    city: { min: 22, max: 28 },
    metropolis: { min: 28, max: 36 }
  }
}

/**
 * Picks a building's actual stock from its type's itemPool — weighted by
 * `sizeGateMultiplier` (reusing the exact same function that gates whole
 * building types by size) so a hamlet's shop mostly draws common items with
 * an occasional rare one slipping in, while a metropolis version skews
 * toward the pool's fancier end. Pick-without-replacement, same pattern as
 * `pickProficiencies`; capped at the pool's actual size.
 */
function buildInventory(buildingType: BuildingTypeDef, sizeId: string, rng: () => number): string[] {
  const pool = buildingType.itemPool ?? []
  if (pool.length === 0) return []
  const sizeTable = STOCK_COUNT_OVERRIDE_BY_TYPE_ID[buildingType.id] ?? STOCK_COUNT_BY_SIZE
  const range = sizeTable[sizeId] ?? STOCK_COUNT_BY_SIZE.village
  const targetCount = Math.min(pool.length, randomInt(range.min, range.max, rng))

  const remaining = [...pool]
  const picked: string[] = []
  while (remaining.length > 0 && picked.length < targetCount) {
    const weights = remaining.map((item) => sizeGateMultiplier(sizeId, item.minSizeId))
    const total = weights.reduce((sum, w) => sum + w, 0)
    let index = remaining.length - 1
    if (total > 0) {
      let roll = rng() * total
      index = 0
      for (; index < remaining.length; index++) {
        roll -= weights[index]
        if (roll <= 0) break
      }
      index = Math.min(index, remaining.length - 1)
    } else {
      index = Math.floor(rng() * remaining.length)
    }
    picked.push(remaining.splice(index, 1)[0].name)
  }
  return picked
}

const FALLBACK_LIFE_STAGE: RaceLifeStage = { race: 'human', adulthood: 18, oldAge: 70, maxAge: 90 }

/** Falls back to the table's own 'human' row, then a hardcoded default, for any race with no life-stage entry — same fallback spirit as settlementNames.ts's resolveNameBank. */
function resolveLifeStage(race: string, lifeStages: RaceLifeStage[]): RaceLifeStage {
  const exact = lifeStages.find((stage) => stage.race === race)
  if (exact) return exact
  return lifeStages.find((stage) => stage.race === 'human') ?? FALLBACK_LIFE_STAGE
}

/** A notable is always a working adult — somewhere between this race's adulthood and old-age milestones (user-editable per settlement, see RaceLifeStage). Guards against a hand-edited adulthood >= oldAge. */
// A notable's age was originally flat-uniform across [adulthood, oldAge],
// which made "just became an adult and somehow already runs the temple"
// exactly as likely as any other age in the range — not wrong (a young
// heir who inherited early is a fine story), just too common. Reusing the
// same normal-distribution tool as ability scores: centered 40% through the
// adult range (an established-but-not-elderly professional is the typical
// case), SD 20% of the range, so the youngest ages become a rare tail
// (~2% one-sided at the very bottom) rather than a flat 1-in-range chance.
function randomAdultAge(stage: RaceLifeStage, rng: () => number): number {
  const low = Math.min(stage.adulthood, stage.oldAge)
  const high = Math.max(stage.adulthood, stage.oldAge)
  const range = high - low
  if (range <= 0) return low
  const mean = low + range * 0.4
  const sd = Math.max(1, range * 0.2)
  const raw = Math.round(mean + sd * normalRandom(rng))
  return Math.min(high, Math.max(low, raw))
}

/** General population spans the full lifespan — weighted toward a believable population pyramid (child/young-adult/adult/elder buckets) rather than flat-uniform 0..maxAge, which would make "half the town is over 40" for a human settlement. */
function randomLifespanAge(stage: RaceLifeStage, rng: () => number): number {
  const adulthood = Math.max(0, stage.adulthood)
  const oldAge = Math.max(adulthood, stage.oldAge)
  const maxAge = Math.max(oldAge, stage.maxAge)
  const midAdult = Math.round((adulthood + oldAge) / 2)

  const buckets: { min: number; max: number; percent: number }[] = [
    { min: 0, max: Math.max(0, adulthood - 1), percent: 20 },
    { min: adulthood, max: Math.max(adulthood, midAdult), percent: 30 },
    { min: midAdult, max: Math.max(midAdult, oldAge), percent: 30 },
    { min: oldAge, max: Math.max(oldAge, maxAge), percent: 20 }
  ]
  const bucket = pickByPercent(buckets, rng) ?? buckets[0]
  return randomInt(bucket.min, bucket.max, rng)
}

// -------------------- Family (notables only) --------------------
// See notableRelativeSchema's comment in noteTypes/settlement.ts for why
// this is scoped to notables only. Each notable's family is generated as
// its own self-contained tree — invented people who exist purely as flavor
// on this one notable's record, never independent SettlementResident
// entries elsewhere in the population — which sidesteps the cross-resident
// consistency problem (two separately generated residents both claiming to
// be each other's spouse) that made a settlement-wide relationship graph a
// much bigger undertaking. Bounded to spouse/children/siblings/parents/
// grandparents — no grandchildren, no aunts/uncles/cousins.

const CHILD_COUNT_WEIGHTS: { count: number; percent: number }[] = [
  { count: 0, percent: 30 },
  { count: 1, percent: 30 },
  { count: 2, percent: 25 },
  { count: 3, percent: 15 }
]
const SIBLING_COUNT_WEIGHTS: { count: number; percent: number }[] = [
  { count: 0, percent: 35 },
  { count: 1, percent: 30 },
  { count: 2, percent: 20 },
  { count: 3, percent: 15 }
]

/**
 * Describes what a NotableRelative record IS TO the notable — e.g.
 * relation='parent' renders as "Daughter of {name}" for a Female notable,
 * since the label is the notable's own role relative to that person, not
 * the relative's gender (that only decided which name pool they were drawn
 * from). 'spouse' doesn't need gendering since the label is symmetric.
 */
export function relationLabel(relation: RelationType, ownGender: string): string {
  switch (relation) {
    case 'spouse':
      return 'Married to'
    case 'child':
      return ownGender === 'Female' ? 'Mother of' : ownGender === 'Male' ? 'Father of' : 'Parent of'
    case 'parent':
      return ownGender === 'Female' ? 'Daughter of' : ownGender === 'Male' ? 'Son of' : 'Child of'
    case 'sibling':
      return ownGender === 'Female' ? 'Sister of' : ownGender === 'Male' ? 'Brother of' : 'Sibling of'
    case 'grandparent':
      return ownGender === 'Female' ? 'Granddaughter of' : ownGender === 'Male' ? 'Grandson of' : 'Grandchild of'
  }
}

// A parent/grandparent whose plausible age would exceed their race's max
// lifespan is marked deceased instead of clamped to maxAge — clamping would
// silently make every very-old parent read as exactly the same age, which
// undersells how often a notable's parents (let alone grandparents) have
// realistically already passed on for a longer-lived line of descent.
function relativeAgeOrDeceased(targetAge: number, stage: RaceLifeStage): { age: number; livingStatus: 'alive' | 'deceased' } {
  return targetAge > stage.maxAge ? { age: targetAge, livingStatus: 'deceased' } : { age: targetAge, livingStatus: 'alive' }
}

// The last space-separated word of a generated "First Last" name (or the
// second synthesized word for a phonetic-profile custom race — see
// phoneticNames.ts's generateSyntheticName, which has the same two-word
// shape even though it isn't drawing from a lastNames pool). Treated as a
// stand-in "family name" purely for keeping blood relatives visually
// consistent — not a claim that every race's naming convention has a
// surname in the real-world sense.
function surnameOf(fullName: string): string {
  const parts = fullName.trim().split(' ')
  return parts[parts.length - 1]
}

function withSurname(fullName: string, surname: string): string {
  const parts = fullName.trim().split(' ')
  if (parts.length <= 1) return `${fullName} ${surname}`.trim()
  parts[parts.length - 1] = surname
  return parts.join(' ')
}

/**
 * Race Relations tab — falls back to always-same-race (the exact pre-this-
 * feature behavior) whenever nothing at all has been configured for THIS
 * specific race, not just when the whole table is empty, so a settlement
 * that's only customized one race's relations still gets old behavior for
 * every other race.
 */
function pickSpouseRace(notableRace: string, raceRelations: PairRelation[], rng: () => number): string {
  const relevant = raceRelations.filter((r) => r.a === notableRace || r.b === notableRace)
  if (relevant.length === 0) return notableRace
  const weighted = relevant.map((r) => ({ race: r.a === notableRace ? r.b : r.a, percent: r.percent }))
  return pickByPercent(weighted, rng)?.race ?? notableRace
}

/**
 * Gender Relations tab — falls back to an independent draw from
 * genderDistribution (the exact pre-this-feature behavior: a spouse's
 * gender had no relation to the notable's own at all) whenever nothing's
 * configured for this specific gender, same "only affects what's actually
 * been edited" spirit as pickSpouseRace.
 */
function pickSpouseGender(notableGender: string, genderRelations: PairRelation[], genderDistribution: GenderShare[], rng: () => number): string {
  const relevant = genderRelations.filter((r) => r.a === notableGender || r.b === notableGender)
  if (relevant.length === 0) return pickByPercent(genderDistribution, rng)?.gender ?? 'Male'
  const weighted = relevant.map((r) => ({ gender: r.a === notableGender ? r.b : r.a, percent: r.percent }))
  return pickByPercent(weighted, rng)?.gender ?? notableGender
}

function generateFamily(
  notable: { name: string; race: string; gender: string; age: number },
  raceLifeStages: RaceLifeStage[],
  nameFor: (race: string, gender: string) => string,
  pickGender: () => string,
  raceRelations: PairRelation[],
  genderRelations: PairRelation[],
  genderDistribution: GenderShare[],
  rng: () => number,
  idFactory: () => string
): NotableRelative[] {
  const stage = resolveLifeStage(notable.race, raceLifeStages)
  const familySurname = surnameOf(notable.name)
  const relatives: NotableRelative[] = []

  const addRelative = (
    relation: RelationType,
    age: number,
    livingStatus: 'alive' | 'deceased' = 'alive',
    shareSurname = false,
    overrides: { race?: string; gender?: string } = {}
  ): void => {
    const gender = overrides.gender ?? pickGender()
    const race = overrides.race ?? notable.race
    const rolledName = nameFor(race, gender)
    relatives.push({
      id: idFactory(),
      name: shareSurname ? withSurname(rolledName, familySurname) : rolledName,
      relation,
      gender,
      age: Math.max(0, Math.round(age)),
      race,
      livingStatus
    })
  }

  // Spouse — roughly the notable's own generation, both already adults.
  // Never shares the family surname (married in from a different family),
  // same asymmetry as a real-world "maiden name" convention. Race/gender
  // come from the Race/Gender Relations tables (see pickSpouseRace/
  // pickSpouseGender's own fallback behavior when unconfigured) — captured
  // in spouseRace so children below can inherit from either parent.
  let spouseRace: string | null = null
  if (rng() < 0.6) {
    spouseRace = pickSpouseRace(notable.race, raceRelations, rng)
    const spouseGender = pickSpouseGender(notable.gender, genderRelations, genderDistribution, rng)
    addRelative('spouse', Math.max(stage.adulthood, notable.age + randomInt(-10, 10, rng)), 'alive', false, {
      race: spouseRace,
      gender: spouseGender
    })
  }

  // Children — each at least stage.adulthood years younger than the
  // notable, i.e. the notable was already an adult when they were born.
  // Always share the family surname — a child not carrying their own
  // parent's household name would be the unusual case, not the default.
  // Race: a coin flip between the two parents when they differ (confirmed
  // with the user — no synthesized "mixed" race id, just inherits one
  // parent's outright), otherwise trivially the notable's own race.
  const childCount = pickByPercent(CHILD_COUNT_WEIGHTS, rng)?.count ?? 0
  for (let i = 0; i < childCount; i++) {
    const childRace = spouseRace && spouseRace !== notable.race && rng() < 0.5 ? spouseRace : notable.race
    addRelative('child', randomInt(0, Math.max(0, notable.age - stage.adulthood), rng), 'alive', true, { race: childRace })
  }

  // Siblings — same rough generation, offset either direction. SOME (not
  // all) share the family surname — full siblings usually would, but never
  // forcing every single one leaves room for half-siblings/blended-family
  // flavor without modeling that explicitly.
  const siblingCount = pickByPercent(SIBLING_COUNT_WEIGHTS, rng)?.count ?? 0
  for (let i = 0; i < siblingCount; i++) {
    addRelative('sibling', Math.max(0, notable.age + randomInt(-15, 15, rng)), 'alive', rng() < 0.65)
  }

  // Parents — each old enough to have had the notable as an adult
  // themselves; frequently deceased for an older notable, which is
  // realistic rather than a bug (see relativeAgeOrDeceased). AT LEAST ONE
  // parent (whichever is generated first) always shares the family
  // surname — a second parent, if generated, has a smaller independent
  // chance of sharing it too, rather than it being guaranteed for both.
  let parentShared = false
  for (let i = 0; i < 2; i++) {
    if (rng() >= 0.85) continue
    const gap = randomInt(stage.adulthood, stage.adulthood + 25, rng)
    const { age, livingStatus } = relativeAgeOrDeceased(notable.age + gap, stage)
    const shareSurname = !parentShared || rng() < 0.3
    if (shareSurname) parentShared = true
    addRelative('parent', age, livingStatus, shareSurname)
  }

  // Grandparents — one more generation back, almost always deceased by the
  // time a notable is old enough to run a business. Same "at least one
  // shares" rule as parents.
  let grandparentShared = false
  const grandparentCount = randomInt(0, 2, rng)
  for (let i = 0; i < grandparentCount; i++) {
    const gap = randomInt(2 * stage.adulthood, 2 * stage.adulthood + 40, rng)
    const { age, livingStatus } = relativeAgeOrDeceased(notable.age + gap, stage)
    const shareSurname = !grandparentShared || rng() < 0.3
    if (shareSurname) grandparentShared = true
    addRelative('grandparent', age, livingStatus, shareSurname)
  }

  return relatives
}

export interface GenerationOptions {
  population: number
  // Defaults to inferSizeId(population) when omitted — only needed
  // explicitly when a caller wants the size label itself to drive gating
  // independent of the exact population number (e.g. a hand-typed
  // population that's a bit outside its chosen preset's range).
  sizeId?: string
  districts: District[]
  raceDistribution: RaceShare[]
  customRaces?: CustomRaceDef[]
  inspirationSources?: NameBank[]
  // Defaults to PHONETIC_PROFILES when omitted — a custom race's
  // phoneticProfileIds look themselves up in here.
  phoneticProfiles?: PhoneticProfile[]
  wealthTiers: WealthTier[]
  religionDistribution: ReligionShare[]
  // Defaults to defaultGenderDistribution() when omitted (Male 47/Female
  // 47/Non-binary 5/Agender 1) — the pre-this-field hardcoded behavior used
  // Male/Female/Nonbinary 47/47/6, close enough that no existing test
  // asserting on gender-mix shape should need to change.
  genderDistribution?: GenderShare[]
  // Race Relations / Gender Relations tabs — see pickSpouseRace/
  // pickSpouseGender for the fallback behavior (matching this app's
  // pre-these-fields behavior) when omitted/empty.
  raceRelations?: PairRelation[]
  genderRelations?: PairRelation[]
  buildingTypes: BuildingTypeDef[]
  specialties?: SpecialtyDef[]
  activeSpecialtyIds?: string[]
  // Defaults to [] when omitted, which makes resolveLifeStage fall straight
  // to its hardcoded human default for every race.
  raceLifeStages?: RaceLifeStage[]
  // Worshippers tab — see settlementFrontmatterSchema's own comments for
  // what each of these means. Both default to the pre-these-fields
  // behavior (every religious building type competes at its normal weight;
  // every resident gets some religion) when omitted, for backward
  // compatibility with callers/tests that predate this section.
  religiousWorkerMultiplier?: number
  religiousPracticePercent?: number
  // Education tab.
  customEducation?: boolean
  educatedWealthTierIds?: string[]
  // Factions tab — see customFactionDefSchema/factionSchema's comments in
  // noteTypes/settlement.ts. All default to "no factions at all" when
  // omitted (empty customFactions, randomFactionCount 0 falls out of
  // Math.min(0, pool.length) below), for backward compatibility with
  // callers/tests that predate this section.
  customFactions?: CustomFactionDef[]
  useRandomFactionDefaults?: boolean
  randomFactionCount?: number
  randomFactionMaxMembers?: number
}

export interface ExistingSettlementData {
  buildings: SettlementBuilding[]
  residents: SettlementResident[]
}

export interface GeneratedSettlementData {
  buildings: SettlementBuilding[]
  residents: SettlementResident[]
  factions: Faction[]
}

/**
 * Generates a fresh set of buildings/residents for a settlement and merges
 * them with any already-PROMOTED records from `existing` (a building/
 * resident with `linkedNoteTitle` set is a real npc/location note now —
 * regeneration must never overwrite or duplicate it). Everything else in
 * `existing` is discarded and regenerated from scratch; `options.population`
 * describes the size of that freshly-generated portion, not the promoted
 * portion on top of it. `rng`/`idFactory` are injectable for deterministic
 * tests, same pattern as dice.ts's rollDice and initiative.ts's
 * buildCombatants.
 */
export function generateSettlement(
  options: GenerationOptions,
  existing: ExistingSettlementData = { buildings: [], residents: [] },
  rng: () => number = Math.random,
  idFactory: () => string = () => crypto.randomUUID()
): GeneratedSettlementData {
  const keptBuildings = existing.buildings.filter((b) => b.linkedNoteTitle)
  const keptResidents = existing.residents.filter((r) => r.linkedNoteTitle)

  const districts = options.districts.length > 0 ? options.districts : [{ id: 'main', name: 'Main District', buildingTypeBoosts: [] }]
  const wealthTiers = options.wealthTiers
  const customRaces = options.customRaces ?? []
  const inspirationSources = options.inspirationSources ?? []
  const phoneticProfiles = options.phoneticProfiles ?? PHONETIC_PROFILES
  // sizeId is inferred from the NOMINAL population (the user's actual size
  // choice), not the jittered one below — a Metropolis-gated pick should
  // always gate building types like a Metropolis regardless of which side
  // of the average the jitter happens to land on. options.sizeId may be a
  // preset id (e.g. "big-town") rather than an already-canonical gating
  // tier — resolveGatingSizeId maps it down to the 5 tiers this function
  // actually gates against.
  const sizeId = options.sizeId ? resolveGatingSizeId(options.sizeId) : inferSizeId(options.population)
  const population = jitterPopulation(options.population, rng)
  const specialties = options.specialties ?? []
  const activeSpecialtyIds = options.activeSpecialtyIds ?? []
  const raceLifeStages = options.raceLifeStages ?? []
  const genderDistribution: GenderShare[] =
    options.genderDistribution && options.genderDistribution.length > 0 ? options.genderDistribution : defaultGenderDistribution()
  // Race Relations / Gender Relations tabs — see pickSpouseRace/
  // pickSpouseGender's own fallback behavior when empty/unconfigured.
  const raceRelations = options.raceRelations ?? []
  const genderRelations = options.genderRelations ?? []
  // Worshippers tab — see GenerationOptions' own comments.
  const religiousWorkerMultiplier = options.religiousWorkerMultiplier ?? 1
  const religiousPracticeFraction = (options.religiousPracticePercent ?? 100) / 100
  const educatedTierIds = resolveEducatedWealthTierIds(wealthTiers, options.customEducation ?? false, options.educatedWealthTierIds ?? [])

  const effectiveWeight = (type: BuildingTypeDef): number =>
    type.weight *
    sizeGateMultiplier(sizeId, type.minSizeId) *
    specialtyMultiplier(type.id, specialties, activeSpecialtyIds) *
    (type.category === 'religious' ? religiousWorkerMultiplier : 1)

  let districtCursor = 0
  const nextDistrictId = (): string => {
    const district = districts[districtCursor % districts.length]
    districtCursor++
    return district.id
  }

  // Weights every district's odds of getting THIS specific building type by
  // its buildingTypeBoosts (see districtSchema) — a district themed toward
  // temples should get MOST of them, not ALL, so every district still
  // starts from a baseline weight of 1 (round-robin-equivalent) and a
  // matching boost multiplies on top, same "soft bias, never a hard
  // exclusion" shape as sizeGateMultiplier/specialtyMultiplier above. A
  // district with no matching boost is exactly as likely as any other
  // unboosted district, which is the round-robin-shaped fallback the design
  // doc asked for, just expressed as weighted-random (consistent with every
  // other pick in this generator) instead of a literal alternating cursor.
  const pickDistrictIdForBuildingType = (buildingTypeId: string): string => {
    const weights = districts.map((d) => (d.buildingTypeBoosts ?? []).find((b) => b.buildingTypeId === buildingTypeId)?.multiplier ?? 1)
    const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
    if (total <= 0) return nextDistrictId()
    let roll = rng() * total
    for (let i = 0; i < districts.length; i++) {
      roll -= Math.max(0, weights[i])
      if (roll <= 0) return districts[i].id
    }
    return districts[districts.length - 1].id
  }

  const pickWealthTierId = (): string => pickByPercent(wealthTiers, rng)?.id ?? ''
  const pickRace = (): string => pickByPercent(options.raceDistribution, rng)?.race ?? 'human'
  // religiousPracticeFraction gates whether this resident practices ANY
  // religion at all — religionDistribution's own percentages only describe
  // the split among practitioners, not the whole population (see
  // GenerationOptions' comment). '' (no religion) reuses the same "empty
  // string = none" convention buildPromotedNpcFrontmatter already relies on.
  const pickReligion = (): string => (rng() < religiousPracticeFraction ? (pickByPercent(options.religionDistribution, rng)?.religion ?? '') : '')
  const pickGender = (): string => pickByPercent(genderDistribution, rng)?.gender ?? 'Male'
  const isEducated = (wealthTierId: string): boolean => educatedTierIds.has(wealthTierId)
  // A custom race with phoneticProfileIds set is synthesized from tagged
  // syllables (see phoneticNames.ts) instead of picking from a name-list
  // pool — checked first, per CustomRaceDef's "either/or, not both" design.
  // Multiple selected profiles: each NAME picks one profile at random from
  // the set (not a blend) so every individual name stays internally
  // consistent while the race's population as a whole shows a mix.
  const nameFor = (race: string, gender: string): string => {
    const customRace = customRaces.find((r) => r.id === race)
    const matchingProfiles = phoneticProfiles.filter((p) => customRace?.phoneticProfileIds.includes(p.id))
    const profile = matchingProfiles.length > 0 ? matchingProfiles[Math.floor(rng() * matchingProfiles.length)] : undefined
    if (profile) return generateSyntheticName(profile, rng)
    return generateName(resolveNameBank(race, customRaces, inspirationSources), gender, rng)
  }

  const residenceTypes = options.buildingTypes.filter((t) => t.category === 'residence')
  const staffedTypes = options.buildingTypes.filter((t) => t.category !== 'residence')

  const buildings: SettlementBuilding[] = []
  const instanceCountByTypeId = new Map<string, number>()
  const buildOneBuilding = (buildingType: BuildingTypeDef, wealthTierId: string): void => {
    const instanceNumber = (instanceCountByTypeId.get(buildingType.id) ?? 0) + 1
    instanceCountByTypeId.set(buildingType.id, instanceNumber)
    buildings.push({
      id: idFactory(),
      name: buildingType.id, // placeholder, fixed up to include the count below once every instance of this type is known
      buildingTypeId: buildingType.id,
      inventory: buildInventory(buildingType, sizeId, rng),
      wealthTierId,
      districtId: pickDistrictIdForBuildingType(buildingType.id),
      linkedNoteTitle: null
    })
  }

  // Residences are allocated in two passes so a settlement's wealth-tier
  // percentages (the population's actual class/lifestyle makeup — see
  // noteTypes/settlement.ts's WealthTier) genuinely drive the outcome,
  // rather than being overridden by each building type's own
  // defaultWealthTierId as before: first split the household budget across
  // wealth tiers by their percent, THEN pick which residence type (house,
  // manor, tenement, farmstead, ...) fills each tier's slots by weight —
  // preferring types whose defaultWealthTierId matches that tier, falling
  // back to every residence type if none match.
  const targetResidenceCount = Math.max(1, Math.ceil(population / AVG_HOUSEHOLD_SIZE))
  if (residenceTypes.length > 0) {
    const tierBudgets =
      wealthTiers.length > 0
        ? allocateByWeight(targetResidenceCount, wealthTiers.map((t) => Math.max(0, t.percent)))
        : []
    wealthTiers.forEach((tier, tierIndex) => {
      const matchingTypes = residenceTypes.filter((t) => t.defaultWealthTierId === tier.id)
      const pool = matchingTypes.length > 0 ? matchingTypes : residenceTypes
      const poolCounts = allocateByWeight(tierBudgets[tierIndex], pool.map(effectiveWeight))
      pool.forEach((type, i) => {
        for (let n = 0; n < poolCounts[i]; n++) buildOneBuilding(type, tier.id)
      })
    })
    // No wealth tiers configured at all — fall back to plain weighted
    // allocation across residence types with no tier assigned.
    if (wealthTiers.length === 0) {
      const counts = allocateByWeight(targetResidenceCount, residenceTypes.map(effectiveWeight))
      residenceTypes.forEach((type, i) => {
        for (let n = 0; n < counts[i]; n++) buildOneBuilding(type, '')
      })
    }
  }

  const staffedBudget = Math.max(1, Math.round(population / POPULATION_PER_STAFFED_BUILDING))
  const staffedCounts = allocateByWeight(staffedBudget, staffedTypes.map(effectiveWeight))
  staffedTypes.forEach((type, i) => {
    const wealthTierId = wealthTiers.some((t) => t.id === type.defaultWealthTierId) ? type.defaultWealthTierId : pickWealthTierId()
    // maxInstances is a hard cap (unlike every other soft gate in this
    // engine) — some building types are singular by nature (a settlement
    // has exactly one Town Hall), not just less common. The budget "lost"
    // to a capped type simply isn't redistributed elsewhere; a slightly
    // smaller total staffed-building count is a fine tradeoff for never
    // generating seventeen Town Halls.
    let count = type.maxInstances != null ? Math.min(staffedCounts[i], type.maxInstances) : staffedCounts[i]
    // maxSharePercent is the same "don't redistribute, just drop the
    // overflow" tradeoff, but as a percent of the whole staffed budget
    // instead of a fixed count — so a weight cranked way up can still tilt
    // generation hard toward a type without that type running away to
    // dominate the settlement (e.g. a "religious city" bumping Temple's
    // weight shouldn't be able to make Temple count exceed some sane share
    // of all staffed buildings, no matter how high the weight goes).
    if (type.maxSharePercent != null) {
      count = Math.min(count, Math.floor((staffedBudget * type.maxSharePercent) / 100))
    }
    for (let n = 0; n < count; n++) buildOneBuilding(type, wealthTierId)
  })

  // Fix up names now that every instance of each type has been created, so
  // numbering ("House 1", "House 2", ...) is correct even though residence
  // types can be built across more than one wealth-tier pass above.
  const typeNameById = new Map(options.buildingTypes.map((t) => [t.id, t.name]))
  const seenSoFar = new Map<string, number>()
  for (const building of buildings) {
    const total = instanceCountByTypeId.get(building.buildingTypeId) ?? 1
    const index = (seenSoFar.get(building.buildingTypeId) ?? 0) + 1
    seenSoFar.set(building.buildingTypeId, index)
    const name = typeNameById.get(building.buildingTypeId) ?? building.buildingTypeId
    building.name = total > 1 ? `${name} ${index}` : name
  }

  const residenceBuildings = buildings.filter((b) => residenceTypes.some((t) => t.id === b.buildingTypeId))
  const staffedBuildingTypeById = new Map(staffedTypes.map((t) => [t.id, t]))
  const staffedBuildings = buildings.filter((b) => staffedBuildingTypeById.get(b.buildingTypeId)?.staffed)
  // Lowest wealth tier by list position — same "list order = rank"
  // convention the People/Buildings tabs already rely on for wealth-tier
  // sorting (see wealthTierRankById in those files).
  const lowestWealthTierId = wealthTiers.length > 0 ? wealthTiers[wealthTiers.length - 1].id : ''

  const residents: SettlementResident[] = []

  // One full notable per staffed building instance — the scope lever that
  // keeps a large settlement's generation effort bounded (see
  // noteTypes/settlement.ts's BuildingTypeDef.staffed comment).
  for (const building of buildings) {
    const buildingType = staffedBuildingTypeById.get(building.buildingTypeId)
    if (!buildingType?.staffed) continue
    const race = pickRace()
    const gender = pickGender()
    const age = randomAdultAge(resolveLifeStage(race, raceLifeStages), rng)
    const name = nameFor(race, gender)
    residents.push({
      id: idFactory(),
      name,
      race,
      age,
      gender,
      professionBuildingId: building.id,
      // A notable definitionally runs the place they're staffed at (see
      // BuildingTypeDef.staffed) — the building type's own notableTitle
      // ("Mayor" for a Town Hall, "High Priest" for a Temple, ...), falling
      // back to "Owner" for the common case of an actual commercial shop.
      jobTitle: buildingType.notableTitle ?? 'Owner',
      employmentStatus: 'employed',
      homeless: false,
      homeBuildingId: null,
      wealthTierId: building.wealthTierId,
      districtId: building.districtId,
      religion: pickReligion(),
      notable: true,
      flavorTag: '',
      personalityLine: generatePersonalityLine(rng),
      goal: generateGoal(rng),
      stats: rollAbilityScores(buildingType, rng),
      proficiencies: pickProficiencies(buildingType, rng),
      appearance: generateAppearance(race, gender, rng, customRaces),
      relatives: generateFamily(
        { name, race, gender, age },
        raceLifeStages,
        nameFor,
        pickGender,
        raceRelations,
        genderRelations,
        genderDistribution,
        rng,
        idFactory
      ),
      educated: isEducated(building.wealthTierId),
      linkedNoteTitle: null
    })
  }

  // Remaining population fills as cheap stub residents, grouped a few per
  // residence building. If population outpaces total residence capacity
  // (e.g. wealth-tier/building-type editing left too few residences), the
  // overflow still gets generated but with no homeBuildingId — an honest
  // signal to add more residences rather than silently dropping people.
  const notableCount = residents.length
  const remainingPopulation = Math.max(0, population - notableCount)
  let homeCursor = 0
  // Returns the building itself, not just its id — the old version returned
  // only the id and then immediately did `residenceBuildings.find(b => b.id
  // === homeBuildingId)` to look the same building back up, an O(residents ×
  // residenceBuildings) re-scan for information this function already had in
  // hand before it returned.
  const nextHomeBuilding = (occupantIndex: number): SettlementBuilding | null => {
    if (residenceBuildings.length === 0) return null
    if (occupantIndex >= residenceBuildings.length * AVG_HOUSEHOLD_SIZE) return null
    const home = residenceBuildings[homeCursor % residenceBuildings.length]
    homeCursor++
    return home
  }

  for (let i = 0; i < remainingPopulation; i++) {
    const race = pickRace()
    const gender = pickGender()
    const lifeStage = resolveLifeStage(race, raceLifeStages)
    const age = randomLifespanAge(lifeStage, rng)
    const home = nextHomeBuilding(i)
    const homeBuildingId = home?.id ?? null
    const wealthTierId = home?.wealthTierId ?? pickWealthTierId()

    const employed = staffedBuildings.length > 0 && rng() < employmentProbability(age, lifeStage)
    const workplace = employed ? staffedBuildings[Math.floor(rng() * staffedBuildings.length)] : undefined
    const professionBuildingId = workplace?.id ?? null
    const jobTitle = workplace ? pickJobTitle(staffedBuildingTypeById.get(workplace.buildingTypeId), rng) : ''

    // Homelessness only rolled for unemployed adults already in the
    // lowest wealth tier — see HOMELESS_RATE's comment. A homeless
    // resident's homeBuildingId is forced null even if nextHomeBuildingId
    // assigned one, since "homeless" should mean homeless.
    const isAdult = age >= lifeStage.adulthood
    const homeless = !employed && isAdult && wealthTierId === lowestWealthTierId && rng() < HOMELESS_RATE

    residents.push({
      id: idFactory(),
      name: nameFor(race, gender),
      race,
      age,
      gender,
      professionBuildingId,
      jobTitle,
      employmentStatus: employed ? 'employed' : 'unemployed',
      homeless,
      homeBuildingId: homeless ? null : homeBuildingId,
      wealthTierId,
      districtId: home?.districtId ?? nextDistrictId(),
      religion: pickReligion(),
      notable: false,
      flavorTag: generateFlavorTag(rng),
      personalityLine: '',
      goal: '',
      stats: null,
      proficiencies: [],
      appearance: '',
      relatives: [],
      educated: isEducated(wealthTierId),
      linkedNoteTitle: null
    })
  }

  const factions = generateFactions(
    options.customFactions ?? [],
    options.useRandomFactionDefaults ?? true,
    options.randomFactionCount ?? 0,
    options.randomFactionMaxMembers ?? 50,
    population,
    rng,
    idFactory
  )

  return {
    buildings: [...keptBuildings, ...buildings],
    residents: [...keptResidents, ...residents],
    factions
  }
}
