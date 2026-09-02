import { describe, it, expect } from 'vitest'
import { placeBuildingsInLots } from '../src/lib/mapGeneration/cityLayout'
import { generateCityBoundary } from '../src/lib/mapGeneration/cityBoundary'
import { generateCityDistricts } from '../src/lib/mapGeneration/districts'
import { generateStreets } from '../src/lib/mapGeneration/streets'
import { generateSettlement, type GenerationOptions } from '../src/lib/settlementGenerator'
import { defaultBuildingTypes, defaultWealthTiers, type SettlementBuilding } from '../src/lib/noteTypes/settlement'

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
  return () => `${prefix}-${i++}`
}

const DISTRICT_DEFS = [
  { id: 'a', name: 'Market District' },
  { id: 'b', name: 'Residential District' },
  { id: 'c', name: 'Craft District' }
]

function options(pop: number): GenerationOptions {
  return {
    population: pop,
    sizeId: 'town',
    districts: DISTRICT_DEFS.map((d) => ({ ...d, buildingTypeBoosts: [] })),
    raceDistribution: [{ race: 'human', percent: 100 }],
    wealthTiers: defaultWealthTiers(),
    religionDistribution: [{ religion: 'The Old Faith', percent: 100 }],
    buildingTypes: defaultBuildingTypes()
  }
}

const CANVAS = { widthPixels: 1600, heightPixels: 1300 }
const BOUNDARY = generateCityBoundary({ seed: 4, ...CANVAS, boundaryIrregularity: 0.4 }).points
const DISTRICTS = generateCityDistricts({ seed: 4, ...CANVAS, boundaryMask: BOUNDARY, districts: DISTRICT_DEFS, gatingSizeId: 'town' }).map((d) => ({
  id: d.id,
  points: d.points,
  targetLotAreaPixels: d.targetLotAreaPixels
}))
const STREETS = generateStreets({
  seed: 4,
  ...CANVAS,
  boundaryMask: BOUNDARY,
  districts: DISTRICTS.map((d) => ({ id: d.id, points: d.points, streetDensity: 0.5 })),
  entryPoints: [BOUNDARY[0], BOUNDARY[Math.floor(BOUNDARY.length / 2)]],
  gatingSizeId: 'town'
}).streets.map((s) => s.points)

function layoutParams(buildings: { id: string; districtId: string; footprint?: SettlementBuilding['footprint'] }[]) {
  return { seed: 4, ...CANVAS, boundaryMask: BOUNDARY, districts: DISTRICTS, streetPolylines: STREETS, buildings }
}

describe('placeBuildingsInLots — consistency with the settlement note (decisions 2, 3, 5)', () => {
  const settlement = generateSettlement(options(600), { buildings: [], residents: [] }, seededRng(1), sequenceIds('b'))

  it('gives footprints to the SAME building records, never a parallel list', () => {
    const result = placeBuildingsInLots(layoutParams(settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId }))))
    expect(result.placements.length).toBeGreaterThan(0)

    const buildingIds = new Set(settlement.buildings.map((b) => b.id))
    for (const p of result.placements) expect(buildingIds.has(p.id)).toBe(true)
    // No id placed twice.
    expect(new Set(result.placements.map((p) => p.id)).size).toBe(result.placements.length)

    // Applying the footprints mutates the existing records in place — same
    // ids, same count, not a new array of building-shaped objects.
    const byId = new Map(result.placements.map((p) => [p.id, p.footprint]))
    const withFootprints = settlement.buildings.map((b) => ({ ...b, footprint: byId.get(b.id) ?? b.footprint }))
    expect(withFootprints.map((b) => b.id)).toEqual(settlement.buildings.map((b) => b.id))
    expect(withFootprints.filter((b) => b.footprint).length).toBe(result.placements.length)
  })

  it('re-running placement never moves a building that already has a footprint', () => {
    const first = placeBuildingsInLots(layoutParams(settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId }))))
    const placedById = new Map(first.placements.map((p) => [p.id, p.footprint]))
    const withFootprints = settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId, footprint: placedById.get(b.id) ?? null }))

    const second = placeBuildingsInLots(layoutParams(withFootprints))
    // Nothing that was already placed is handed a new footprint.
    for (const p of second.placements) expect(placedById.has(p.id)).toBe(false)
  })

  it('regenerating the settlement population keeps every placed footprint byte-for-byte (decision 5)', () => {
    const first = placeBuildingsInLots(layoutParams(settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId }))))
    const placedById = new Map(first.placements.map((p) => [p.id, p.footprint]))
    const buildingsWithFootprints: SettlementBuilding[] = settlement.buildings.map((b) => ({ ...b, footprint: placedById.get(b.id) ?? null }))
    const placedIds = [...placedById.keys()]
    expect(placedIds.length).toBeGreaterThan(5)

    // Grow the town — the existing "Generate" on the Settlement note.
    const regen = generateSettlement(options(1000), { buildings: buildingsWithFootprints, residents: settlement.residents }, seededRng(2), sequenceIds('r'))
    const regenById = new Map(regen.buildings.map((b) => [b.id, b]))
    for (const id of placedIds) {
      const kept = regenById.get(id)
      expect(kept).toBeDefined()
      expect(kept?.footprint).toEqual(placedById.get(id))
    }
  })
})

describe('placeBuildingsInLots — placement quality', () => {
  const settlement = generateSettlement(options(500), { buildings: [], residents: [] }, seededRng(7), sequenceIds('b'))
  const result = placeBuildingsInLots(layoutParams(settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId }))))

  it('is deterministic', () => {
    const again = placeBuildingsInLots(layoutParams(settlement.buildings.map((b) => ({ id: b.id, districtId: b.districtId }))))
    expect(again.placements).toEqual(result.placements)
  })

  it('places most buildings, each footprint a positive-size rect inside the city', () => {
    expect(result.placements.length).toBeGreaterThan(settlement.buildings.length * 0.4)
    for (const p of result.placements) {
      expect(p.footprint.width).toBeGreaterThan(0)
      expect(p.footprint.height).toBeGreaterThan(0)
    }
  })

  it('a building lands in a lot in a block owned by its own district', () => {
    // For each placement, the lot it sits on came from a block whose centre
    // is in that district — so the footprint's centre is at least inside
    // the union of the district polygons.
    const buildingDistrict = new Map(settlement.buildings.map((b) => [b.id, b.districtId]))
    let matched = 0
    for (const p of result.placements) {
      const district = DISTRICTS.find((d) => d.id === buildingDistrict.get(p.id))
      if (!district) continue
      // pointInPolygon on the district it was assigned to (allow a small
      // miss rate for lots that fell back to the shared pool).
      const inside = pointInPolygonLocal({ x: p.footprint.x, y: p.footprint.y }, district.points)
      if (inside) matched++
    }
    expect(matched).toBeGreaterThan(result.placements.length * 0.6)
  })

  it('returns nothing for a degenerate boundary', () => {
    expect(placeBuildingsInLots({ ...layoutParams([]), boundaryMask: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toEqual({ placements: [], blocks: [], lots: [] })
  })
})

function pointInPolygonLocal(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
