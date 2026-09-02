import { describe, it, expect } from 'vitest'
import { generateCityDistricts, type CityDistrictGenerationParams } from '../src/lib/mapGeneration/districts'
import { polygonArea } from '../src/lib/mapGeneration/contour'
import { pointInPolygon, polygonCentroid, type Point } from '../src/lib/mapGeometry'

// A plain rectangular footprint is enough for these tests — the district
// pipeline doesn't care how organic the boundary is, only that it's a
// polygon to carve up.
const BOUNDARY: Point[] = [
  { x: 40, y: 40 },
  { x: 960, y: 40 },
  { x: 960, y: 760 },
  { x: 40, y: 760 }
]
const BOUNDARY_AREA = polygonArea(BOUNDARY)

const base: CityDistrictGenerationParams = {
  seed: 7,
  widthPixels: 1000,
  heightPixels: 800,
  boundaryMask: BOUNDARY,
  districts: [
    { id: 'market', name: 'Market District' },
    { id: 'residential', name: 'Residential District' },
    { id: 'temple', name: 'Temple District' },
    { id: 'docks', name: 'Docks District' }
  ],
  gatingSizeId: 'city'
}

function isSimplePolygon(points: Point[]): boolean {
  const n = points.length
  const d = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const cross = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
    const d1 = d(p3, p4, p1)
    const d2 = d(p3, p4, p2)
    const d3 = d(p1, p2, p3)
    const d4 = d(p1, p2, p4)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === (i + 1) % n || i === (j + 1) % n) continue
      if (cross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false
    }
  }
  return true
}

describe('generateCityDistricts', () => {
  it('is deterministic for the same params', () => {
    expect(generateCityDistricts(base)).toEqual(generateCityDistricts({ ...base }))
  })

  it('returns exactly one polygon per input district, matched by id and in order', () => {
    const result = generateCityDistricts(base)
    expect(result.map((r) => r.id)).toEqual(['market', 'residential', 'temple', 'docks'])
    for (const r of result) {
      expect(r.points.length).toBeGreaterThanOrEqual(3)
      expect(isSimplePolygon(r.points)).toBe(true)
      expect(polygonArea(r.points)).toBeGreaterThan(0)
    }
  })

  it('keeps every district within the city boundary (to grid resolution)', () => {
    // The boundaries are grid-traced, so a district hugging the city edge
    // sits a cell or two proud of the exact polygon — same ± one cell
    // property every other traced layer (landmasses, territories) has. The
    // meaningful checks: the centroid is well inside, and no vertex strays
    // more than a couple of cells past the city's bounding box.
    const slack = 2 * ((BOUNDARY[1].x - BOUNDARY[0].x) / 84)
    for (const r of generateCityDistricts(base)) {
      expect(pointInPolygon(polygonCentroid(r.points), BOUNDARY)).toBe(true)
      for (const p of r.points) {
        expect(p.x).toBeGreaterThanOrEqual(BOUNDARY[0].x - slack)
        expect(p.x).toBeLessThanOrEqual(BOUNDARY[1].x + slack)
        expect(p.y).toBeGreaterThanOrEqual(BOUNDARY[0].y - slack)
        expect(p.y).toBeLessThanOrEqual(BOUNDARY[2].y + slack)
      }
    }
  })

  it('carves the city into districts that roughly tile it without huge overlap', () => {
    const result = generateCityDistricts(base)
    const total = result.reduce((sum, r) => sum + polygonArea(r.points), 0)
    // Flood-fill covers every in-boundary cell exactly once, so the traced
    // polygons should sum to close to the whole city area.
    expect(total).toBeGreaterThan(BOUNDARY_AREA * 0.8)
    expect(total).toBeLessThan(BOUNDARY_AREA * 1.15)
  })

  it('seeds a docks district toward a supplied water hint', () => {
    // Water hint hard against the right edge; a plain district with no hint
    // for comparison.
    const params: CityDistrictGenerationParams = {
      ...base,
      districts: [
        { id: 'docks', name: 'Docks District' },
        { id: 'residential', name: 'Residential District' }
      ],
      waterHintPoints: [{ x: 955, y: 400 }]
    }
    const result = generateCityDistricts(params)
    const docks = result.find((r) => r.id === 'docks')!
    const residential = result.find((r) => r.id === 'residential')!
    expect(polygonCentroid(docks.points).x).toBeGreaterThan(polygonCentroid(residential.points).x)
  })

  it('gives each district a name-appropriate lot size and street density', () => {
    const result = generateCityDistricts({
      ...base,
      districts: [
        { id: 'noble', name: 'Noble Quarter' },
        { id: 'slum', name: 'The Slums' },
        { id: 'market', name: 'Market District' }
      ]
    })
    const byId = Object.fromEntries(result.map((r) => [r.id, r]))
    // Big lots + sparse wide streets for the nobility; the opposite for the slum.
    expect(byId.noble.targetLotAreaPixels).toBeGreaterThan(byId.market.targetLotAreaPixels)
    expect(byId.market.targetLotAreaPixels).toBeGreaterThan(byId.slum.targetLotAreaPixels)
    expect(byId.slum.streetDensity).toBeGreaterThan(byId.market.streetDensity)
    expect(byId.market.streetDensity).toBeGreaterThan(byId.noble.streetDensity)
    for (const r of result) {
      expect(r.streetDensity).toBeGreaterThanOrEqual(0)
      expect(r.streetDensity).toBeLessThanOrEqual(1)
    }
  })

  it('packs lots tighter as the settlement size tier grows', () => {
    const districts = [{ id: 'residential', name: 'Residential District' }]
    const hamlet = generateCityDistricts({ ...base, districts, gatingSizeId: 'hamlet' })[0]
    const metropolis = generateCityDistricts({ ...base, districts, gatingSizeId: 'metropolis' })[0]
    expect(metropolis.targetLotAreaPixels).toBeLessThan(hamlet.targetLotAreaPixels)
    expect(metropolis.streetDensity).toBeGreaterThan(hamlet.streetDensity)
  })

  it('handles a single district as the whole city interior', () => {
    const result = generateCityDistricts({ ...base, districts: [{ id: 'only', name: 'Village Center' }] })
    expect(result).toHaveLength(1)
    expect(polygonArea(result[0].points)).toBeGreaterThan(BOUNDARY_AREA * 0.75)
  })

  it('returns nothing for no districts or a degenerate boundary', () => {
    expect(generateCityDistricts({ ...base, districts: [] })).toEqual([])
    expect(generateCityDistricts({ ...base, boundaryMask: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toEqual([])
  })
})
