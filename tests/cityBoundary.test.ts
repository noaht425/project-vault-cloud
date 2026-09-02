import { describe, it, expect } from 'vitest'
import { generateCityBoundary, type CityBoundaryParams } from '../src/lib/mapGeneration/cityBoundary'
import { polygonArea } from '../src/lib/mapGeneration/contour'
import type { Point } from '../src/lib/mapGeometry'

const CANVAS = { widthPixels: 1200, heightPixels: 900 }

function perimeter(points: Point[]): number {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

function boundingBox(points: Point[]): { width: number; height: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

// Andrew's monotone chain — just enough to compare a blob's area against
// its own convex hull's ("how convex is this shape").
function convexHullArea(points: Point[]): number {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (src: Point[]): Point[] => {
    const stack: Point[] = []
    for (const p of src) {
      while (stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], p) <= 0) stack.pop()
      stack.push(p)
    }
    stack.pop()
    return stack
  }
  const hull = [...build(sorted), ...build([...sorted].reverse())]
  return polygonArea(hull)
}

// O(n^2) self-intersection check — non-adjacent edges must never cross.
function isSimplePolygon(points: Point[]): boolean {
  const n = points.length
  const segmentsCross = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
    const d = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const d1 = d(p3, p4, p1)
    const d2 = d(p3, p4, p2)
    const d3 = d(p1, p2, p3)
    const d4 = d(p1, p2, p4)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (i === j) continue
      if (j === (i + 1) % n || i === (j + 1) % n) continue // adjacent edges share a vertex
      if (segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false
    }
  }
  return true
}

const SEEDS = [1, 2, 3, 7, 42, 101]
const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length
// area / perimeter — the plan's "area-to-perimeter ratio": a rougher edge
// spends more perimeter on the same rough area, so this drops.
const compactness = (points: Point[]): number => polygonArea(points) / perimeter(points)

describe('generateCityBoundary', () => {
  const base: CityBoundaryParams = { seed: 1, ...CANVAS }

  it('is deterministic for the same params', () => {
    expect(generateCityBoundary(base).points).toEqual(generateCityBoundary({ ...base }).points)
  })

  it('produces a different footprint for a different seed', () => {
    const a = generateCityBoundary({ ...base, seed: 1 }).points
    const b = generateCityBoundary({ ...base, seed: 2 }).points
    expect(a).not.toEqual(b)
  })

  it('is a valid, non-self-intersecting single-ring polygon', () => {
    for (const seed of SEEDS) {
      for (const walled of [false, true]) {
        for (const boundaryIrregularity of [0, 0.5, 1]) {
          const { points } = generateCityBoundary({ ...CANVAS, seed, walled, boundaryIrregularity })
          expect(points.length).toBeGreaterThan(4)
          expect(isSimplePolygon(points)).toBe(true)
        }
      }
    }
  })

  it('is never an axis-aligned rectangle — many vertices, area well under its bounding box', () => {
    for (const seed of SEEDS) {
      const { points } = generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.6 })
      expect(points.length).toBeGreaterThan(8)
      const bb = boundingBox(points)
      expect(polygonArea(points) / (bb.width * bb.height)).toBeLessThan(0.95)
    }
  })

  it('keeps every vertex inside the canvas even at full irregularity', () => {
    for (const seed of SEEDS) {
      const { points } = generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 1, elongation: { angleRadians: 0.7, strength: 1 } })
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(CANVAS.widthPixels)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(CANVAS.heightPixels)
      }
    }
  })

  it('higher irregularity gives a rougher edge (lower area-to-perimeter ratio) across seeds', () => {
    const clean = avg(SEEDS.map((seed) => compactness(generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.1 }).points)))
    const rough = avg(SEEDS.map((seed) => compactness(generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.9 }).points)))
    expect(rough).toBeLessThan(clean)
  })

  it('a walled town has a smoother, more convex edge than an unwalled one at the same irregularity', () => {
    const walledCompact = avg(SEEDS.map((seed) => compactness(generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.8, walled: true }).points)))
    const unwalledCompact = avg(SEEDS.map((seed) => compactness(generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.8, walled: false }).points)))
    expect(walledCompact).toBeGreaterThan(unwalledCompact)

    const walledConvexity = avg(
      SEEDS.map((seed) => {
        const { points } = generateCityBoundary({ ...CANVAS, seed, boundaryIrregularity: 0.8, walled: true })
        return polygonArea(points) / convexHullArea(points)
      })
    )
    expect(walledConvexity).toBeGreaterThan(0.9)
  })

  it('elongation stretches the footprint along the given axis', () => {
    const round = generateCityBoundary({ ...CANVAS, seed: 5, boundaryIrregularity: 0.2 })
    const stretched = generateCityBoundary({ ...CANVAS, seed: 5, boundaryIrregularity: 0.2, elongation: { angleRadians: 0, strength: 0.6 } })
    const roundBB = boundingBox(round.points)
    const stretchedBB = boundingBox(stretched.points)
    // Elongated along x (angle 0) -> wider, and wider relative to its height.
    expect(stretchedBB.width).toBeGreaterThan(roundBB.width)
    expect(stretchedBB.width / stretchedBB.height).toBeGreaterThan(roundBB.width / roundBB.height)
  })

  it('an unwalled town grows a ribbon lobe toward a road exit bearing', () => {
    const center = { x: CANVAS.widthPixels / 2, y: CANVAS.heightPixels / 2 }
    const reachAlong = (points: Point[], bearing: number): number => {
      let max = 0
      for (const p of points) {
        const d = Math.hypot(p.x - center.x, p.y - center.y)
        const angle = Math.atan2(p.y - center.y, p.x - center.x)
        let diff = Math.abs(angle - bearing)
        if (diff > Math.PI) diff = Math.PI * 2 - diff
        if (diff < 0.15 && d > max) max = d
      }
      return max
    }
    const plain = generateCityBoundary({ ...CANVAS, seed: 4, center, boundaryIrregularity: 0.3 })
    const ribboned = generateCityBoundary({ ...CANVAS, seed: 4, center, boundaryIrregularity: 0.3, roadExitBearings: [0.6] })
    expect(reachAlong(ribboned.points, 0.6)).toBeGreaterThan(reachAlong(plain.points, 0.6) + 10)
  })

  it('a walled town ignores road exit bearings (nothing grows outside the wall)', () => {
    const withRoads = generateCityBoundary({ ...CANVAS, seed: 4, walled: true, roadExitBearings: [0.6, 2.1, 4.0] })
    const withoutRoads = generateCityBoundary({ ...CANVAS, seed: 4, walled: true })
    expect(withRoads.points).toEqual(withoutRoads.points)
  })

  it('echoes `walled` back on the result for the caller to store', () => {
    expect(generateCityBoundary({ ...base, walled: true }).walled).toBe(true)
    expect(generateCityBoundary({ ...base, walled: false }).walled).toBe(false)
  })
})
