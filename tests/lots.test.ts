import { describe, it, expect } from 'vitest'
import { subdivideBlock } from '../src/lib/mapGeneration/lots'
import { polygonArea } from '../src/lib/mapGeneration/contour'
import { pointInPolygon, type Point } from '../src/lib/mapGeometry'

// A plain 300x200 rectangle, and the same rectangle rotated 20 degrees.
const RECT: Point[] = [
  { x: 100, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 300 },
  { x: 100, y: 300 }
]
function rotated(points: Point[], deg: number, cx = 250, cy = 200): Point[] {
  const r = (deg * Math.PI) / 180
  return points.map((p) => ({
    x: cx + (p.x - cx) * Math.cos(r) - (p.y - cy) * Math.sin(r),
    y: cy + (p.x - cx) * Math.sin(r) + (p.y - cy) * Math.cos(r)
  }))
}

describe('subdivideBlock', () => {
  it('is deterministic for the same block and target', () => {
    expect(subdivideBlock(RECT, 2500, { seed: 3 })).toEqual(subdivideBlock(RECT, 2500, { seed: 3 }))
  })

  it('produces lots whose area is in the neighbourhood of the target', () => {
    const target = 2500
    const lots = subdivideBlock(RECT, target, { seed: 1 })
    expect(lots.length).toBeGreaterThan(3)
    const avg = lots.reduce((s, l) => s + l.width * l.height, 0) / lots.length
    expect(avg).toBeGreaterThan(target * 0.35)
    expect(avg).toBeLessThan(target * 2.5)
  })

  it('a bigger target yields fewer, bigger lots', () => {
    const small = subdivideBlock(RECT, 1200, { seed: 1 })
    const big = subdivideBlock(RECT, 6000, { seed: 1 })
    expect(big.length).toBeLessThan(small.length)
    const avgSmall = small.reduce((s, l) => s + l.width * l.height, 0) / small.length
    const avgBig = big.reduce((s, l) => s + l.width * l.height, 0) / big.length
    expect(avgBig).toBeGreaterThan(avgSmall)
  })

  it('keeps every lot centre inside the block and inset from its edges', () => {
    for (const lot of subdivideBlock(RECT, 2500, { seed: 5, streetInsetPixels: 4 })) {
      expect(pointInPolygon({ x: lot.x, y: lot.y }, RECT)).toBe(true)
      expect(lot.width).toBeGreaterThan(0)
      expect(lot.height).toBeGreaterThan(0)
      // The lot's own footprint stays within the block bounds (inset means
      // it never reaches the x=100/400 or y=100/300 edges).
      expect(lot.x - lot.width / 2).toBeGreaterThan(99)
      expect(lot.x + lot.width / 2).toBeLessThan(401)
      expect(lot.y - lot.height / 2).toBeGreaterThan(99)
      expect(lot.y + lot.height / 2).toBeLessThan(301)
    }
  })

  it('the lots roughly tile the block (minus street insets)', () => {
    const lots = subdivideBlock(RECT, 2500, { seed: 2, streetInsetPixels: 3 })
    const total = lots.reduce((s, l) => s + l.width * l.height, 0)
    expect(total).toBeGreaterThan(polygonArea(RECT) * 0.5)
    expect(total).toBeLessThan(polygonArea(RECT))
  })

  it('aligns lots to a rotated block', () => {
    const block = rotated(RECT, 20)
    const lots = subdivideBlock(block, 2500, { seed: 1 })
    expect(lots.length).toBeGreaterThan(0)
    // Every lot shares the block's ~20-degree orientation (folded into
    // [0,90) — a rectangle reads the same at 20 and 110 degrees).
    for (const lot of lots) {
      const r = ((lot.rotationDegrees % 90) + 90) % 90
      expect(Math.min(Math.abs(r - 20), Math.abs(r - 70))).toBeLessThan(6)
    }
  })

  it('returns nothing for a degenerate block or non-positive target', () => {
    expect(subdivideBlock([{ x: 0, y: 0 }, { x: 1, y: 1 }], 500)).toEqual([])
    expect(subdivideBlock(RECT, 0)).toEqual([])
    expect(subdivideBlock(RECT, -100)).toEqual([])
  })
})
