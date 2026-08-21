// Civilization placement: chooses settlement sites (favoring coasts,
// rivers, and flat land, kept apart by a minimum spacing) and grows
// territory boundaries outward from each civilization's capital — a
// multi-source weighted flood fill where every land cell is claimed by
// whichever capital's expanding frontier reaches it at the lowest
// accumulated cost, the same "terrain has a cost to cross" idea
// mapGeometry.ts's trip calculator already uses, so mountain ranges
// naturally tend to become slow-to-expand-across border regions rather
// than being crossed for free.
import { pointInPolygon, type Point } from '../mapGeometry'
import type { MapPin, Territory } from '../noteTypes/map'
import { computeElevationGrid, terrainDifficulty, MOUNTAIN_ELEVATION_THRESHOLD, type ElevationGridParams } from './elevation'
import { computeFlowAccumulation } from './hydrology'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'
import { generatePlaceName, PLACE_NAME_STYLES } from '../placeNames'
import { deterministicFraction, hashSeed } from '../rng'

const NEIGHBOR_OFFSETS: Point[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

export interface CivilizationGenerationParams extends ElevationGridParams {
  seaLevel?: number
  // How many separate nations to place. Default 3.
  civilizationCount?: number
  // Total settlements across every civilization, INCLUDING each one's
  // capital. Default 9 (3 per civilization at the default count).
  settlementCount?: number
  territoryMinAreaFraction?: number
  boundaryMask?: Point[] | null
}

export interface CivilizationGenerationResult {
  pins: MapPin[]
  territories: Territory[]
}

const MIN_TERRITORY_AREA_FRACTION = 0.003

// Settlement/nation naming, via placeNames.ts's syllable-synthesis engine —
// each civilization gets a naming style cycling deterministically through
// PLACE_NAME_STYLES by civilization index (same "cycle by index" shape as
// the territory hue below), so first-generation output already sounds
// distinct per nation without any configuration. The style is stored on the
// territory (namingStyleId) so the Civilizations panel can show/override it
// afterward, and so "Generate settlement from pin"/a per-pin regenerate
// action can resolve the same style later.
function civilizationNamingStyle(civIndex: number) {
  return PLACE_NAME_STYLES[civIndex % PLACE_NAME_STYLES.length]
}

function placeName(seed: number, index: number, styleId: string): string {
  const style = PLACE_NAME_STYLES.find((s) => s.id === styleId) ?? null
  let counter = 0
  const rng = (): number => deterministicFraction(hashSeed(seed, index, counter++))
  return generatePlaceName(style, rng)
}

export function generateCivilizations(params: CivilizationGenerationParams, idFactory: () => string = () => crypto.randomUUID()): CivilizationGenerationResult {
  const { seed, widthPixels, heightPixels, seaLevel = 0.5, civilizationCount = 3, settlementCount = 9, territoryMinAreaFraction = MIN_TERRITORY_AREA_FRACTION, boundaryMask = null } = params
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)
  // Same "constrain to an existing/selected polygon instead of the whole
  // canvas" mechanism as elevation.ts's own insideMask (Phase 5: augment/
  // drilldown) — this field existed on CivilizationGenerationParams since
  // Phase 3 but was never actually wired into isLandCell, so "augment
  // inside this landmass" silently placed settlements/territory anywhere on
  // the map. Fixed here rather than left for a later phase since it's the
  // same bug class Phase 5 exists to close.
  const hasMask = boundaryMask !== null && boundaryMask.length >= 3
  const insideMask = (x: number, y: number): boolean => {
    if (!hasMask) return true
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return pointInPolygon(centerPx, boundaryMask as Point[])
  }
  const isLandCell = (x: number, y: number): boolean => x >= 0 && x < cols && y >= 0 && y < rows && elevation[y][x] >= seaLevel && insideMask(x, y)
  const isCoastal = (x: number, y: number): boolean => NEIGHBOR_OFFSETS.some((o) => !isLandCell(x + o.x, y + o.y))

  const { accumulation } = computeFlowAccumulation(elevation, cols, rows, isLandCell)
  const maxAccumulation = Math.max(1, ...accumulation.flat())

  // Higher is better: coastal access and river access are both strong
  // positives (real settlements cluster there for trade/water/farmland);
  // mountainous ground is a strong negative (hard to build a city on a
  // peak); everything else is a mild positive so ties don't all land on
  // the coast specifically.
  function siteScore(x: number, y: number): number {
    if (!isLandCell(x, y)) return -Infinity
    let score = 1
    if (isCoastal(x, y)) score += 3
    score += Math.min(3, (accumulation[y][x] / maxAccumulation) * 6)
    if (elevation[y][x] >= MOUNTAIN_ELEVATION_THRESHOLD) score -= 5
    return score
  }

  const landCells: Point[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (isLandCell(x, y)) landCells.push({ x, y })

  if (landCells.length === 0) return { pins: [], territories: [] }

  const gridDiagonal = Math.hypot(cols, rows)
  const capitalMinSpacing = gridDiagonal / (civilizationCount + 1)
  const settlementMinSpacing = capitalMinSpacing / 3

  function farthestAllowedPick(candidates: Point[], placed: Point[], minSpacing: number): Point | null {
    const eligible = candidates.filter((c) => placed.every((p) => Math.hypot(c.x - p.x, c.y - p.y) >= minSpacing))
    const pool = eligible.length > 0 ? eligible : candidates
    let best: Point | null = null
    let bestScore = -Infinity
    for (const c of pool) {
      const score = siteScore(c.x, c.y)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    return best
  }

  // Capitals placed first (with the largest spacing requirement) so
  // civilizations start well-separated; regular settlements fill in after,
  // closer together, but never on top of an existing settlement.
  const capitals: Point[] = []
  for (let i = 0; i < civilizationCount && capitals.length < landCells.length; i++) {
    const pick = farthestAllowedPick(landCells, capitals, capitalMinSpacing)
    if (pick) capitals.push(pick)
  }

  const allSettlements: Point[] = [...capitals]
  const remainingSlots = Math.max(0, settlementCount - capitals.length)
  for (let i = 0; i < remainingSlots && allSettlements.length < landCells.length; i++) {
    const pick = farthestAllowedPick(landCells, allSettlements, settlementMinSpacing)
    if (pick) allSettlements.push(pick)
  }

  // Territory growth: multi-source Dijkstra from every capital
  // simultaneously, weighted by terrainDifficulty — the "min-cost frontier
  // reaches this cell first" cell is claimed by that capital's owner id.
  // Grid sizes here (a few thousand cells) are small enough that a plain
  // linear scan for the next-closest frontier cell is fast in practice;
  // not worth a binary-heap priority queue for this problem size.
  const cost: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity))
  const owner: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1))
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false))
  const queue: { x: number; y: number; cost: number; ownerId: number }[] = capitals.map((c, i) => ({ x: c.x, y: c.y, cost: 0, ownerId: i }))
  for (const c of capitals) cost[c.y][c.x] = 0
  capitals.forEach((c, i) => (owner[c.y][c.x] = i))

  while (queue.length > 0) {
    let minIndex = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[minIndex].cost) minIndex = i
    const current = queue.splice(minIndex, 1)[0]
    if (visited[current.y][current.x]) continue
    visited[current.y][current.x] = true
    for (const offset of NEIGHBOR_OFFSETS) {
      const nx = current.x + offset.x
      const ny = current.y + offset.y
      if (!isLandCell(nx, ny) || visited[ny][nx]) continue
      const newCost = current.cost + terrainDifficulty(elevation[ny][nx])
      if (newCost < cost[ny][nx]) {
        cost[ny][nx] = newCost
        owner[ny][nx] = current.ownerId
        queue.push({ x: nx, y: ny, cost: newCost, ownerId: current.ownerId })
      }
    }
  }

  const totalPixelArea = widthPixels * heightPixels
  const territories: Territory[] = []
  const capitalPinIds: string[] = capitals.map(() => idFactory())

  for (let civIndex = 0; civIndex < capitals.length; civIndex++) {
    const polygons = traceRegionBoundaries(cols, rows, (x, y) => owner[y][x] === civIndex)
      .filter((loop) => signedPolygonArea(loop) > 0)
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: p.x * pixelsPerCellX, y: p.y * pixelsPerCellY })), 2))
      .filter((poly) => polygonArea(poly) >= territoryMinAreaFraction * totalPixelArea)

    const namingStyle = civilizationNamingStyle(civIndex)
    const capitalName = placeName(seed, civIndex, namingStyle.id)
    // Spaced evenly around the color wheel by civilization index — a fixed
    // saturation/lightness keeps every territory looking like a "tint",
    // not competing in brightness with the terrain/climate layers already
    // rendered underneath it.
    const hue = Math.round((360 / Math.max(1, capitals.length)) * civIndex)
    const color = `hsl(${hue}, 45%, 45%)`
    for (const points of polygons) {
      territories.push({
        id: idFactory(),
        name: `Kingdom of ${capitalName}`,
        points,
        color,
        presetNoteTitle: null,
        capitalPinId: capitalPinIds[civIndex],
        namingStyleId: namingStyle.id,
        generated: true
      })
    }
  }

  const pins: MapPin[] = allSettlements.map((site, i) => {
    const isCapital = i < capitals.length
    const civIndex = isCapital ? i : (owner[site.y][site.x] >= 0 ? owner[site.y][site.x] : 0)
    const namingStyleId = civilizationNamingStyle(civIndex).id
    const name = isCapital ? placeName(seed, civIndex, namingStyleId) : placeName(seed, capitals.length + i, namingStyleId)
    return {
      id: isCapital ? capitalPinIds[civIndex] : idFactory(),
      x: (site.x + 0.5) * pixelsPerCellX,
      y: (site.y + 0.5) * pixelsPerCellY,
      locationTitle: null,
      label: name,
      // Explicit rather than null — a non-capital pin whose owning cell
      // isn't actually claimed by any territory (owner < 0, falls back to
      // civ 0 above) should still record which style actually named it,
      // rather than leaving namingStyleId null (which would mean "inherit
      // the containing territory" — misleading if it isn't really inside
      // one).
      namingStyleId,
      generated: true
    }
  })

  return { pins, territories }
}
