// Terrain generation: builds an elevation field from noise, then converts
// it straight into the map's EXISTING landmass/zone schema (see the
// procedural map generation plan's core design decision #1 — elevation
// itself is never stored, only the seed/params that reproduce it and the
// vector output derived from it).
import { pointInPolygon, type Point } from '../mapGeometry'
import type { MapLandmass, MapZone } from '../noteTypes/map'
import { fractalNoise2D } from './noise'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'

export interface TerrainGenerationParams {
  seed: number
  widthPixels: number
  heightPixels: number
  // Cells along the map's longer dimension — the elevation grid's actual
  // resolution. Higher = finer coastline detail but more compute. Default
  // 48 is enough detail for a fantasy-map-style coastline at typical map
  // sizes without being slow.
  gridResolution?: number
  // 0-1. Relative size of continent-scale features — smaller values
  // produce more, smaller landmasses; larger values produce fewer, bigger
  // ones. This is the "how fragmented" dial from the design conversation,
  // expressed as a noise feature-size rather than a literal continent
  // count (noise doesn't naturally produce an exact count without
  // clustering heuristics this doesn't attempt). Default 0.35.
  landmassScale?: number
  // 0-1 elevation threshold — cells at or above this are land. Higher
  // means more ocean. Default 0.5.
  seaLevel?: number
  // 0-1 — how much of already-high land becomes mountainous. Default 0.35.
  mountainDensity?: number
  // 0-1 — amplitude of the extra ridged noise layer that carves mountain
  // ranges into already-high land. Default 0.5.
  mountainRuggedness?: number
  // Which terrainTypes entry generated mountain zones should reference —
  // the map's own terrainTypes array isn't this module's concern (it's
  // pure elevation math, no note-schema awareness beyond the output
  // shape), so the caller resolves/creates the right id and passes it in.
  // Defaults to 'mountains', matching noteTypes/map.ts's
  // defaultTerrainTypes() seeded id.
  mountainTerrainTypeId?: string
  // Constrains generation inside an existing polygon (pixel space) instead
  // of inventing a new coastline — used for both "augment my hand-drawn
  // map" (Phase 5) and "drill into a selected region" (Phase 6). Cells
  // outside the mask are always treated as water/non-mountainous. Null
  // (default) generates freely across the whole canvas.
  boundaryMask?: Point[] | null
}

export interface TerrainGenerationResult {
  landmasses: MapLandmass[]
  mountainZones: MapZone[]
}

// Loops smaller than this fraction of the total map area are treated as
// noise (a single stray high cell, or a sliver "hole") rather than a real
// landmass/mountain range worth surfacing as its own note-visible shape.
// Mountain zones use the SAME threshold as landmasses, not a smaller one —
// every mountain cell is by construction also a land cell (isMountainCell
// requires isLandCell), so a mountain zone's area can never exceed its
// containing landmass's area. A smaller mountain threshold would let a
// small island that's entirely mountainous pass the mountain filter while
// its identically-sized landmass fails the (larger) landmass filter,
// producing an "orphaned" mountain zone with no land underneath it at all.
const MIN_LANDMASS_AREA_FRACTION = 0.002
const MIN_MOUNTAIN_AREA_FRACTION = MIN_LANDMASS_AREA_FRACTION
const MOUNTAIN_ELEVATION_THRESHOLD = 0.8
// Elevation band over which the ridged mountain layer fades in — below
// HIGHLAND_START it contributes nothing (no peaks springing up in open
// ocean or on low plains), between the two bounds it ramps up linearly,
// at/above HIGHLAND_END it's fully present.
const HIGHLAND_START = 0.55
const HIGHLAND_END = 0.85

function smoothstepBetween(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function generateTerrain(params: TerrainGenerationParams, idFactory: () => string = () => crypto.randomUUID()): TerrainGenerationResult {
  const {
    seed,
    widthPixels,
    heightPixels,
    gridResolution = 48,
    landmassScale = 0.35,
    seaLevel = 0.5,
    mountainDensity = 0.35,
    mountainRuggedness = 0.5,
    mountainTerrainTypeId = 'mountains',
    boundaryMask = null
  } = params

  const longerDimension = Math.max(widthPixels, heightPixels, 1)
  const cols = Math.max(4, Math.round((widthPixels / longerDimension) * gridResolution))
  const rows = Math.max(4, Math.round((heightPixels / longerDimension) * gridResolution))
  const pixelsPerCellX = widthPixels / cols
  const pixelsPerCellY = heightPixels / rows

  // Base continent shape (low frequency) plus a higher-frequency ridged
  // layer, the latter only contributing on already-elevated land (see
  // smoothstepBetween/HIGHLAND_*) so mountains read as "ranges carved into
  // highlands" rather than isolated spikes anywhere elevation happens to
  // roll high.
  const featureScale = Math.max(1, gridResolution * landmassScale)
  const elevation: number[][] = []
  for (let y = 0; y < rows; y++) {
    const row: number[] = []
    for (let x = 0; x < cols; x++) {
      const base = fractalNoise2D(seed, x, y, { scale: featureScale, octaves: 5 })
      const ridge = fractalNoise2D(seed + 7919, x, y, { scale: featureScale * 0.25, octaves: 4 })
      const highlandFactor = smoothstepBetween(HIGHLAND_START, HIGHLAND_END, base)
      row.push(base + ridge * mountainRuggedness * mountainDensity * highlandFactor)
    }
    elevation.push(row)
  }

  const hasMask = boundaryMask !== null && boundaryMask.length >= 3
  const insideMask = (x: number, y: number): boolean => {
    if (!hasMask) return true
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return pointInPolygon(centerPx, boundaryMask as Point[])
  }
  const isLandCell = (x: number, y: number): boolean => elevation[y][x] >= seaLevel && insideMask(x, y)
  const isMountainCell = (x: number, y: number): boolean => isLandCell(x, y) && elevation[y][x] >= MOUNTAIN_ELEVATION_THRESHOLD

  const totalPixelArea = widthPixels * heightPixels

  function toPixelPolygons(isInside: (x: number, y: number) => boolean, minAreaFraction: number): Point[][] {
    return traceRegionBoundaries(cols, rows, isInside)
      // A hole (e.g. a lake fully enclosed by land) always winds opposite
      // to an outer boundary — see signedPolygonArea. Without this, a
      // large enough enclosed water pocket would survive the area filter
      // below and get emitted as its own landmass/mountain-zone-shaped-
      // like-a-lake, which is exactly backwards.
      .filter((loop) => signedPolygonArea(loop) > 0)
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: p.x * pixelsPerCellX, y: p.y * pixelsPerCellY })), 2))
      .filter((poly) => polygonArea(poly) >= minAreaFraction * totalPixelArea)
  }

  const landmassPolygons = toPixelPolygons(isLandCell, MIN_LANDMASS_AREA_FRACTION)
  const mountainPolygons = toPixelPolygons(isMountainCell, MIN_MOUNTAIN_AREA_FRACTION)

  const landmasses: MapLandmass[] = landmassPolygons.map((points, i) => ({
    id: idFactory(),
    name: landmassPolygons.length === 1 ? 'The Continent' : `Landmass ${i + 1}`,
    points,
    generated: true
  }))

  const mountainZones: MapZone[] = mountainPolygons.map((points) => ({
    id: idFactory(),
    terrainTypeId: mountainTerrainTypeId,
    points,
    generated: true
  }))

  return { landmasses, mountainZones }
}
