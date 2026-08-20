import { describe, it, expect } from 'vitest'
import { traceRegionBoundaries, polygonArea, signedPolygonArea, smoothPolygon } from '../src/lib/mapGeneration/contour'

describe('traceRegionBoundaries', () => {
  it('traces a single land cell as a unit-square loop', () => {
    const isInside = (x: number, y: number) => x === 1 && y === 1
    const loops = traceRegionBoundaries(3, 3, isInside)
    expect(loops.length).toBe(1)
    expect(loops[0].length).toBe(4)
    expect(polygonArea(loops[0])).toBe(1)
  })

  it('traces two horizontally adjacent land cells as one 2x1 rectangle, not two squares', () => {
    const isInside = (x: number, y: number) => y === 1 && (x === 1 || x === 2)
    const loops = traceRegionBoundaries(4, 3, isInside)
    expect(loops.length).toBe(1)
    expect(polygonArea(loops[0])).toBe(2)
  })

  it('traces a solid block region with the correct area regardless of internal cell count', () => {
    const isInside = (x: number, y: number) => x >= 1 && x < 5 && y >= 1 && y < 4
    const loops = traceRegionBoundaries(7, 6, isInside)
    expect(loops.length).toBe(1)
    expect(polygonArea(loops[0])).toBe(4 * 3)
  })

  it('produces one loop per disconnected component', () => {
    const isInside = (x: number, y: number) => (x === 1 && y === 1) || (x === 5 && y === 5)
    const loops = traceRegionBoundaries(8, 8, isInside)
    expect(loops.length).toBe(2)
    for (const loop of loops) expect(polygonArea(loop)).toBe(1)
  })

  it('returns nothing for an all-outside grid', () => {
    const loops = traceRegionBoundaries(5, 5, () => false)
    expect(loops).toEqual([])
  })

  it('returns a single loop covering everything for an all-inside grid (no fringe artifact)', () => {
    const loops = traceRegionBoundaries(4, 4, () => true)
    expect(loops.length).toBe(1)
    expect(polygonArea(loops[0])).toBe(16)
  })

  it('every returned loop has no immediately-repeated consecutive point', () => {
    const isInside = (x: number, y: number) => x >= 1 && x < 5 && y >= 1 && y < 4
    const loops = traceRegionBoundaries(7, 6, isInside)
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]
        const b = loop[(i + 1) % loop.length]
        expect(a.x === b.x && a.y === b.y).toBe(false)
      }
    }
  })
})

describe('polygonArea', () => {
  it('computes a unit square as area 1', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(1)
  })

  it('is winding-direction independent', () => {
    const cw = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]
    const ccw = [...cw].reverse()
    expect(polygonArea(cw)).toBe(polygonArea(ccw))
  })
})

describe('signedPolygonArea distinguishes an outer boundary from a hole', () => {
  // Regression coverage for a real bug found while building the terrain
  // generator: a "donut" region (a land block with a fully enclosed water
  // pocket in the middle) traces as TWO loops — the outer boundary and the
  // hole's own boundary. Before this was fixed, elevation.ts filtered
  // loops purely by unsigned area, so a large enough hole (a lake) could
  // survive the size filter and get emitted as its own phantom landmass
  // shaped exactly like the lake. The fix: outer and hole loops always
  // wind opposite directions, so signedPolygonArea's sign (not just its
  // magnitude) is what callers must filter on.
  it('gives the outer loop a positive sign and the hole a negative sign', () => {
    const isInside = (x: number, y: number) => x >= 0 && x < 5 && y >= 0 && y < 5 && !(x === 2 && y === 2)
    const loops = traceRegionBoundaries(5, 5, isInside)
    expect(loops.length).toBe(2)
    const signs = loops.map(signedPolygonArea).map(Math.sign)
    expect(signs).toContain(1)
    expect(signs).toContain(-1)
  })
})

describe('smoothPolygon', () => {
  it('doubles the point count per iteration', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]
    expect(smoothPolygon(square, 1).length).toBe(8)
    expect(smoothPolygon(square, 2).length).toBe(16)
  })

  it('keeps every point within the original polygon (corner-cutting never overshoots outward)', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]
    const smoothed = smoothPolygon(square, 2)
    for (const p of smoothed) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(4)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(4)
    }
  })

  it('preserves area reasonably closely (corner-cutting shrinks slightly, not drastically)', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const smoothed = smoothPolygon(square, 3)
    const area = polygonArea(smoothed)
    expect(area).toBeGreaterThan(80)
    expect(area).toBeLessThan(100)
  })

  it('is a no-op on a degenerate (<3 point) input', () => {
    expect(smoothPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }], 3)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })
})
