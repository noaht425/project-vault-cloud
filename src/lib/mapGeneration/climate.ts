// Biome/climate generation: classifies every land cell into a biome from
// latitude-derived temperature, a second noise field for base moisture
// (rain-shadowed by mountains relative to a prevailing wind direction), and
// elevation (very high land reads as alpine regardless of latitude) — then
// traces each biome's cells into zone polygons the same way elevation.ts
// traces landmasses/mountains.
import { pointInPolygon, segmentDistance, type Point } from '../mapGeometry'
import type { ClimateType, ClimateZone } from '../noteTypes/map'
import { fractalNoise2D } from './noise'
import { applyElevatedZones, computeElevationGrid, type ElevationGridParams } from './elevation'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'

export type BiomeId = 'tundra' | 'taiga' | 'grassland' | 'temperate-forest' | 'desert' | 'savanna' | 'rainforest' | 'alpine'

export const BIOME_DEFINITIONS: { id: BiomeId; name: string; color: string }[] = [
  { id: 'tundra', name: 'Tundra', color: '#c9d6dd' },
  { id: 'taiga', name: 'Taiga', color: '#3f5d52' },
  { id: 'grassland', name: 'Grassland', color: '#a8c46a' },
  { id: 'temperate-forest', name: 'Temperate Forest', color: '#4f8f5b' },
  { id: 'desert', name: 'Desert', color: '#e0c477' },
  { id: 'savanna', name: 'Savanna', color: '#cda85f' },
  { id: 'rainforest', name: 'Rainforest', color: '#2f7d4f' },
  { id: 'alpine', name: 'Alpine', color: '#9aa5ad' }
]

// Elevation at/above this reads as alpine regardless of temperature/
// moisture — real mountain tops are cold and sparse even at the equator.
// Deliberately a bit below MOUNTAIN_ELEVATION_THRESHOLD in elevation.ts
// (0.8) so the alpine biome visibly rings the actual mountain zones
// instead of exactly coinciding with them cell-for-cell.
const ALPINE_ELEVATION_THRESHOLD = 0.72

// temperature/moisture are both 0 (cold/dry) .. 1 (hot/wet). Deliberately a
// simple fixed lookup, not a continuous formula — a Whittaker-diagram-style
// table is the standard way to turn (temperature, moisture) into a biome
// name, and keeping it as explicit bands makes each boundary easy to
// reason about and adjust independently.
export function classifyBiome(temperature: number, moisture: number, elevation: number): BiomeId {
  if (elevation >= ALPINE_ELEVATION_THRESHOLD) return 'alpine'
  if (temperature < 0.3) return moisture > 0.4 ? 'taiga' : 'tundra'
  if (temperature < 0.65) return moisture > 0.5 ? 'temperate-forest' : 'grassland'
  if (moisture < 0.35) return 'desert'
  return moisture < 0.65 ? 'savanna' : 'rainforest'
}

// Representative (temperature, moisture) at the midpoint of each biome's own
// band in classifyBiome above — the "known-correct" value a settlement's
// already-researched climate (see noteTypes/climate.ts's biomeId) pulls
// nearby cells toward (see blendTowardAnchors), rather than stamping that
// biome outright. Pulling the same inputs classifyBiome already uses (not
// overriding its output) is what keeps a filled-in anchor climatically
// consistent with its surroundings: a desert anchor near a taiga anchor
// produces a believable savanna/grassland-ish gradient between them instead
// of two hard-edged patches meeting at a seam. Alpine has no true
// temperature/moisture identity of its own (its real gate is elevation —
// see BIOME_ELEVATION_TARGETS below) — its entry here is just "cold,
// moderate moisture", the reasonable fallback reading for cells near an
// alpine anchor that the elevation pull doesn't manage to push over the
// alpine threshold (e.g. two overlapping anchors fighting over the same
// cell).
export const BIOME_CLIMATE_TARGETS: Record<BiomeId, { temperature: number; moisture: number }> = {
  tundra: { temperature: 0.15, moisture: 0.2 },
  taiga: { temperature: 0.15, moisture: 0.7 },
  grassland: { temperature: 0.475, moisture: 0.25 },
  'temperate-forest': { temperature: 0.475, moisture: 0.75 },
  desert: { temperature: 0.825, moisture: 0.15 },
  savanna: { temperature: 0.825, moisture: 0.5 },
  rainforest: { temperature: 0.825, moisture: 0.85 },
  alpine: { temperature: 0.1, moisture: 0.5 }
}

