import { describe, it, expect } from 'vitest'
import { generateStreets, traceBlocks, type StreetGenerationParams } from '../src/lib/mapGeneration/streets'
import { generateCityBoundary } from '../src/lib/mapGeneration/cityBoundary'
import { generateCityDistricts } from '../src/lib/mapGeneration/districts'
import { polygonArea } from '../src/lib/mapGeneration/contour'
import { pointInPolygon, polygonCentroid, type Point } from '../src/lib/mapGeometry'

const CANVAS = { widthPixels: 1400, heightPixels: 1100 }
const BOUNDARY = generateCityBoundary({ seed: 11, ...CANVAS, boundaryIrregularity: 0.45 }).points
const DISTRICTS = generateCityDistricts({
  seed: 11,
  ...CANVAS,
  boundaryMask: BOUNDARY,
  districts: [
    { id: 'market', name: 'Market District' },
    { id: 'craft', name: 'Craft District' },
    { id: 'noble', name: 'Noble Quarter' },
    { id: 'residential', name: 'Residential District' }
  ],
  gatingSizeId: 'city'
}).map((d) => ({ id: d.id, points: d.points, streetDensity: d.streetDensity }))

const base: StreetGenerationParams = {
  seed: 11,
  ...CANVAS,
  boundaryMask: BOUNDARY,
  districts: DISTRICTS,
  entryPoints: [BOUNDARY[0], BOUNDARY[Math.floor(BOUNDARY.length / 3)], BOUNDARY[Math.floor((2 * BOUNDARY.length) / 3)]],
  gatingSizeId: 'city'
}

// Per-tier hard ceilings (mirrors the module's BUDGETS.maxSegments).
const MAX_SEGMENTS: Record<string, number> = { hamlet: 60, village: 160, town: 380, city: 850, metropolis: 1700 }

function allSegments(streets: { points: Point[] }[]): [Point, Point][] {
  const segs: [Point, Point][] = []
  for (const s of streets) for (let i = 1; i < s.points.length; i++) segs.push([s.points[i - 1], s.points[i]])
  return segs
}

function properlyCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return false
  const dx = b1.x - a1.x
  const dy = b1.y - a1.y
  const t = (dx * d2y - dy * d2x) / denom
  const u = (dx * d1y - dy * d1x) / denom
  const e = 1e-6
  return t > e && t < 1 - e && u > e && u < 1 - e
}

function isSimplePolygon(points: Point[]): boolean {
  const n = points.length
  const orient = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const cross = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
    const d1 = orient(p3, p4, p1)
    const d2 = orient(p3, p4, p2)
    const d3 = orient(p1, p2, p3)
    const d4 = orient(p1, p2, p4)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === (i + 1) % n || i === (j + 1) % n) continue
      if (cross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false
    }
  return true
}

