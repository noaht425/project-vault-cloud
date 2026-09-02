// City districts for the street-scale map (procedural map generation plan,
// Phase 7.2). Seeds one centre per *already-existing* settlement district
// inside the cityBoundary, grows the boundaries outward with the exact
// multi-source weighted flood-fill civilizations.ts uses for national
// territory, then traces the ownership grid into one polygon per district
// with contour.ts's traceRegionBoundaries — literally the territory
// pipeline, parameterised differently (different seed points, a light
// noise cost instead of terrainDifficulty, masked to the cityBoundary
// instead of a landmass).
//
// The polygons are written back onto the settlement's own District records
// by id (design decision 1 — one identity, not a parallel list). Each
// district also gets a default targetLotAreaPixels / streetDensity keyed
// off its name and the settlement's size tier (decisions 6 and 8), which
// Phases 7.3-7.4 read as the district's "personality".
//
// Pure and deterministic — same params always produce the same output.
import { pointInPolygon, polygonCentroid, boundingBoxOf, type Point } from '../mapGeometry'
import { deterministicFraction, hashSeed } from '../rng'
import { fractalNoise2D } from './noise'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'

const NEIGHBOR_OFFSETS: Point[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

export interface CityDistrictInput {
  id: string
  name: string
}

export interface CityDistrictGenerationParams {
  seed: number
  widthPixels: number
  heightPixels: number
  // The city footprint every district is carved out of — the same
  // boundaryMask mechanism as elevation/civilizations/roads. A city map
  // always has one by Phase 7.1.
  boundaryMask: Point[]
  // The settlement's existing districts, in order. One polygon comes back
  // per entry, matched by id.
  districts: CityDistrictInput[]
  // Canonical settlement size tier (hamlet/village/town/city/metropolis) —
  // scales the default lot area / street density (decision 8).
  gatingSizeId?: string
  // Optional pixel-space hints so a "Docks"/"Harbour" district seeds toward
  // water and a "Noble"/"Keep" district toward high ground. Plain points,
  // schema-decoupled like climate.ts's anchors. Absent = seed by scatter
  // alone.
  waterHintPoints?: Point[]
  highGroundHintPoints?: Point[]
  // Cells along the boundary's longer dimension. Default 84 — enough for a
  // few smooth districts, cheap at any city size.
  gridResolution?: number
}

export interface CityDistrictResult {
  id: string
  points: Point[]
  targetLotAreaPixels: number
  streetDensity: number
}

type DistrictKind = 'water' | 'high' | 'centre' | 'dense' | 'plain'

// Classify a district by name so its centre can be nudged toward matching
// geography and its lot/street defaults picked. Substring match, lower-
// cased — deliberately loose (a custom "Fisherman's Wharf" still reads as
// water) with a 'plain' catch-all.
function classifyDistrict(name: string): DistrictKind {
  const n = name.toLowerCase()
  if (/dock|harbou?r|wharf|quay|port|fish|pier|marina/.test(n)) return 'water'
  if (/nob|keep|castle|citadel|palace|upper|wealth|manor|garden|hill/.test(n)) return 'high'
  if (/market|government|civic|temple|old town|old-town|cathedral|forum|plaza/.test(n)) return 'centre'
  if (/slum|poor|tenement|shanty|warren|industr|craft|forge|tan/.test(n)) return 'dense'
  return 'plain'
}

const SIZE_STREET_SCALE: Record<string, number> = { hamlet: 0.7, village: 0.8, town: 0.9, city: 1, metropolis: 1.1 }
const SIZE_LOT_SCALE: Record<string, number> = { hamlet: 1.4, village: 1.2, town: 1, city: 0.85, metropolis: 0.7 }

function defaultsFor(kind: DistrictKind, gatingSizeId: string): { targetLotAreaPixels: number; streetDensity: number } {
  const baseLot = kind === 'high' ? 3000 : kind === 'dense' ? 550 : kind === 'water' || kind === 'centre' ? 950 : 1400
  const baseDensity = kind === 'dense' ? 0.8 : kind === 'high' ? 0.32 : kind === 'water' || kind === 'centre' ? 0.6 : 0.5
  const lotScale = SIZE_LOT_SCALE[gatingSizeId] ?? 1
  const densityScale = SIZE_STREET_SCALE[gatingSizeId] ?? 1
  return {
    targetLotAreaPixels: Math.round(baseLot * lotScale),
    streetDensity: Math.min(1, Math.max(0, baseDensity * densityScale))
  }
}

function nearestPoint(from: Point, candidates: Point[]): Point | null {
  let best: Point | null = null
  let bestD = Infinity
  for (const c of candidates) {
    const d = Math.hypot(c.x - from.x, c.y - from.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

export function generateCityDistricts(params: CityDistrictGenerationParams): CityDistrictResult[] {
  const { seed, boundaryMask, districts, gatingSizeId = 'town', gridResolution = 84 } = params
  if (districts.length === 0 || boundaryMask.length < 3) return []

  const bbox = boundingBoxOf(boundaryMask)
  if (bbox.width <= 0 || bbox.height <= 0) return []

  const longer = Math.max(bbox.width, bbox.height)
  const cols = Math.max(6, Math.round((bbox.width / longer) * gridResolution))
  const rows = Math.max(6, Math.round((bbox.height / longer) * gridResolution))
  const pxPerColX = bbox.width / cols
  const pxPerColY = bbox.height / rows
  const cellCentrePx = (x: number, y: number): Point => ({ x: bbox.x + (x + 0.5) * pxPerColX, y: bbox.y + (y + 0.5) * pxPerColY })
  const inCity = (x: number, y: number): boolean =>
    x >= 0 && x < cols && y >= 0 && y < rows && pointInPolygon(cellCentrePx(x, y), boundaryMask)

  const cityCentroid = polygonCentroid(boundaryMask)
  // The boundary vertex farthest from the centroid stands in for "high
  // ground / the edge of town" when no real elevation hint is supplied.
  const farVertex = boundaryMask.reduce((far, p) =>
    Math.hypot(p.x - cityCentroid.x, p.y - cityCentroid.y) > Math.hypot(far.x - cityCentroid.x, far.y - cityCentroid.y) ? p : far
  , boundaryMask[0])

  // Snap an arbitrary pixel point to the nearest in-city cell (bounded ring
  // search out from its own cell). Falls back to scanning every cell if the
  // rings miss (a very thin boundary), and to (0,0) only if the whole grid
  // is somehow outside the mask.
  const snapToCity = (px: Point): { x: number; y: number } => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((px.x - bbox.x) / pxPerColX)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((px.y - bbox.y) / pxPerColY)))
    if (inCity(cx, cy)) return { x: cx, y: cy }
    for (let r = 1; r < Math.max(cols, rows); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          if (inCity(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy }
        }
      }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (inCity(x, y)) return { x, y }
    return { x: 0, y: 0 }
  }

  // Stratified scatter across the bbox (ceil(sqrt(n)) partitions, jittered
  // deterministically), then nudged toward matching geography by district
  // kind, then snapped into the city. Same "spread out, don't cluster,
  // still look organic" shape as elevation.ts's placeContinentCenters.
  const partitions = Math.ceil(Math.sqrt(districts.length))
  const seeds = districts.map((district, i) => {
    const px = i % partitions
    const py = Math.floor(i / partitions)
    const jx = deterministicFraction(hashSeed(seed, i, 1)) * 2 - 1
    const jy = deterministicFraction(hashSeed(seed, i, 2)) * 2 - 1
    let sx = bbox.x + ((px + 0.5) / partitions + (jx * 0.4) / partitions) * bbox.width
    let sy = bbox.y + ((py + 0.5) / partitions + (jy * 0.4) / partitions) * bbox.height

    // A themed district gravitates toward its feature, but never all the
    // way — the stratified start is kept as a spread term so two docks
    // districts (North/South Docks) still fan out along the waterfront
    // rather than stacking on one point. 'centre' pulls only weakly because
    // several districts (markets, government, temple, old town) share it.
    const kind = classifyDistrict(district.name)
    let target: Point | null = null
    let pull = 0
    if (kind === 'water') {
      target = nearestPoint({ x: sx, y: sy }, params.waterHintPoints ?? boundaryMask)
      pull = 0.8
    } else if (kind === 'high') {
      target = nearestPoint({ x: sx, y: sy }, params.highGroundHintPoints ?? [farVertex])
      pull = 0.8
    } else if (kind === 'centre') {
      target = cityCentroid
      pull = 0.3
    }
    if (target) {
      sx += (target.x - sx) * pull
      sy += (target.y - sy) * pull
    }
    return snapToCity({ x: sx, y: sy })
  })

  // Multi-source Dijkstra, cost per step = 1 + a little seeded noise so the
  // borders between districts wander instead of being straight bisectors.
  const cost: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity))
  const owner: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1))
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false))
  const queue: { x: number; y: number; cost: number; ownerId: number }[] = []
  seeds.forEach((s, i) => {
    // Later seeds win a tie on an identical cell, so every district keeps at
    // least its own seed cell and therefore always traces to a polygon.
    cost[s.y][s.x] = 0
    owner[s.y][s.x] = i
    queue.push({ x: s.x, y: s.y, cost: 0, ownerId: i })
  })

  const stepCost = (x: number, y: number): number => 1 + 0.7 * fractalNoise2D(seed + 4177, x, y, { octaves: 3, scale: Math.max(4, gridResolution * 0.22) })

  while (queue.length > 0) {
    let minIndex = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[minIndex].cost) minIndex = i
    const current = queue.splice(minIndex, 1)[0]
    if (visited[current.y][current.x]) continue
    visited[current.y][current.x] = true
    for (const offset of NEIGHBOR_OFFSETS) {
      const nx = current.x + offset.x
      const ny = current.y + offset.y
      if (!inCity(nx, ny) || visited[ny][nx]) continue
      const next = current.cost + stepCost(nx, ny)
      if (next < cost[ny][nx]) {
        cost[ny][nx] = next
        owner[ny][nx] = current.ownerId
        queue.push({ x: nx, y: ny, cost: next, ownerId: current.ownerId })
      }
    }
  }

  return districts.map((district, i) => {
    const polygons = traceRegionBoundaries(cols, rows, (x, y) => owner[y][x] === i)
      .filter((loop) => signedPolygonArea(loop) > 0)
      .map((loop) => smoothPolygon(loop.map((p) => ({ x: bbox.x + p.x * pxPerColX, y: bbox.y + p.y * pxPerColY })), 2))
    // Keep only the largest connected piece — a district that got split by
    // the flood fill reads as one place, and the schema is single-ring.
    const largest = polygons.sort((a, b) => polygonArea(b) - polygonArea(a))[0] ?? [cellCentrePx(seeds[i].x, seeds[i].y)]
    const kind = classifyDistrict(district.name)
    return { id: district.id, points: largest, ...defaultsFor(kind, gatingSizeId) }
  })
}