// Representative elevation for each biome — every non-alpine biome shares
// the same comfortably-below-threshold value (elevation isn't otherwise
// part of any non-alpine biome's identity), while alpine's is comfortably
// above ALPINE_ELEVATION_THRESHOLD. Without this, an alpine-tagged anchor
// (e.g. a real mountain city) had no way to reliably read as alpine at
// all — classifyBiome checks elevation FIRST and unconditionally, so
// pulling only temperature/moisture toward "cold, moderate" still produced
// tundra/taiga at that exact point unless the freshly-generated, entirely
// unrelated elevation noise *happened* to be mountainous there. The same
// gap ran the other way too: a lowland anchor (say, a coastal desert city)
// could get silently overridden to alpine by an unrelated "phantom
// mountain" in the noise a few cells away, with no anchor mechanism able to
// override it, since elevation alone decided the outcome before
// temperature/moisture ever got a vote. Pulling elevation toward whichever
// anchor is nearest (see blendTowardAnchors) fixes both directions at once.
export const BIOME_ELEVATION_TARGETS: Record<BiomeId, number> = {
  tundra: 0.45,
  taiga: 0.45,
  grassland: 0.45,
  'temperate-forest': 0.45,
  desert: 0.45,
  savanna: 0.45,
  rainforest: 0.45,
  alpine: 0.85
}

export interface ClimateAnchor {
  x: number
  y: number
  biomeId: BiomeId
}

// Smooth (zero-derivative-at-both-ends) falloff from 1 at distance 0 to 0 at
// distance >= radiusPixels — the standard graphics "smoothstep" shape,
// chosen so an anchor's pull tapers away gradually instead of leaving a
// visible seam where its influence radius ends.
function anchorInfluence(distance: number, radiusPixels: number): number {
  if (radiusPixels <= 0) return 0
  const t = Math.min(1, Math.max(0, distance / radiusPixels))
  return 1 - t * t * (3 - 2 * t)
}

// Blends the naturally-computed temperature/moisture at one point toward
// nearby anchors' own known-correct values — inverse-distance-weighted
// across every anchor within range, so a point between two differently-
// classified anchors gets pulled proportionally toward each rather than
// snapping to whichever is merely nearest. This averaging is deliberately
// NOT used for elevation (see below) — a real transition zone between two
// climates is a genuine gradient, but "how mountainous is the ground here"
// isn't something that meaningfully averages across several nearby
// settlements the way temperature/moisture do.
//
// Elevation instead follows whichever single anchor is closest, at that
// anchor's own weight alone, ignoring every other anchor in range —
// confirmed necessary, not just simpler: with a plain weighted average, an
// alpine-tagged anchor surrounded by several closer lowland anchors (a
// dense kingdom is exactly this shape) got its own elevation pull diluted
// below ALPINE_ELEVATION_THRESHOLD even at its own exact coordinates, since
// every neighbor within radius kept contributing to the same average.
// "Nearest governs elevation" fixes this by construction: an anchor's
// distance to itself is always 0, which is always <= its distance to any
// other anchor, so its own elevation target always wins at its own point
// regardless of how many neighbors also happen to be in range — while
// still tapering smoothly away via the same anchorInfluence falloff as
// every other pull once you move away from it.
//
// Anchors beyond radiusPixels of a given point contribute nothing, and a
// point with no anchor in range at all passes its natural values through
// completely unchanged — this is what keeps the whole mechanism additive: a
// map with no anchors (the case for every map before this existed) blends
// nothing, no behavior change.
export function blendTowardAnchors(
  point: Point,
  natural: { temperature: number; moisture: number; elevation: number },
  anchors: ClimateAnchor[],
  radiusPixels: number
): { temperature: number; moisture: number; elevation: number } {
  let totalWeight = 0
  let weightedTemperature = 0
  let weightedMoisture = 0
  let nearestDistance = Infinity
  let nearestWeight = 0
  let nearestElevationTarget = 0
  for (const anchor of anchors) {
    const distance = segmentDistance(point, anchor)
    const weight = anchorInfluence(distance, radiusPixels)
    if (weight <= 0) continue
    const climateTarget = BIOME_CLIMATE_TARGETS[anchor.biomeId]
    totalWeight += weight
    weightedTemperature += weight * climateTarget.temperature
    weightedMoisture += weight * climateTarget.moisture
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestWeight = weight
      nearestElevationTarget = BIOME_ELEVATION_TARGETS[anchor.biomeId]
    }
  }
  if (totalWeight <= 0) return natural
  // Capped at 1 so heavy overlap between several anchors' radii can't pull
  // a cell harder than any single anchor could on its own (full replacement
  // is the strongest effect this ever has, right at an anchor's own point).
  const pull = Math.min(1, totalWeight)
  const anchorTemperature = weightedTemperature / totalWeight
  const anchorMoisture = weightedMoisture / totalWeight
  return {
    temperature: natural.temperature + (anchorTemperature - natural.temperature) * pull,
    moisture: natural.moisture + (anchorMoisture - natural.moisture) * pull,
    elevation: natural.elevation + (nearestElevationTarget - natural.elevation) * nearestWeight
  }
}

