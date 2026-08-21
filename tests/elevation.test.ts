import { describe, it, expect } from 'vitest'
import { computeElevationGrid, generateTerrain } from '../src/lib/mapGeneration/elevation'
import { polygonArea, signedPolygonArea } from '../src/lib/mapGeneration/contour'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('generateTerrain', () => {
  it('is deterministic for the same seed and params', () => {
    const params = { seed: 42, widthPixels: 1000, heightPixels: 1000 }
    const a = generateTerrain(params, idSequence())
    const b = generateTerrain(params, idSequence())
    expect(a.landmasses.map((l) => l.points)).toEqual(b.landmasses.map((l) => l.points))
    expect(a.mountainZones.map((z) => z.points)).toEqual(b.mountainZones.map((z) => z.points))
  })

  it('never emits a hole (lake) as its own phantom landmass or mountain zone', () => {
    // Regression test for a real bug: at a low sea level, a huge fraction
    // of the grid ends up land with large enclosed water pockets (lakes)
    // rather than small ones — before this was fixed, a large enough lake
    // survived the area filter and was emitted as its own landmass shaped
    // exactly like the lake. Every emitted polygon must wind as an outer
    // boundary (positive signed area), never as a hole.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const result = generateTerrain({ seed, widthPixels: 800, heightPixels: 800, seaLevel: 0.4 }, idSequence())
      for (const l of result.landmasses) expect(signedPolygonArea(l.points)).toBeGreaterThan(0)
      for (const z of result.mountainZones) expect(signedPolygonArea(z.points)).toBeGreaterThan(0)
    }
  })

  it('produces different landmass shapes for different seeds', () => {
    const a = generateTerrain({ seed: 1, widthPixels: 1000, heightPixels: 1000 }, idSequence())
    const b = generateTerrain({ seed: 2, widthPixels: 1000, heightPixels: 1000 }, idSequence())
    expect(a.landmasses).not.toEqual(b.landmasses)
  })

  it('every landmass and mountain zone is tagged generated:true', () => {
    const result = generateTerrain({ seed: 5, widthPixels: 1000, heightPixels: 1000 }, idSequence())
    for (const l of result.landmasses) expect(l.generated).toBe(true)
    for (const z of result.mountainZones) expect(z.generated).toBe(true)
  })

  it('a higher sea level produces less total land area', () => {
    const low = generateTerrain({ seed: 8, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3 }, idSequence())
    const high = generateTerrain({ seed: 8, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.7 }, idSequence())
    const totalArea = (r: typeof low) => r.landmasses.reduce((sum, l) => sum + polygonArea(l.points), 0)
    expect(totalArea(high)).toBeLessThan(totalArea(low))
  })

  it('mountain zone vertices only ever fall within (or right at the edge of) a landmass', () => {
    // The underlying grid guarantees isMountainCell(x,y) implies
    // isLandCell(x,y) — but landmasses and mountain zones are each smoothed
    // (Chaikin) independently afterward, so their polygon boundaries don't
    // perfectly nest at the pixel level; a mountain right at the coast can
    // end up a few pixels outside the independently-smoothed landmass
    // outline even though its source cell was land. A generous tolerance
    // (a few grid cells' worth of pixels) checks the real invariant without
    // being fooled by that smoothing drift.
    //
    // Deliberately checks every VERTEX of the mountain polygon, not its
    // averaged centroid — a mountain range traced from noise is often a
    // curved, non-convex band (a ridge line), and a non-convex shape's
    // centroid can legitimately fall outside the shape itself (in a
    // concave notch), which would flag a perfectly correct result as
    // "off-land" for the wrong reason.
    const width = 800
    const height = 800
    const gridResolution = 96 // matches computeElevationGrid's own default
    const tolerancePx = (Math.max(width, height) / gridResolution) * 3
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = generateTerrain({ seed, widthPixels: width, heightPixels: height, mountainDensity: 0.9, mountainRuggedness: 0.9, seaLevel: 0.4 }, idSequence())
      for (const zone of result.mountainZones) {
        for (const vertex of zone.points) {
          const nearAnyLandmass = result.landmasses.some((l) => pointRoughlyInsidePolygon(vertex, l.points) || distanceToPolygon(vertex, l.points) <= tolerancePx)
          expect(nearAnyLandmass).toBe(true)
        }
      }
    }
  })

  it('uses the provided mountainTerrainTypeId', () => {
    const result = generateTerrain(
      { seed: 3, widthPixels: 1000, heightPixels: 1000, mountainDensity: 0.9, mountainRuggedness: 0.9, seaLevel: 0.3, mountainTerrainTypeId: 'custom-peaks' },
      idSequence()
    )
    for (const z of result.mountainZones) expect(z.terrainTypeId).toBe('custom-peaks')
  })

  it('assigns ids via the provided idFactory', () => {
    const result = generateTerrain({ seed: 4, widthPixels: 1000, heightPixels: 1000 }, idSequence())
    for (const l of result.landmasses) expect(l.id).toMatch(/^id-\d+$/)
  })

  it('keeps every polygon point within the canvas bounds', () => {
    const result = generateTerrain({ seed: 6, widthPixels: 600, heightPixels: 400 }, idSequence())
    for (const l of result.landmasses) {
      for (const p of l.points) {
        expect(p.x).toBeGreaterThanOrEqual(-1)
        expect(p.x).toBeLessThanOrEqual(601)
        expect(p.y).toBeGreaterThanOrEqual(-1)
        expect(p.y).toBeLessThanOrEqual(401)
      }
    }
  })

  it('a boundaryMask confines all generated land within it', () => {
    const mask = [
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 500 },
      { x: 100, y: 500 }
    ]
    // Low sea level to guarantee some land would otherwise spill outside
    // the mask if the mask weren't being respected.
    const result = generateTerrain({ seed: 9, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, boundaryMask: mask }, idSequence())
    for (const l of result.landmasses) {
      for (const p of l.points) {
        expect(p.x).toBeGreaterThanOrEqual(90)
        expect(p.x).toBeLessThanOrEqual(510)
        expect(p.y).toBeGreaterThanOrEqual(90)
        expect(p.y).toBeLessThanOrEqual(510)
      }
    }
  })
})

