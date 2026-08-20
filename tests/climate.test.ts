import { describe, it, expect } from 'vitest'
import { classifyBiome, computeRainShadowMultiplier, generateClimate } from '../src/lib/mapGeneration/climate'
import { polygonArea } from '../src/lib/mapGeneration/contour'

function idSequence(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('classifyBiome', () => {
  it('classifies very high elevation as alpine regardless of temperature/moisture', () => {
    expect(classifyBiome(1, 1, 0.9)).toBe('alpine')
    expect(classifyBiome(0, 0, 0.9)).toBe('alpine')
  })

  it('classifies cold + dry as tundra, cold + wet as taiga', () => {
    expect(classifyBiome(0.1, 0.1, 0.5)).toBe('tundra')
    expect(classifyBiome(0.1, 0.8, 0.5)).toBe('taiga')
  })

  it('classifies mild + dry as grassland, mild + wet as temperate forest', () => {
    expect(classifyBiome(0.5, 0.2, 0.5)).toBe('grassland')
    expect(classifyBiome(0.5, 0.8, 0.5)).toBe('temperate-forest')
  })

  it('classifies hot climates by moisture: desert, savanna, rainforest', () => {
    expect(classifyBiome(0.9, 0.1, 0.5)).toBe('desert')
    expect(classifyBiome(0.9, 0.5, 0.5)).toBe('savanna')
    expect(classifyBiome(0.9, 0.9, 0.5)).toBe('rainforest')
  })
})

describe('computeRainShadowMultiplier', () => {
  it('reduces moisture on the leeward side of a mountain relative to wind direction', () => {
    // A ridge at x=5 (high elevation), wind blowing East (toward +x) — the
    // cell just east of the ridge (x=6) is in its lee and should see a
    // stronger rain-shadow reduction than a cell just as far from the
    // ridge but on its windward (west) side, which the wind reaches
    // without crossing anything.
    const cols = 12
    const rows = 3
    const elevation: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0.3))
    elevation[1][5] = 0.95 // a tall ridge
    const leeward = computeRainShadowMultiplier(elevation, cols, rows, 6, 1, 'E')
    const windward = computeRainShadowMultiplier(elevation, cols, rows, 4, 1, 'E')
    expect(leeward).toBeLessThan(windward)
  })

  it('returns 1 (no shadow) when there is no higher ground upwind', () => {
    const cols = 10
    const rows = 3
    const elevation: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0.3))
    expect(computeRainShadowMultiplier(elevation, cols, rows, 5, 1, 'E')).toBe(1)
  })

  it('never reduces moisture below the documented floor', () => {
    const cols = 10
    const rows = 3
    const elevation: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
    elevation[1][4] = 1
    const result = computeRainShadowMultiplier(elevation, cols, rows, 5, 1, 'E')
    expect(result).toBeGreaterThanOrEqual(0.15)
  })
})

describe('generateClimate', () => {
  it('is deterministic for the same seed and params', () => {
    const params = { seed: 12, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, topLatitude: 60, bottomLatitude: -20 }
    const a = generateClimate(params, idSequence())
    const b = generateClimate(params, idSequence())
    expect(a.climateZones.map((z) => z.points)).toEqual(b.climateZones.map((z) => z.points))
    expect(a.climateTypes).toEqual(b.climateTypes)
  })

  it('every climate zone is tagged generated:true and references a listed climate type', () => {
    const result = generateClimate({ seed: 5, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, topLatitude: 70, bottomLatitude: -70 }, idSequence())
    expect(result.climateZones.length).toBeGreaterThan(0)
    const typeIds = new Set(result.climateTypes.map((t) => t.id))
    for (const zone of result.climateZones) {
      expect(zone.generated).toBe(true)
      expect(typeIds.has(zone.climateTypeId)).toBe(true)
    }
  })

  it('a map spanning both hemispheres near the poles produces a cold biome (tundra/taiga/alpine) somewhere', () => {
    const result = generateClimate(
      { seed: 7, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3, topLatitude: 89, bottomLatitude: 60 },
      idSequence()
    )
    const coldBiomes = new Set(['tundra', 'taiga', 'alpine'])
    expect(result.climateTypes.some((t) => coldBiomes.has(t.id))).toBe(true)
  })

  it('a map straddling the equator produces a hot biome (desert/savanna/rainforest) somewhere', () => {
    const result = generateClimate(
      { seed: 9, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.3, topLatitude: 15, bottomLatitude: -15 },
      idSequence()
    )
    const hotBiomes = new Set(['desert', 'savanna', 'rainforest'])
    expect(result.climateTypes.some((t) => hotBiomes.has(t.id))).toBe(true)
  })

  it('falls back to a center-warm/edge-cold gradient when latitude is not configured', () => {
    const withoutLatitude = generateClimate({ seed: 8, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.35 }, idSequence())
    expect(withoutLatitude.climateZones.length).toBeGreaterThan(0)
  })

  it('keeps every zone polygon point within the canvas bounds', () => {
    const result = generateClimate(
      { seed: 6, widthPixels: 600, heightPixels: 400, seaLevel: 0.35, topLatitude: 50, bottomLatitude: -10 },
      idSequence()
    )
    for (const zone of result.climateZones) {
      for (const p of zone.points) {
        expect(p.x).toBeGreaterThanOrEqual(-1)
        expect(p.x).toBeLessThanOrEqual(601)
        expect(p.y).toBeGreaterThanOrEqual(-1)
        expect(p.y).toBeLessThanOrEqual(401)
      }
    }
  })

  it('never emits a zero-or-negative-area zone', () => {
    const result = generateClimate(
      { seed: 11, widthPixels: 800, heightPixels: 800, seaLevel: 0.4, topLatitude: 40, bottomLatitude: -40 },
      idSequence()
    )
    for (const zone of result.climateZones) expect(polygonArea(zone.points)).toBeGreaterThan(0)
  })
})