export type WindDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'

// In grid-cell units, y-down (matching every other coordinate in this
// module) — the direction the wind BLOWS TOWARD. Moisture travels with the
// wind, so a mountain UPWIND (the opposite direction) of a cell can block
// moisture from reaching it (see computeRainShadowMultiplier).
const WIND_VECTORS: Record<WindDirection, Point> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: 0.7071, y: -0.7071 },
  NW: { x: -0.7071, y: -0.7071 },
  SE: { x: 0.7071, y: 0.7071 },
  SW: { x: -0.7071, y: 0.7071 }
}

// How much moisture a rain shadow can remove at most — a cell deep in a
// mountain's lee never drops all the way to zero moisture, just heavily
// reduced, so classifyBiome still has something to work with rather than
// every leeward cell collapsing to the exact same "driest possible" value.
const MAX_RAIN_SHADOW_REDUCTION = 0.85

// Scans a short distance UPWIND (opposite the wind vector) from (x, y) for
// the highest elevation encountered, and reduces moisture proportionally
// to how much higher that ridge is than the current cell — a simplified
// stand-in for a real atmospheric rain-shadow simulation, but enough to
// give mountain ranges a visibly drier lee side, which is the actual
// visual/gameplay-relevant effect being asked for.
export function computeRainShadowMultiplier(
  elevation: number[][],
  cols: number,
  rows: number,
  x: number,
  y: number,
  windDirection: WindDirection,
  searchSteps = 6
): number {
  const wind = WIND_VECTORS[windDirection]
  let maxUpwindElevation = 0
  let cx = x
  let cy = y
  for (let step = 1; step <= searchSteps; step++) {
    cx -= wind.x
    cy -= wind.y
    const ix = Math.round(cx)
    const iy = Math.round(cy)
    if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) break
    maxUpwindElevation = Math.max(maxUpwindElevation, elevation[iy][ix])
  }
  const blockage = Math.max(0, maxUpwindElevation - elevation[y][x] - 0.05)
  return Math.max(1 - MAX_RAIN_SHADOW_REDUCTION, 1 - blockage * 2)
}

