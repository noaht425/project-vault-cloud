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
  const NATURAL = { temperature: 0.1, moisture: 0.9, elevation: 0.5 }

  it('passes natural values through unchanged with no anchors in range', () => {
    expect(blendTowardAnchors({ x: 0, y: 0 }, NATURAL, [], 100)).toEqual(NATURAL)
    expect(blendTowardAnchors({ x: 0, y: 0 }, NATURAL, [{ x: 1000, y: 1000, biomeId: 'desert' }], 100)).toEqual(NATURAL)
  })

  it('fully replaces natural values with the anchor target exactly at the anchor point', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'desert' }]
    const result = blendTowardAnchors({ x: 0, y: 0 }, NATURAL, anchors, 100)
    expect(result.temperature).toBeCloseTo(0.825, 5)
    expect(result.moisture).toBeCloseTo(0.15, 5)
    expect(result.elevation).toBeCloseTo(0.45, 5)
  })

  it('tapers smoothly with distance instead of a hard cutoff', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'desert' }]
    const near = blendTowardAnchors({ x: 20, y: 0 }, NATURAL, anchors, 100)
    const mid = blendTowardAnchors({ x: 50, y: 0 }, NATURAL, anchors, 100)
    const far = blendTowardAnchors({ x: 90, y: 0 }, NATURAL, anchors, 100)
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
    const midpoint = blendTowardAnchors({ x: 50, y: 0 }, { temperature: 0.5, moisture: 0.5, elevation: 0.5 }, anchors, 100)
    // Roughly halfway between desert's 0.825 and tundra's 0.15 temperature —
    // not equal to either endpoint, confirming a real blend occurred.
    expect(midpoint.temperature).toBeGreaterThan(0.3)
    expect(midpoint.temperature).toBeLessThan(0.65)
  })

  it('pulls elevation above the alpine threshold for an alpine anchor, even over naturally low elevation', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'alpine' }]
    const result = blendTowardAnchors({ x: 0, y: 0 }, { temperature: 0.5, moisture: 0.5, elevation: 0.1 }, anchors, 100)
    expect(result.elevation).toBeCloseTo(0.85, 5)
    expect(classifyBiome(result.temperature, result.moisture, result.elevation)).toBe('alpine')
  })

  it('pulls elevation below the alpine threshold for a non-alpine anchor, even over naturally high (phantom-mountain) elevation', () => {
    const anchors: ClimateAnchor[] = [{ x: 0, y: 0, biomeId: 'desert' }]
    const result = blendTowardAnchors({ x: 0, y: 0 }, { temperature: 0.5, moisture: 0.5, elevation: 0.95 }, anchors, 100)
    expect(result.elevation).toBeCloseTo(0.45, 5)
    expect(classifyBiome(result.temperature, result.moisture, result.elevation)).toBe('desert')
  })

  it('an alpine anchor still reads as alpine at its own exact point even surrounded by several closer lowland anchors (regression: a plain weighted-average diluted this below threshold)', () => {
    const anchors: ClimateAnchor[] = [
      { x: 0, y: 0, biomeId: 'alpine' },
      { x: 20, y: 0, biomeId: 'temperate-forest' },
      { x: 0, y: 25, biomeId: 'temperate-forest' },
      { x: -18, y: 0, biomeId: 'taiga' },
      { x: 0, y: -30, biomeId: 'temperate-forest' }
    ]
    const result = blendTowardAnchors({ x: 0, y: 0 }, { temperature: 0.5, moisture: 0.5, elevation: 0.1 }, anchors, 100)
    expect(result.elevation).toBeCloseTo(0.85, 5)
    expect(classifyBiome(result.temperature, result.moisture, result.elevation)).toBe('alpine')
  })
})