describe('computeElevationGrid edgesAreOcean (world-map mode)', () => {
  it('leaves every existing caller unchanged when omitted (fully additive)', () => {
    const params = { seed: 3, widthPixels: 1000, heightPixels: 1000, mountainDensity: 0.9, mountainRuggedness: 0.9 }
    const withoutField = computeElevationGrid(params)
    const explicitlyOff = computeElevationGrid({ ...params, edgesAreOcean: false })
    expect(explicitlyOff.values).toEqual(withoutField.values)
  })

  it('pulls every canvas edge below a typical sea level, even at high mountain density', () => {
    // mountainDensity/mountainRuggedness cranked up specifically because a
    // hot ridge value is the most likely way an edge cell could otherwise
    // sneak above sea level despite the base noise being masked down.
    for (const seed of [1, 2, 3, 4, 5]) {
      const grid = computeElevationGrid({
        seed,
        widthPixels: 800,
        heightPixels: 800,
        mountainDensity: 1,
        mountainRuggedness: 1,
        edgesAreOcean: true,
        continentCount: 1
      })
      const seaLevel = 0.5
      for (let x = 0; x < grid.cols; x++) {
        expect(grid.values[0][x]).toBeLessThan(seaLevel)
        expect(grid.values[grid.rows - 1][x]).toBeLessThan(seaLevel)
      }
      for (let y = 0; y < grid.rows; y++) {
        expect(grid.values[y][0]).toBeLessThan(seaLevel)
        expect(grid.values[y][grid.cols - 1]).toBeLessThan(seaLevel)
      }
    }
  })

  it('a single continent leaves the grid center as the most-elevated-on-average region', () => {
    const grid = computeElevationGrid({ seed: 7, widthPixels: 800, heightPixels: 800, edgesAreOcean: true, continentCount: 1 })
    const cx = Math.floor(grid.cols / 2)
    const cy = Math.floor(grid.rows / 2)
    // Averaged over a small patch (not a single noisy cell) to compare the
    // island mask's overall shape rather than one lucky/unlucky sample.
    const average = (x0: number, y0: number, size: number): number => {
      let sum = 0
      let count = 0
      for (let y = y0; y < y0 + size && y < grid.rows; y++) {
        for (let x = x0; x < x0 + size && x < grid.cols; x++) {
          sum += grid.values[y][x]
          count++
        }
      }
      return sum / count
    }
    const centerAvg = average(cx - 4, cy - 4, 8)
    const cornerAvg = average(0, 0, 8)
    expect(centerAvg).toBeGreaterThan(cornerAvg)
  })

  it('a real generateTerrain run with edgesAreOcean produces a landmass that never touches the canvas edge', () => {
    // A real margin (not just a 1px smoothing-jitter tolerance) — the whole
    // point of edgesAreOcean is a visible band of guaranteed ocean around
    // the landmass, not land that merely stops exactly at the boundary.
    const margin = 15
    for (const seed of [1, 2, 3]) {
      const width = 800
      const height = 800
      const result = generateTerrain({ seed, widthPixels: width, heightPixels: height, seaLevel: 0.3, edgesAreOcean: true, continentCount: 1 }, idSequence())
      expect(result.landmasses.length).toBeGreaterThan(0)
      for (const landmass of result.landmasses) {
        for (const p of landmass.points) {
          expect(p.x).toBeGreaterThan(margin)
          expect(p.x).toBeLessThan(width - margin)
          expect(p.y).toBeGreaterThan(margin)
          expect(p.y).toBeLessThan(height - margin)
        }
      }
    }
  })

  it('shows real coastline texture, not a smooth mask-shaped circle (regression: noise feature scale was too large relative to a continent to add any visible variation)', () => {
    // Same-distance-from-center points that a purely radial mask (no real
    // noise texture) would read as nearly identical — sampled just inside
    // the landmass's own core, well clear of both the mask's own outer
    // falloff ring and the ridge/highland layer, so what's being measured
    // is the base noise's own contribution, not either of those.
    const grid = computeElevationGrid({ seed: 11, widthPixels: 800, heightPixels: 800, landmassScale: 0.35, edgesAreOcean: true, continentCount: 1 })
    const cx = grid.cols / 2
    const cy = grid.rows / 2
    const sampleRadius = Math.min(grid.cols, grid.rows) * 0.12
    const samples: number[] = []
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x = Math.min(grid.cols - 1, Math.max(0, Math.round(cx + Math.cos(angle) * sampleRadius)))
      const y = Math.min(grid.rows - 1, Math.max(0, Math.round(cy + Math.sin(angle) * sampleRadius)))
      samples.push(grid.values[y][x])
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length
    // A smooth, texture-free radial mask would put every one of these
    // same-distance samples within a hair of `mean` (variance near 0) —
    // real fractal noise at this scale should clearly separate them.
    expect(Math.sqrt(variance)).toBeGreaterThan(0.02)
  })

  it('gives separate continents genuinely different sizes (regression: every continent at a given continentCount previously shared one identical global radius)', () => {
    const result = generateTerrain(
      { seed: 4, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, edgesAreOcean: true, continentCount: 4 },
      idSequence()
    )
    const areas = result.landmasses.map((l) => polygonArea(l.points)).sort((a, b) => a - b)
    expect(areas.length).toBeGreaterThanOrEqual(2)
    // The smallest landmass found is meaningfully smaller than the
    // largest — not every continent landing at (within noise) the same
    // uniform size.
    expect(areas[0]).toBeLessThan(areas[areas.length - 1] * 0.85)
  })
})

// A cheap centroid-based containment check (not full point-in-polygon) —
// good enough for this test's purpose of confirming mountains land roughly
// inside a landmass, without pulling in mapGeometry's exact algorithm.
function pointRoughlyInsidePolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): number {
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    min = Math.min(min, distanceToSegment(point, a, b))
  }
  return min
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  const closest = { x: a.x + t * dx, y: a.y + t * dy }
  return Math.hypot(p.x - closest.x, p.y - closest.y)
}
