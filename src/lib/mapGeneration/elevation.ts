// Terrain generation: builds an elevation field from noise, then converts
// it straight into the map's EXISTING landmass/zone schema (see the
// procedural map generation plan's core design decision #1 — elevation
// itself is never stored, only the seed/params that reproduce it and the
// vector output derived from it).
import { pointInPolygon, type Point } from '../mapGeometry'
import type { MapLandmass, MapZone } from '../noteTypes/map'
import { deterministicFraction, hashSeed } from '../rng'
import { fractalNoise2D } from './noise'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'

export interface ElevationGridParams {
  seed: number
  widthPixels: number
  heightPixels: number
  // Cells along the map's longer dimension — the elevation grid's actual
  // resolution. Higher = finer coastline detail but more compute. Default
  // 96 balances a natural-looking coastline (each grid-aligned "step" the
  // tracer produces is small enough that smoothPolygon's corner-cutting
  // reads as organic curves rather than a visible staircase — 48 produced
  // a noticeably blocky coastline at typical map sizes) against staying
  // fast at typical map sizes.
  gridResolution?: number
  // 0-1. Relative size of continent-scale features — smaller values
  // produce more, smaller landmasses; larger values produce fewer, bigger
  // ones. This is the "how fragmented" dial from the design conversation,
  // expressed as a noise feature-size rather than a literal continent
  // count (noise doesn't naturally produce an exact count without
  // clustering heuristics this doesn't attempt). Default 0.35.
  landmassScale?: number
  // 0-1 — how much of already-high land becomes mountainous. Default 0.35.
  mountainDensity?: number
  // 0-1 — amplitude of the extra ridged noise layer that carves mountain
  // ranges into already-high land. Default 0.5.
  mountainRuggedness?: number
  // False (default) reproduces every prior release's behavior: land can
  // reach any edge of the canvas, appropriate for a map that's meant to
  // depict just a cropped section of a larger landmass (e.g. a kingdom-
  // scale drilldown). True instead treats the canvas as a self-contained
  // world: land is pulled toward ocean with increasing distance from
  // continentCount seeded landmass centers (see islandMaskAt), so every
  // edge reliably ends up water regardless of what the raw noise says —
  // without this, a "whole world" map looked indistinguishable from an
  // arbitrary crop of a bigger continent, since nothing ever told the
  // generator the canvas edges were supposed to mean anything.
  edgesAreOcean?: boolean
  // How many separate landmass centers to seed when edgesAreOcean is true
  // (ignored otherwise). Default 1. Same caveat as landmassScale — this is
  // a strong bias toward that many separate landmasses, not a hard
  // guarantee (two nearby centers' masks can still merge into one
  // landmass, and a very high seaLevel can still starve one down to
  // nothing), for the same reason landmassScale can't guarantee an exact
  // count either: noise-based generation shapes probability, not literal
  // topology.
  continentCount?: number
}

export interface ElevationGrid {
  // [row][col] — NOT clamped to exactly [0,1] (base + a scaled ridge layer
  // can run slightly over 1 at extreme param values); every threshold
  // compared against it (seaLevel, MOUNTAIN_ELEVATION_THRESHOLD, a future
  // climate module's own bands) uses this same raw scale consistently, so
  // the lack of clamping never matters in practice.
  values: number[][]
  cols: number
  rows: number
  pixelsPerCellX: number
  pixelsPerCellY: number
}

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

interface ContinentCenter extends Point {
  radius: number
}

