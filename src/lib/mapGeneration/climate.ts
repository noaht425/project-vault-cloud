// Biome/climate generation: classifies every land cell into a biome from
// latitude-derived temperature, a second noise field for base moisture
// (rain-shadowed by mountains relative to a prevailing wind direction), and
// elevation (very high land reads as alpine regardless of latitude) — then
// traces each biome's cells into zone polygons the same way elevation.ts
// traces landmasses/mountains.
import { pointInPolygon, type Point } from '../mapGeometry'
import type { ClimateType, ClimateZone } from '../noteTypes/map'
import { fractalNoise2D } from './noise'
import { computeElevationGrid, type ElevationGridParams } from './elevation'
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
    boundaryMask = null
  } = params
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)

  const hasMask = boundaryMask !== null && boundaryMask.length >= 3
  const insideMask = (x: number, y: number): boolean => {
    if (!hasMask) return true
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return pointInPolygon(centerPx, boundaryMask as Point[])
  }
  const isLandCell = (x: number, y: number): boolean => elevation[y][x] >= seaLevel && insideMask(x, y)

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
      const moisture = Math.max(0, Math.min(1, baseMoisture * shadow))
      const temperature = Math.max(0, Math.min(1, (temperatureAt(y) + 1) / 2))
      row.push(classifyBiome(temperature, moisture, elevation[y][x]))
    }
    biomeAt.push(row)
  }

  const totalPixelArea = widthPixels * heightPixels
  const climateZones: ClimateZone[] = []
  const usedBiomeIds = new Set<BiomeId>()

  for (const biome of BIOME_DEFINITIONS) {
    const polygons = traceRegionBoundaries(cols, rows, (x, y) => biomeAt[y][x] === biome.id)
      .filter((loop) => signedPolygonArea(loop) > 0)
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: p.x * pixelsPerCellX, y: p.y * pixelsPerCellY })), 2))
      .filter((poly) => polygonArea(poly) >= MIN_CLIMATE_ZONE_AREA_FRACTION * totalPixelArea)
    for (const points of polygons) {
      usedBiomeIds.add(biome.id)
      climateZones.push({ id: idFactory(), climateTypeId: biome.id, points, generated: true })
    }
  }

  const climateTypes: ClimateType[] = BIOME_DEFINITIONS.filter((b) => usedBiomeIds.has(b.id)).map((b) => ({ id: b.id, name: b.name, color: b.color }))

  return { climateTypes, climateZones }
}
