import { describe, it, expect } from 'vitest'
import { generateRoads } from '../src/lib/mapGeneration/roads'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('generateRoads', () => {
  const settlements = [
    { x: 100, y: 100 },
    { x: 500, y: 150 },
    { x: 300, y: 600 },
    { x: 800, y: 500 }
  ]

  it('is deterministic for the same seed, params, and settlements', () => {
    const params = { seed: 30, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3 }
    const a = generateRoads(params, settlements, idSequence())
    const b = generateRoads(params, settlements, idSequence())
    expect(a.map((r) => r.points)).toEqual(b.map((r) => r.points))
  })

  it('returns nothing for fewer than 2 settlements', () => {
    expect(generateRoads({ seed: 1, widthPixels: 1000, heightPixels: 1000 }, [])).toEqual([])
    expect(generateRoads({ seed: 1, widthPixels: 1000, heightPixels: 1000 }, [{ x: 5, y: 5 }])).toEqual([])
  })

  it('connects every settlement into one network (spanning tree) at roadDensity 0', () => {
    const roads = generateRoads({ seed: 2, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, roadDensity: 0 }, settlements, idSequence())
    // A spanning tree over 4 settlements has exactly 3 edges.
    expect(roads.length).toBe(3)
  })

  it('a higher roadDensity produces at least as many roads as a lower one', () => {
    const low = generateRoads({ seed: 2, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, roadDensity: 0 }, settlements, idSequence())
    const high = generateRoads({ seed: 2, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, roadDensity: 1 }, settlements, idSequence())
    expect(high.length).toBeGreaterThanOrEqual(low.length)
  })

  it('every road is tagged generated:true, uses the road line type, starts and ends near a settlement', () => {
    const roads = generateRoads({ seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2 }, settlements, idSequence())
    expect(roads.length).toBeGreaterThan(0)
    for (const road of roads) {
      expect(road.generated).toBe(true)
      expect(road.lineTypeId).toBe('road')
      expect(road.points.length).toBeGreaterThanOrEqual(2)
      const start = road.points[0]
      const end = road.points[road.points.length - 1]
      const nearAnySettlement = (p: { x: number; y: number }) => settlements.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 40)
      expect(nearAnySettlement(start)).toBe(true)
      expect(nearAnySettlement(end)).toBe(true)
    }
  })

  it('uses a custom roadLineTypeId and roadWidthPixels when provided', () => {
    const roads = generateRoads(
      { seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, roadLineTypeId: 'custom-road', roadWidthPixels: 15 },
      settlements,
      idSequence()
    )
    for (const r of roads) {
      expect(r.lineTypeId).toBe('custom-road')
      expect(r.widthPixels).toBe(15)
    }
  })

  it('keeps every road point within canvas bounds', () => {
    const roads = generateRoads({ seed: 6, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2 }, settlements, idSequence())
    for (const road of roads) {
      for (const p of road.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(1000)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('assigns ids via the provided idFactory', () => {
    const roads = generateRoads({ seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2 }, settlements, idSequence())
    for (const r of roads) expect(r.id).toMatch(/^id-\d+$/)
  })

  it('produces no roads when settlements are unreachable (an all-ocean map)', () => {
    const roads = generateRoads({ seed: 1, widthPixels: 1000, heightPixels: 1000, seaLevel: 5 }, settlements, idSequence())
    expect(roads).toEqual([])
  })
})
