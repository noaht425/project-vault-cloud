import { describe, it, expect } from 'vitest'
import { blendTowardAnchors, classifyBiome, computeRainShadowMultiplier, generateClimate, type ClimateAnchor } from '../src/lib/mapGeneration/climate'
import { polygonArea } from '../src/lib/mapGeneration/contour'
import { pointInPolygon } from '../src/lib/mapGeometry'

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

describe('blendTowardAnchors', () => {
  it('passes natural values through unchanged with no anchors in range', () => {
    expect(blendTowardAnchors({ x: 0, y: 0 }, 0.5, 0.5, [], 100)).toEqual({ temperature: 0.5, moisture: 0.5 })
    expect(blendTowardAnchors({ x: 0, y: 0 }, 0.5, 0.5, [{ x: 1000, y: 1000, biomeId: 'desert' }], 100)).toEqual({ temperature: 0.5, moisture: 0.5 })
  })

  it('fully replaces natural values with the anchor target exactly at the anchor point', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'desert' }]
    const result = blendTowardAnchors({ x: 0, y: 0 }, 0.1, 0.9, anchors, 100)
    expect(result.temperature).toBeCloseTo(0.825, 5)
    expect(result.moisture).toBeCloseTo(0.15, 5)
  })

  it('tapers smoothly with distance instead of a hard cutoff', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'desert' }]
    const near = blendTowardAnchors({ x: 20, y: 0 }, 0.1, 0.9, anchors, 100)
    const mid = blendTowardAnchors({ x: 50, y: 0 }, 0.1, 0.9, anchors, 100)
    const far = blendTowardAnchors({ x: 90, y: 0 }, 0.1, 0.9, anchors, 100)
    // Monotonically approaches the natural value as distance grows.
    expect(near.temperature).toBeGreaterThan(mid.temperature)
    expect(mid.temperature).toBeGreaterThan(far.temperature)
    expect(far.temperature).toBeGreaterThan(0.1)
  })

  it('blends two differently-classified anchors proportionally to distance, rather than snapping to the nearer one', () => {
    const anchors: ClimateAnchor[] = [
      { x: 0, y: 0, biomeId: 'desert' }, // hot/dry
      { x: 100, y: 0, biomeId: 'tundra' } // cold/dry
    ]
    const midpoint = blendTowardAnchors({ x: 50, y: 0 }, 0.5, 0.5, anchors, 100)
    // Roughly halfway between desert's 0.825 and tundra's 0.15 temperature —
    // not equal to either endpoint, confirming a real blend occurred.
    expect(midpoint.temperature).toBeGreaterThan(0.3)
    expect(midpoint.temperature).toBeLessThan(0.65)
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

  it('an anchor pulls the classified biome at its own location to match, even against a strong opposing natural signal', () => {
    // Equatorial band (hot) with an 'tundra' anchor planted right in the
    // middle of it — without the anchor this point would classify hot
    // (desert/savanna/rainforest); with it, the anchor's pull should win at
    // its own exact location.
    const base = { seed: 21, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, topLatitude: 10, bottomLatitude: -10 }
    const anchorPoint = { x: 500, y: 500, biomeId: 'tundra' as const }
    const result = generateClimate({ ...base, anchors: [anchorPoint], anchorRadiusPixels: 150 }, idSequence())
    const zoneContainingAnchor = result.climateZones.find((z) => polygonArea(z.points) > 0 && pointInPolygon(anchorPoint, z.points))
    expect(zoneContainingAnchor?.climateTypeId).toBe('tundra')
  })

  it('with no anchors, behaves exactly as before (same output as the pre-anchor call shape)', () => {
    const params = { seed: 12, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, topLatitude: 60, bottomLatitude: -20 }
    const withoutAnchorsField = generateClimate(params, idSequence())
    const withEmptyAnchors = generateClimate({ ...params, anchors: [], anchorRadiusPixels: 0 }, idSequence())
    expect(withEmptyAnchors.climateZones.map((z) => z.points)).toEqual(withoutAnchorsField.climateZones.map((z) => z.points))
  })

  it('never emits a zero-or-negative-area zone', () => {
    const result = generateClimate(
      { seed: 11, widthPixels: 800, heightPixels: 800, seaLevel: 0.4, topLatitude: 40, bottomLatitude: -40 },
      idSequence()
    )
    for (const zone of result.climateZones) expect(polygonArea(zone.points)).toBeGreaterThan(0)
  })
})