export interface ClimateGenerationParams extends ElevationGridParams {
  seaLevel?: number
  // The map's own latitude-mode fields (see noteTypes/map.ts) — when both
  // are set, temperature is derived from real latitude (cos falloff toward
  // the poles); when either is null, temperature instead falls off
  // stylistically from the canvas's vertical center toward its top/bottom
  // edges, so climate generation still produces something reasonable on a
  // map that hasn't configured latitude mode at all.
  topLatitude?: number | null
  bottomLatitude?: number | null
  // 0-1. Relative size of moisture-pattern features, same spirit as
  // landmassScale. Default 0.4.
  moistureScale?: number
  prevailingWindDirection?: WindDirection
  boundaryMask?: Point[] | null
  // Known-correct climate points (e.g. a settlement whose linked climate
  // note already has a biomeId set — see noteTypes/climate.ts) that pull
  // nearby cells' temperature/moisture toward them before classification —
  // see blendTowardAnchors. Empty/omitted has no effect (fully additive).
  anchors?: ClimateAnchor[]
  // In real pixels — how far an anchor's pull reaches before fading out
  // completely. 0/omitted disables anchor blending entirely, regardless of
  // whether anchors are passed.
  anchorRadiusPixels?: number
  // Hand-painted zones whose terrain type has a climateElevationOverride
  // set (see noteTypes/map.ts's terrainTypeSchema) — every cell inside one
  // of these polygons has its elevation raised to at least that value
  // (never lowered — a zone only ever guarantees a FLOOR, so it can't
  // demote a cell the noise already made higher) before land/sea, rain
  // shadow, and biome classification all run, so your own drawn Mountains/
  // Hills inform the climate layer instead of it inventing unrelated
  // elevation from noise alone. Empty/omitted has no effect (fully
  // additive) — see applyElevatedZones.
  elevatedZones?: { points: Point[]; elevation: number }[]
  // Every landmass currently on the map (in practice: just the hand-drawn
  // ones — see the caller in MapGenerationPanel.tsx) — when non-empty, land
  // vs. water for this run is decided STRICTLY by whether a cell falls
  // inside one of these polygons, not by this call's own freshly-invented
  // elevation field at all (elevation itself is still used for everything
  // else — rain-shadow moisture, the alpine gate — just not the land/water
  // boolean).
  //
  // Without this, climate classifies land/water from a BRAND NEW elevation
  // field (this same seed/params run through computeElevationGrid) that has
  // no relationship to a hand-drawn map's actual coastline except through
  // boundaryMask — and a mask only ever guarantees cells OUTSIDE it are
  // water, never that cells INSIDE it are land. Wherever that invented field
  // dips below seaLevel in the interior of a real hand-drawn island, the
  // cell silently gets no biome at all — confirmed: a fully hand-drawn
  // multi-island map showed visible blank, uncolored gaps inside islands
  // that were clearly land in the artwork. A plain elevation floor (raise
  // low cells, never lower high ones) can't fully fix this either — it only
  // ever adds land, so it can't stop the SAME invented field from also
  // reading a real ocean gap between two islands as land (see hydrology.ts's
  // identical reasoning for the river version of this bug). A strict
  // polygon-based land test fixes both directions at once.
  //
  // Empty/omitted (the default) reproduces every prior release's behavior:
  // land/water comes entirely from elevation vs. seaLevel — correct for a
  // purely procedural map (nothing hand-drawn to disagree with) and for a
  // scoped augment/drilldown run inventing land in a region no existing
  // landmass covers yet (see the caller: only passed on a whole-map run).
  landmassPolygons?: Point[][]
}

export interface ClimateGenerationResult {
  climateTypes: ClimateType[]
  climateZones: ClimateZone[]
}

const MIN_CLIMATE_ZONE_AREA_FRACTION = 0.003

