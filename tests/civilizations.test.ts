import { describe, it, expect } from 'vitest'
import { generateCivilizations } from '../src/lib/mapGeneration/civilizations'
import { polygonArea, signedPolygonArea } from '../src/lib/mapGeneration/contour'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('generateCivilizations', () => {
  it('is deterministic for the same seed and params', () => {
    const params = { seed: 20, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.35 }
    const a = generateCivilizations(params, idSequence())
    const b = generateCivilizations(params, idSequence())
    expect(a.pins.map((p) => ({ x: p.x, y: p.y, label: p.label }))).toEqual(b.pins.map((p) => ({ x: p.x, y: p.y, label: p.label })))
    expect(a.territories.map((t) => t.points)).toEqual(b.territories.map((t) => t.points))
  })

  it('produces different placements for different seeds', () => {
    const a = generateCivilizations({ seed: 1, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.35 }, idSequence())
    const b = generateCivilizations({ seed: 2, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.35 }, idSequence())
    expect(a.pins.map((p) => `${p.x},${p.y}`)).not.toEqual(b.pins.map((p) => `${p.x},${p.y}`))
  })

  it('every pin and territory is tagged generated:true', () => {
    const result = generateCivilizations({ seed: 5, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.35 }, idSequence())
    for (const p of result.pins) expect(p.generated).toBe(true)
    for (const t of result.territories) expect(t.generated).toBe(true)
  })

  it('places settlements up to settlementCount when land is abundant', () => {
    const result = generateCivilizations(
      { seed: 5, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.15, civilizationCount: 2, settlementCount: 6 },
      idSequence()
    )
    expect(result.pins.length).toBe(6)
  })

  it('every territory references a capitalPinId that exists among the generated pins', () => {
    const result = generateCivilizations({ seed: 7, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3, civilizationCount: 3, settlementCount: 9 }, idSequence())
    const pinIds = new Set(result.pins.map((p) => p.id))
    for (const t of result.territories) {
      expect(t.capitalPinId).not.toBeNull()
      expect(pinIds.has(t.capitalPinId as string)).toBe(true)
    }
  })

  it('never places two settlements closer than a reasonable minimum spacing', () => {
    const result = generateCivilizations({ seed: 9, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, civilizationCount: 2, settlementCount: 8 }, idSequence())
    // Grid is 48 cells over 1000px by default -> ~20.8px/cell; settlements
    // should never land in the exact same handful of cells.
    for (let i = 0; i < result.pins.length; i++) {
      for (let j = i + 1; j < result.pins.length; j++) {
        const dist = Math.hypot(result.pins[i].x - result.pins[j].x, result.pins[i].y - result.pins[j].y)
        expect(dist).toBeGreaterThan(5)
      }
    }
  })

  it('keeps every pin and territory point within canvas bounds', () => {
    const result = generateCivilizations({ seed: 11, widthPixels: 600, heightPixels: 400, seaLevel: 0.3 }, idSequence())
    for (const p of result.pins) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(600)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(400)
    }
    for (const t of result.territories) {
      for (const point of t.points) {
        expect(point.x).toBeGreaterThanOrEqual(-1)
        expect(point.x).toBeLessThanOrEqual(601)
        expect(point.y).toBeGreaterThanOrEqual(-1)
        expect(point.y).toBeLessThanOrEqual(401)
      }
    }
  })

  it('never emits a hole as its own phantom territory', () => {
    const result = generateCivilizations({ seed: 13, widthPixels: 800, heightPixels: 800, seaLevel: 0.2, civilizationCount: 3, settlementCount: 9 }, idSequence())
    for (const t of result.territories) expect(signedPolygonArea(t.points)).toBeGreaterThan(0)
  })

  it('produces nothing on an all-ocean map', () => {
    const result = generateCivilizations({ seed: 1, widthPixels: 1000, heightPixels: 1000, seaLevel: 5 }, idSequence())
    expect(result.pins).toEqual([])
    expect(result.territories).toEqual([])
  })

  it('assigns ids via the provided idFactory for non-capital pins and territories', () => {
    const result = generateCivilizations({ seed: 4, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3 }, idSequence())
    for (const t of result.territories) expect(t.id).toMatch(/^id-\d+$/)
  })
})