// Scatters `count` landmass centers (in grid-cell units) across a roughly
// even ceil(sqrt(count)) x ceil(sqrt(count)) partition of the grid — each
// starts at its own partition's center, then wanders by at most 15% of
// referenceRadius — stratified sampling, not pure-random placement, so N
// centers stay reasonably spread out instead of occasionally clustering
// into one corner (which plain per-center random coordinates would risk for
// a small N). Deterministic from the seed, same reproducibility guarantee
// as everything else here.
//
// Jitter is scaled to referenceRadius (not to partition size) deliberately:
// an earlier version jittered within the middle 60% of the WHOLE partition,
// which for a single continent (one partition = the entire canvas) could
// wander close enough to a corner that islandMaskAt never fully faded out
// along the OPPOSITE edges — confirmed by a failing test asserting every
// edge cell reads below sea level. Tying the wander distance to
// referenceRadius instead guarantees the same edge-fades-to-ocean margin
// regardless of continentCount.
//
// Each center also gets its OWN radius, 80%-120% of referenceRadius —
// without this, every continent at a given continentCount came out an
// identical size (confirmed: several generated world maps all showed
// uniform, near-perfectly-circular landmasses, every one the exact same
// size, since they all shared one global radius with zero per-continent
// variation). Kept fairly tight (not e.g. +/-50%) because the worst-case
// combination of max position jitter AND max radius both landing in the
// same unlucky direction still has to stay inside referenceRadius's own
// edge-safety margin (see computeElevationGrid's 0.3 factor) — the two
// jitter amounts are sized together, not independently.
function placeContinentCenters(seed: number, count: number, cols: number, rows: number, referenceRadius: number): ContinentCenter[] {
  const partitionSize = Math.ceil(Math.sqrt(count))
  const partitionWidth = cols / partitionSize
  const partitionHeight = rows / partitionSize
  const jitterAmount = referenceRadius * 0.15
  const centers: ContinentCenter[] = []
  for (let i = 0; i < count; i++) {
    const partitionX = i % partitionSize
    const partitionY = Math.floor(i / partitionSize)
    const partitionCenterX = (partitionX + 0.5) * partitionWidth
    const partitionCenterY = (partitionY + 0.5) * partitionHeight
    const jitterX = deterministicFraction(hashSeed(seed, i, 1)) * 2 - 1
    const jitterY = deterministicFraction(hashSeed(seed, i, 2)) * 2 - 1
    const radiusJitter = deterministicFraction(hashSeed(seed, i, 3))
    centers.push({
      x: partitionCenterX + jitterX * jitterAmount,
      y: partitionCenterY + jitterY * jitterAmount,
      radius: referenceRadius * (0.8 + radiusJitter * 0.4)
    })
  }
  return centers
}

// 1 at/near a landmass center, smoothly fading to 0 by the time a cell is
// that center's own `radius` grid-cells away — multiplied straight into the
// raw noise elevation (see computeElevationGrid), the standard "island
// mask" technique: it preserves the noise's own texture near a continent's
// core while guaranteeing elevation collapses toward ocean far from all of
// them, including every canvas edge. Takes the nearest center's
// contribution only (not a sum) so two separate continents' masks don't
// stack into implausibly high terrain in the gap between them.
function islandMaskAt(point: Point, centers: ContinentCenter[]): number {
  let strongest = 0
  for (const center of centers) {
    const distance = Math.hypot(point.x - center.x, point.y - center.y) / center.radius
    const mask = 1 - smoothstepBetween(0.55, 1, distance)
    if (mask > strongest) strongest = mask
  }
  return strongest
}

