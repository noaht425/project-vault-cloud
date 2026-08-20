import { describe, it, expect } from 'vitest'
import { generateRivers } from '../src/lib/mapGeneration/hydrology'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('generateRivers', () => {
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
})
