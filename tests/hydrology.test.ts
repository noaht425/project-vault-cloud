import { describe, it, expect } from 'vitest'
import { generateRivers } from '../src/lib/mapGeneration/hydrology'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('generateRivers', () => {
  it('with no landmassPolygons, behaves exactly as before (fully additive)', () => {
    const params = { seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, riverDensity: 0.6 }
    const withoutField = generateRivers(params, idSequence())
    const withEmptyPolygons = generateRivers({ ...params, landmassPolygons: [] }, idSequence())
    expect(withEmptyPolygons.map((r) => r.points)).toEqual(withoutField.map((r) => r.points))
  })

  it('is deterministic for the same seed and params', () => {
    const params = { seed: 42, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4 }
    const a = generateRivers(params, idSequence())
    const b = generateRivers(params, idSequence())
    expect(a.map((r) => r.points)).toEqual(b.map((r) => r.points))
  })

  it('every river is tagged generated:true, uses the river line type, and has at least 4 points', () => {
    const rivers = generateRivers({ seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, riverDensity: 0.6 }, idSequence())
    expect(rivers.length).toBeGreaterThan(0)
    for (const r of rivers) {
      expect(r.generated).toBe(true)
      expect(r.lineTypeId).toBe('river')
      expect(r.points.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('uses a custom riverLineTypeId when provided', () => {
    const rivers = generateRivers(
      { seed: 3, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, riverDensity: 0.6, riverLineTypeId: 'custom-river' },
      idSequence()
    )
    for (const r of rivers) expect(r.lineTypeId).toBe('custom-river')
  })

  it('a higher riverDensity produces at least as many rivers, averaged across seeds', () => {
    function totalRiverCount(riverDensity: number): number {
      let total = 0
      for (const seed of [1, 2, 3, 4, 5]) {
        total += generateRivers({ seed, widthPixels: 800, heightPixels: 800, seaLevel: 0.35, riverDensity }, idSequence()).length
      }
      return total
    }
    expect(totalRiverCount(0.9)).toBeGreaterThan(totalRiverCount(0.1))
  })

  it('keeps every river point within the canvas bounds', () => {
    const rivers = generateRivers({ seed: 6, widthPixels: 600, heightPixels: 400, seaLevel: 0.4, riverDensity: 0.7 }, idSequence())
    for (const r of rivers) {
      for (const p of r.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(600)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(400)
      }
    }
  })

  it('assigns ids via the provided idFactory', () => {
    const rivers = generateRivers({ seed: 4, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, riverDensity: 0.6 }, idSequence())
    for (const r of rivers) expect(r.id).toMatch(/^id-\d+$/)
  })

  it('produces no rivers on an all-ocean map (sea level above every elevation)', () => {
    const rivers = generateRivers({ seed: 1, widthPixels: 1000, heightPixels: 1000, seaLevel: 5 }, idSequence())
    expect(rivers).toEqual([])
  })

  it('landmassPolygons excludes rivers from naturally-high ground that falls outside the given shapes (regression: rivers could cross a real ocean gap between hand-drawn islands, since land/sea came from noise alone, oblivious to the actual drawn coastline)', () => {
    const width = 1000
    const height = 1000
    // A low seaLevel so plenty of the canvas naturally reads as land on
    // BOTH sides of the restriction below — confirms the restriction is
    // doing real work, not just coinciding with what the noise would have
    // produced anyway.
    const params = { seed: 5, widthPixels: width, heightPixels: height, seaLevel: 0.3, riverDensity: 0.6 }
    const unrestricted = generateRivers(params, idSequence())
    expect(unrestricted.some((r) => r.points.some((p) => p.x > width / 2))).toBe(true)

    const leftHalf = [
      { x: 0, y: 0 },
      { x: width / 2, y: 0 },
      { x: width / 2, y: height },
      { x: 0, y: height }
    ]
    const restricted = generateRivers({ ...params, landmassPolygons: [leftHalf] }, idSequence())
    for (const river of restricted) {
      for (const p of river.points) expect(p.x).toBeLessThanOrEqual(width / 2)
    }
  })

  it('landmassPolygons lets rivers form inside a hand-drawn shape even where the freshly-invented elevation field alone would call it ocean (regression: an interior gap in a real island silently got no river network at all)', () => {
    const width = 800
    const height = 800
    // seaLevel comfortably above this run's own max naturally-occurring
    // elevation (checked empirically at mountainDensity/mountainRuggedness
    // 0 — see elevation.ts) so every land cell in the "with polygon" run
    // below is there ONLY because of landmassPolygons, not naturally.
    const params = { seed: 5, widthPixels: width, heightPixels: height, seaLevel: 0.9, mountainDensity: 0, mountainRuggedness: 0 }
    const withoutPolygon = generateRivers(params, idSequence())
    expect(withoutPolygon).toEqual([])

    const fullCanvas = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ]
    const withPolygon = generateRivers({ ...params, landmassPolygons: [fullCanvas] }, idSequence())
    expect(withPolygon.length).toBeGreaterThan(0)
  })
})