// Builds the raw elevation field noise-based generation starts from —
// factored out of generateTerrain so hydrology.ts and climate.ts can build
// the EXACT same field (same seed + same params always reproduces it
// identically, being a pure function) rather than each independently
// re-deriving a subtly different one. Deliberately never persisted
// anywhere — see the procedural map generation plan's core design
// decision #1 — every caller recomputes it fresh from params each time.
export function computeElevationGrid(params: ElevationGridParams): ElevationGrid {
  const {
    seed,
    widthPixels,
    heightPixels,
    gridResolution = 96,
    landmassScale = 0.35,
    mountainDensity = 0.35,
    mountainRuggedness = 0.5,
    edgesAreOcean = false,
    continentCount = 1
  } = params

  const longerDimension = Math.max(widthPixels, heightPixels, 1)
  const cols = Math.max(4, Math.round((widthPixels / longerDimension) * gridResolution))
  const rows = Math.max(4, Math.round((heightPixels / longerDimension) * gridResolution))
  const pixelsPerCellX = widthPixels / cols
  const pixelsPerCellY = heightPixels / rows

  // Only computed when actually needed — every existing caller (edgesAreOcean
  // omitted/false) skips this entirely and generates exactly as it always
  // has. referenceRadius shrinks as continentCount grows so N landmasses
  // can each get their own reasonably-sized region instead of every mask
  // blanketing the whole grid regardless of count. The 0.3 factor (rather
  // than half the available space) leaves enough margin that even the
  // worst case — maximum position jitter AND maximum per-center radius
  // (see placeContinentCenters) landing in the same direction at once —
  // still fades to 0 comfortably before the canvas edge, not right at it.
  const referenceRadius = (0.3 * Math.min(cols, rows)) / Math.sqrt(Math.max(1, continentCount))
  const continentCenters = edgesAreOcean ? placeContinentCenters(seed, Math.max(1, continentCount), cols, rows, referenceRadius) : []

  // Base continent shape (low frequency) plus a higher-frequency ridged
  // layer, the latter only contributing on already-elevated land (see
  // smoothstepBetween/HIGHLAND_*) so mountains read as "ranges carved into
  // highlands" rather than isolated spikes anywhere elevation happens to
  // roll high.
  //
  // In world mode, noise detail scales to a FRACTION of one continent's own
  // radius, not the whole canvas — otherwise a single noise "blob" easily
  // spans an entire continent's mask with no room left for coastline
  // variation inside it, so the mask's own smooth circular falloff ends up
  // being the only thing visibly shaping the landmass (confirmed: every
  // generated world map showed uniform, near-perfectly-circular
  // continents, all the same size, regardless of continentCount — the
  // noise was providing essentially zero texture at that scale). Section
  // mode (edgesAreOcean off) is unaffected and keeps its original
  // whole-canvas-relative scale.
  const noiseBaseSize = edgesAreOcean ? referenceRadius * 0.5 : gridResolution
  const featureScale = Math.max(1, noiseBaseSize * landmassScale)
  const values: number[][] = []
  for (let y = 0; y < rows; y++) {
    const row: number[] = []
    for (let x = 0; x < cols; x++) {
      const base = fractalNoise2D(seed, x, y, { scale: featureScale, octaves: 5 })
      // Multiplied in BEFORE the ridge/highland layer, so mountains only
      // ever carve into land the mask already committed to keeping — never
      // right at a continent's own fading-to-ocean edge.
      const maskedBase = edgesAreOcean ? base * islandMaskAt({ x, y }, continentCenters) : base
      const ridge = fractalNoise2D(seed + 7919, x, y, { scale: featureScale * 0.25, octaves: 4 })
      const highlandFactor = smoothstepBetween(HIGHLAND_START, HIGHLAND_END, maskedBase)
      row.push(maskedBase + ridge * mountainRuggedness * mountainDensity * highlandFactor)
    }
    values.push(row)
  }

  return { values, cols, rows, pixelsPerCellX, pixelsPerCellY }
}

export interface TerrainGenerationParams extends ElevationGridParams {
  // 0-1 elevation threshold — cells at or above this are land. Higher
  // means more ocean. Default 0.5.
  seaLevel?: number
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
// Exported so other generators (civilizations.ts's settlement-site scoring
// and territory-growth cost, roads.ts's pathing cost) agree with elevation.ts
// on exactly what counts as "mountainous" rather than each redefining a
// slightly different cutoff.
export const MOUNTAIN_ELEVATION_THRESHOLD = 0.8

// A simple three-band cost-to-cross multiplier derived from elevation
// alone — shared by civilizations.ts's territory-growth flood fill and
// roads.ts's pathfinding, so a mountain range costs the same to expand
// across as it does to build a road across (matching mapGeometry.ts's own
// "terrain has a speedMultiplier" idea, just expressed as elevation-driven
// difficulty instead of a painted zone's own value, since generation runs
// before any zone exists to look up).
export function terrainDifficulty(elevationValue: number): number {
  if (elevationValue >= MOUNTAIN_ELEVATION_THRESHOLD) return 4
  if (elevationValue >= 0.65) return 2
  return 1
}

export function generateTerrain(params: TerrainGenerationParams, idFactory: () => string = () => crypto.randomUUID()): TerrainGenerationResult {
  const { widthPixels, heightPixels, seaLevel = 0.5, mountainTerrainTypeId = 'mountains', boundaryMask = null } = params
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)

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
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: p.x * pixelsPerCellX, y: p.y * pixelsPerCellY })), 3))
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