export function generateClimate(params: ClimateGenerationParams, idFactory: () => string = () => crypto.randomUUID()): ClimateGenerationResult {
  const {
    seed,
    widthPixels,
    heightPixels,
    seaLevel = 0.5,
    topLatitude = null,
    bottomLatitude = null,
    moistureScale = 0.4,
    prevailingWindDirection = 'W',
    boundaryMask = null,
    anchors = [],
    anchorRadiusPixels = 0,
    elevatedZones = [],
    landmassPolygons = []
  } = params
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)
  // Applied before anything downstream reads the grid, so hand-painted
  // Mountains/Hills inform rain-shadow moisture AND the final alpine gate
  // consistently — not just one of the two.
  applyElevatedZones(elevation, cols, rows, pixelsPerCellX, pixelsPerCellY, elevatedZones)

  const hasMask = boundaryMask !== null && boundaryMask.length >= 3
  const insideMask = (x: number, y: number): boolean => {
    if (!hasMask) return true
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return pointInPolygon(centerPx, boundaryMask as Point[])
  }
  const hasLandmassPolygons = landmassPolygons.length > 0
  const insideAnyLandmass = (x: number, y: number): boolean => {
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return landmassPolygons.some((polygon) => pointInPolygon(centerPx, polygon))
  }
  const isLandCell = (x: number, y: number): boolean =>
    insideMask(x, y) && (hasLandmassPolygons ? insideAnyLandmass(x, y) : elevation[y][x] >= seaLevel)

  // Both branches return a value on the SAME [-1, 1] scale (1 = hottest,
  // -1 = coldest) before the caller normalizes it to [0, 1] — the fallback
  // deliberately mirrors cos()'s own range rather than returning [0, 1]
  // directly, which would otherwise get double-compressed by that later
  // normalization into just the upper half of the scale.
  const hasRealLatitude = topLatitude !== null && bottomLatitude !== null
  const temperatureAt = (y: number): number => {
    if (hasRealLatitude) {
      const latitude = topLatitude + ((bottomLatitude - topLatitude) * y) / Math.max(1, rows - 1)
      return Math.cos((latitude * Math.PI) / 180)
    }
    // No latitude configured — treat the vertical center as "equator-like"
    // (warmest) and both top/bottom edges as "poles" (coldest).
    const distanceFromCenter = Math.abs((y / Math.max(1, rows - 1)) * 2 - 1)
    return 1 - 2 * distanceFromCenter
  }

  const moistureFeatureScale = Math.max(1, (params.gridResolution ?? 48) * moistureScale)
  const biomeAt: (BiomeId | null)[][] = []
  for (let y = 0; y < rows; y++) {
    const row: (BiomeId | null)[] = []
    for (let x = 0; x < cols; x++) {
      if (!isLandCell(x, y)) {
        row.push(null)
        continue
      }
      const baseMoisture = fractalNoise2D(seed + 314159, x, y, { scale: moistureFeatureScale, octaves: 4 })
      const shadow = computeRainShadowMultiplier(elevation, cols, rows, x, y, prevailingWindDirection)
      const naturalMoisture = Math.max(0, Math.min(1, baseMoisture * shadow))
      const naturalTemperature = Math.max(0, Math.min(1, (temperatureAt(y) + 1) / 2))
      const natural = { temperature: naturalTemperature, moisture: naturalMoisture, elevation: elevation[y][x] }
      const { temperature, moisture, elevation: effectiveElevation } =
        anchors.length > 0 && anchorRadiusPixels > 0
          ? blendTowardAnchors({ x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }, natural, anchors, anchorRadiusPixels)
          : natural
      row.push(classifyBiome(temperature, moisture, effectiveElevation))
    }
    biomeAt.push(row)
  }

  const totalPixelArea = widthPixels * heightPixels
  const climateZones: ClimateZone[] = []
  const usedBiomeIds = new Set<BiomeId>()

  for (const biome of BIOME_DEFINITIONS) {
    const polygons = traceRegionBoundaries(cols, rows, (x, y) => biomeAt[y][x] === biome.id)
      .filter((loop) => signedPolygonArea(loop) > 0)
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: p.x * pixelsPerCellX, y: p.y * pixelsPerCellY })), 3))
      .filter((poly) => polygonArea(poly) >= MIN_CLIMATE_ZONE_AREA_FRACTION * totalPixelArea)
    for (const points of polygons) {
      usedBiomeIds.add(biome.id)
      climateZones.push({ id: idFactory(), climateTypeId: biome.id, points, generated: true })
    }
  }

  const climateTypes: ClimateType[] = BIOME_DEFINITIONS.filter((b) => usedBiomeIds.has(b.id)).map((b) => ({ id: b.id, name: b.name, color: b.color }))

  return { climateTypes, climateZones }
}