describe('generateClimate', () => {
  it('with no landmassPolygons, behaves exactly as before (fully additive)', () => {
    const params = { seed: 12, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, topLatitude: 60, bottomLatitude: -20 }
    const withoutField = generateClimate(params, idSequence())
    const withEmptyPolygons = generateClimate({ ...params, landmassPolygons: [] }, idSequence())
    expect(withEmptyPolygons.climateZones.map((z) => z.points)).toEqual(withoutField.climateZones.map((z) => z.points))
  })

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

  it('a hand-painted elevated zone reads as alpine at its own location, overriding whatever the unzoned run classified there', () => {
    const base = { seed: 15, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, topLatitude: 5, bottomLatitude: -5 }
    const withoutZone = generateClimate(base, idSequence())
    const centerBiomeWithoutZone = withoutZone.climateZones.find((z) => polygonArea(z.points) > 0 && pointInPolygon({ x: 500, y: 500 }, z.points))
    expect(centerBiomeWithoutZone?.climateTypeId).not.toBe('alpine')

    const mountainZone = { points: [{ x: 400, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 400, y: 600 }], elevation: 0.9 }
    const withZone = generateClimate({ ...base, elevatedZones: [mountainZone] }, idSequence())
    const zoneCenterBiome = withZone.climateZones.find((z) => polygonArea(z.points) > 0 && pointInPolygon({ x: 500, y: 500 }, z.points))
    expect(zoneCenterBiome?.climateTypeId).toBe('alpine')
  })

  it('an elevated zone never lowers a cell the noise already made higher (floor, not ceiling)', () => {
    const base = { seed: 15, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.2, topLatitude: 5, bottomLatitude: -5 }
    const lowZone = { points: [{ x: 400, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 400, y: 600 }], elevation: 0 }
    const withoutZone = generateClimate(base, idSequence())
    const withLowZone = generateClimate({ ...base, elevatedZones: [lowZone] }, idSequence())
    // A 0-elevation floor can never raise anything, so this must match the
    // unzoned run exactly — proof the mechanism only ever raises, never lowers.
    expect(withLowZone.climateZones.map((z) => z.points)).toEqual(withoutZone.climateZones.map((z) => z.points))
  })

  it('with no elevated zones, behaves exactly as before (fully additive)', () => {
    const params = { seed: 12, widthPixels: 1000, heightPixels: 1000, seaLevel: 0.4, topLatitude: 60, bottomLatitude: -20 }
    const withoutField = generateClimate(params, idSequence())
    const withEmptyZones = generateClimate({ ...params, elevatedZones: [] }, idSequence())
    expect(withEmptyZones.climateZones.map((z) => z.points)).toEqual(withoutField.climateZones.map((z) => z.points))
  })

  it('landmassPolygons excludes naturally-high ground outside the given shapes from ever getting a biome (regression: climate colored real ocean gaps between hand-drawn islands, since land/sea came from noise alone, oblivious to the actual drawn coastline)', () => {
    const width = 1000
    const height = 1000
    const params = { seed: 5, widthPixels: width, heightPixels: height, seaLevel: 0.3, topLatitude: 40, bottomLatitude: -40 }
    const unrestricted = generateClimate(params, idSequence())
    expect(unrestricted.climateZones.some((z) => z.points.some((p) => p.x > width / 2))).toBe(true)

    const leftHalf = [
      { x: 0, y: 0 },
      { x: width / 2, y: 0 },
      { x: width / 2, y: height },
      { x: 0, y: height }
    ]
    const restricted = generateClimate({ ...params, landmassPolygons: [leftHalf] }, idSequence())
    for (const zone of restricted.climateZones) {
      for (const p of zone.points) expect(p.x).toBeLessThanOrEqual(width / 2)
    }
  })

  it('landmassPolygons lets a hand-drawn coastline receive a biome even where the freshly-invented elevation field alone would leave it blank ocean (regression: an interior gap in a real island silently got no biome at all)', () => {
    const width = 800
    const height = 800
    // seaLevel comfortably above this run's own max naturally-occurring
    // elevation (checked empirically at mountainDensity/mountainRuggedness
    // 0 — see elevation.ts and hydrology.test.ts's identical setup) so every
    // land cell in the "with polygon" run below is there ONLY because of
    // landmassPolygons, not naturally.
    const params = { seed: 5, widthPixels: width, heightPixels: height, seaLevel: 0.9, mountainDensity: 0, mountainRuggedness: 0 }
    const withoutPolygon = generateClimate(params, idSequence())
    expect(withoutPolygon.climateZones).toEqual([])

    const fullCanvas = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ]
    const withPolygon = generateClimate({ ...params, landmassPolygons: [fullCanvas] }, idSequence())
    expect(withPolygon.climateZones.length).toBeGreaterThan(0)
    const centerBiome = withPolygon.climateZones.find((z) => polygonArea(z.points) > 0 && pointInPolygon({ x: width / 2, y: height / 2 }, z.points))
    expect(centerBiome).toBeDefined()
  })

  it('a hand-painted elevated zone still reads as alpine independently of landmassPolygons (the two are separate concerns: one decides land vs. water, the other raises elevation within land)', () => {
    const width = 800
    const height = 800
    const fullCanvas = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ]
    const mountainZone = { points: [{ x: 300, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 500 }, { x: 300, y: 500 }], elevation: 0.9 }
    const result = generateClimate(
      {
        seed: 5,
        widthPixels: width,
        heightPixels: height,
        seaLevel: 0.9,
        mountainDensity: 0,
        mountainRuggedness: 0,
        landmassPolygons: [fullCanvas],
        elevatedZones: [mountainZone]
      },
      idSequence()
    )
    const zoneCenterBiome = result.climateZones.find((z) => polygonArea(z.points) > 0 && pointInPolygon({ x: 400, y: 400 }, z.points))
    expect(zoneCenterBiome?.climateTypeId).toBe('alpine')
  })
})