describe('generateStreets', () => {
  it('is deterministic for the same params', () => {
    const a = generateStreets(base)
    const b = generateStreets({ ...base })
    expect(a.streets.map((s) => s.points)).toEqual(b.streets.map((s) => s.points))
    expect(a.streets.map((s) => s.name)).toEqual(b.streets.map((s) => s.name))
  })

  it('terminates within the size tier’s hard segment budget', () => {
    for (const tier of ['hamlet', 'village', 'town', 'city', 'metropolis']) {
      const { streets } = generateStreets({ ...base, gatingSizeId: tier })
      const segCount = allSegments(streets).length
      expect(segCount).toBeGreaterThan(0)
      expect(segCount).toBeLessThanOrEqual(MAX_SEGMENTS[tier])
    }
  })

  it('a bigger settlement gets a denser network', () => {
    const hamlet = allSegments(generateStreets({ ...base, gatingSizeId: 'hamlet' }).streets).length
    const city = allSegments(generateStreets({ ...base, gatingSizeId: 'city' }).streets).length
    expect(city).toBeGreaterThan(hamlet * 2)
  })

  it('never places a street point outside the city boundary', () => {
    for (const s of generateStreets(base).streets) {
      for (const p of s.points) {
        // A hair of tolerance for float error at a clipped boundary hit.
        expect(pointInPolygon(p, BOUNDARY) || nearBoundary(p, BOUNDARY, 1.5)).toBe(true)
      }
    }
  })

  it('contains no two street segments that cross without a node at the crossing', () => {
    const segs = allSegments(generateStreets(base).streets)
    let crossings = 0
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        if (properlyCross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) crossings++
      }
    expect(crossings).toBe(0)
  })

  it('names every spine and leaves only short stubs unnamed', () => {
    const { streets } = generateStreets(base)
    const spines = streets.filter((s) => s.isSpine)
    expect(spines.length).toBeGreaterThan(0)
    for (const spine of spines) expect(spine.name).toBeTruthy()
    // The bulk of non-stub secondary streets are named too.
    const secondary = streets.filter((s) => !s.isSpine)
    const named = secondary.filter((s) => s.name).length
    expect(named).toBeGreaterThan(secondary.length * 0.4)
  })

  it('grows spines inward toward the anchor', () => {
    const anchor = { x: CANVAS.widthPixels / 2, y: CANVAS.heightPixels / 2 }
    const { streets } = generateStreets({ ...base, anchor })
    for (const spine of streets.filter((s) => s.isSpine)) {
      const start = spine.points[0]
      const end = spine.points[spine.points.length - 1]
      // The spine ends up closer to the anchor than it started.
      expect(Math.hypot(end.x - anchor.x, end.y - anchor.y)).toBeLessThan(Math.hypot(start.x - anchor.x, start.y - anchor.y))
    }
  })

  it('fans spines out from the anchor when there are no external roads', () => {
    const { streets } = generateStreets({ ...base, entryPoints: [] })
    const spines = streets.filter((s) => s.isSpine)
    expect(spines.length).toBe(4)
    // Their outward bearings from the shared start point are spread around
    // the compass, not bunched.
    const bearings = spines.map((s) => Math.atan2(s.points[1].y - s.points[0].y, s.points[1].x - s.points[0].x))
    const spread = Math.max(...bearings) - Math.min(...bearings)
    expect(spread).toBeGreaterThan(Math.PI)
  })

  it('returns blocks that are all valid, simple, in-bounds polygons', () => {
    const { blocks } = generateStreets(base)
    expect(blocks.length).toBeGreaterThan(3)
    const cityArea = polygonArea(BOUNDARY)
    let total = 0
    for (const block of blocks) {
      expect(block.length).toBeGreaterThanOrEqual(3)
      expect(isSimplePolygon(block)).toBe(true)
      expect(polygonArea(block)).toBeGreaterThan(0)
      expect(pointInPolygon(polygonCentroid(block), BOUNDARY)).toBe(true)
      total += polygonArea(block)
    }
    // Blocks tile the parts of the city the streets don't occupy — less
    // than the whole, but a substantial majority of it.
    expect(total).toBeLessThan(cityArea)
    expect(total).toBeGreaterThan(cityArea * 0.3)
  })

  it('traceBlocks is exposed for Phase 7.4 to re-derive blocks from stored streets', () => {
    const { streets } = generateStreets(base)
    const blocks = traceBlocks(
      streets.map((s) => s.points),
      BOUNDARY,
      CANVAS.widthPixels,
      CANVAS.heightPixels
    )
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) expect(isSimplePolygon(b)).toBe(true)
  })

  it('returns nothing for a degenerate boundary', () => {
    expect(generateStreets({ ...base, boundaryMask: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toEqual({ streets: [], blocks: [] })
  })
})

function nearBoundary(p: Point, polygon: Point[], tol: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
    const cx = a.x + t * abx
    const cy = a.y + t * aby
    if (Math.hypot(p.x - cx, p.y - cy) <= tol) return true
  }
  return false
}
