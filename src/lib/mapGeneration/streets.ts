// The one genuinely new algorithm in the city-scale map (procedural map
// generation plan, Phase 7.3). Real streets aren't a sparse point-to-point
// tree like roads.ts's kingdom network — they're a space-filling branching
// network — so this grows one:
//
//  1. Spines: from every point where an external road crosses the city
//     boundary, a wide street runs inward toward a central anchor (the
//     market/keep). With no external roads, spines fan out from the anchor.
//  2. Secondary streets: bounded organic branching off the spines — each
//     tip sprouts a segment in a semi-random (but seed-deterministic)
//     direction, branches at intervals (more often in a dense district,
//     less in a spacious one), and terminates on hitting another street,
//     the boundary, or water. Every count is hard-capped up front from the
//     settlement's size tier (decision 8), so the worst case is bounded
//     and known — this is a heuristic, never an open-ended simulation.
//  3. Blocks: the finished street graph is rasterised as impassable on a
//     fine grid, the gaps are flood-filled, and contour.ts traces them
//     into polygons — the same tool landmasses / territories / districts
//     use, third reuse. Blocks aren't persisted (Phase 7.4 re-derives them
//     for lot subdivision); they're returned here so tests can check them.
//
// Every proposed segment that would cross an existing one is clipped to the
// crossing point instead, so the output never contains an "X" without a
// node at it. Pure and deterministic.
import { boundingBoxOf, pointInPolygon, polygonCentroid, type Point } from '../mapGeometry'
import { generatePlaceName, resolvePlaceNameStyle } from '../placeNames'
import { deterministicFraction, hashSeed } from '../rng'
import { polygonArea, signedPolygonArea, smoothPolygon, traceRegionBoundaries } from './contour'

export interface StreetDistrictInput {
  id: string
  points: Point[]
  // 0-1 (from districts.ts / decision 6). Higher = shorter blocks and more
  // frequent branching in this district.
  streetDensity: number
}

export interface StreetGenerationParams {
  seed: number
  widthPixels: number
  heightPixels: number
  // The hard outer limit — no street segment is ever placed outside it.
  boundaryMask: Point[]
  // District polygons + their street-density personality. A tip outside
  // every district falls back to `defaultStreetDensity`.
  districts?: StreetDistrictInput[]
  defaultStreetDensity?: number
  // Where external roads enter the city (pixel points on/near the
  // boundary). Empty = spines fan out from the anchor instead.
  entryPoints?: Point[]
  // The point spines head toward — a market square / keep. Defaults to the
  // boundary centroid.
  anchor?: Point
  // Thin corridor polygons a street must not cross (rivers, a harbour) —
  // optional; streets clip to their edge like they do to the boundary.
  waterPolygons?: Point[][]
  // Canonical settlement size tier — scales every budget below. Unknown =
  // 'town'.
  gatingSizeId?: string
  // Which placeNames.ts style flavours the street names — null = a random
  // style, same convention as civilizations.ts.
  namingStyleId?: string | null
  // Cells along the longer boundary dimension for the block-tracing grid.
  // Default 150.
  blockGridResolution?: number
}

export interface GeneratedStreet {
  points: Point[]
  name: string | null
  isSpine: boolean
}

export interface StreetGenerationResult {
  streets: GeneratedStreet[]
  blocks: Point[][]
}

interface Budget {
  spineStep: number
  spineMaxSteps: number
  branchStep: number
  maxSegments: number
  maxIterations: number
  maxGeneration: number
}

// Every field is a hard ceiling — see the module comment. A hamlet is cheap
// by construction (few segments allowed), a metropolis expensive but still
// finite.
const BUDGETS: Record<string, Budget> = {
  hamlet: { spineStep: 26, spineMaxSteps: 10, branchStep: 20, maxSegments: 60, maxIterations: 600, maxGeneration: 2 },
  village: { spineStep: 30, spineMaxSteps: 16, branchStep: 22, maxSegments: 160, maxIterations: 1600, maxGeneration: 3 },
  town: { spineStep: 34, spineMaxSteps: 22, branchStep: 24, maxSegments: 380, maxIterations: 3800, maxGeneration: 4 },
  city: { spineStep: 38, spineMaxSteps: 30, branchStep: 26, maxSegments: 850, maxIterations: 8500, maxGeneration: 5 },
  metropolis: { spineStep: 42, spineMaxSteps: 40, branchStep: 28, maxSegments: 1700, maxIterations: 17000, maxGeneration: 6 }
}

const STREET_SUFFIXES = ['Street', 'Lane', 'Road', 'Row', 'Way', 'Walk', 'Rise', 'Close', 'Alley', 'Path']
const SPINE_NAMES = ['High Street', 'Market Street', 'Great Road', 'King Street', 'Main Street', 'Cross Street', 'Broad Way']

interface Seg {
  a: Point
  b: Point
}

const EPS = 1e-6

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Proper intersection point of segments a1->a2 and b1->b2, strictly inside
// both (parametric t and u in (EPS, 1-EPS)), or null. The open interval
// means two segments that merely share an endpoint don't count as crossing.
function properIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < EPS) return null
  const dx = b1.x - a1.x
  const dy = b1.y - a1.y
  const t = (dx * d2y - dy * d2x) / denom
  const u = (dx * d1y - dy * d1x) / denom
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null
  return { x: a1.x + t * d1x, y: a1.y + t * d1y }
}

// Where segment from->to first leaves `polygon` (the nearest edge crossing
// to `from`), or null if it never does.
function polygonExit(from: Point, to: Point, polygon: Point[]): Point | null {
  let best: Point | null = null
  let bestD = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const hit = properIntersection(from, to, polygon[i], polygon[(i + 1) % polygon.length])
    if (hit) {
      const d = dist(from, hit)
      if (d < bestD) {
        bestD = d
        best = hit
      }
    }
  }
  return best
}

export function generateStreets(params: StreetGenerationParams): StreetGenerationResult {
  const {
    seed,
    widthPixels,
    heightPixels,
    boundaryMask,
    districts = [],
    defaultStreetDensity = 0.5,
    entryPoints = [],
    waterPolygons = [],
    gatingSizeId = 'town',
    namingStyleId = null,
    blockGridResolution = 150
  } = params
  if (boundaryMask.length < 3) return { streets: [], blocks: [] }

  const budget = BUDGETS[gatingSizeId] ?? BUDGETS.town
  const anchor = params.anchor ?? polygonCentroid(boundaryMask)

  let counter = 0
  const rand = (): number => deterministicFraction(hashSeed(seed, counter++))

  const densityAt = (p: Point): number => {
    for (const d of districts) if (d.points.length >= 3 && pointInPolygon(p, d.points)) return d.streetDensity
    return defaultStreetDensity
  }

  const segments: Seg[] = []
  // One polyline per growth chain — a spine or a single branch. `name` is
  // filled in after growth.
  const streets: { points: Point[]; isSpine: boolean }[] = []

  // Try to advance `from` by `step` along `dir` (radians). Applies every
  // terminate/clip rule and, if the step survives, records the segment.
  // Returns the next tip position, or null if the chain ends here.
  const advance = (streetIdx: number, from: Point, dir: number, step: number): Point | null => {
    if (segments.length >= budget.maxSegments) return null
    let to: Point = { x: from.x + Math.cos(dir) * step, y: from.y + Math.sin(dir) * step }
    let terminate = false

    // Leaves the city, or crosses water -> clip to that edge and stop.
    if (!pointInPolygon(to, boundaryMask)) {
      const exit = polygonExit(from, to, boundaryMask)
      if (!exit) return null
      to = exit
      terminate = true
    }
    for (const water of waterPolygons) {
      const hit = polygonExit(from, to, water)
      if (hit && dist(from, hit) < dist(from, to)) {
        to = hit
        terminate = true
      }
    }

    // Crosses an existing street -> clip to the nearest crossing (a
    // T-junction) and stop, so the output never has an unmarked "X". A
    // bounding-box reject keeps this near-linear as the network grows
    // (most segments are nowhere near the candidate).
    const loX = Math.min(from.x, to.x)
    const hiX = Math.max(from.x, to.x)
    const loY = Math.min(from.y, to.y)
    const hiY = Math.max(from.y, to.y)
    let nearestCross: Point | null = null
    let nearestCrossD = Infinity
    for (const s of segments) {
      if (Math.max(s.a.x, s.b.x) < loX || Math.min(s.a.x, s.b.x) > hiX || Math.max(s.a.y, s.b.y) < loY || Math.min(s.a.y, s.b.y) > hiY) continue
      // Skip the segment we just grew from (shares `from`).
      if (dist(s.a, from) < EPS || dist(s.b, from) < EPS) continue
      const hit = properIntersection(from, to, s.a, s.b)
      if (hit) {
        const d = dist(from, hit)
        if (d < nearestCrossD) {
          nearestCrossD = d
          nearestCross = hit
        }
      }
    }
    if (nearestCross) {
      to = nearestCross
      terminate = true
    }

    if (dist(from, to) < step * 0.2) return null // degenerate stub — drop it
    segments.push({ a: from, b: to })
    streets[streetIdx].points.push(to)
    return terminate ? null : to
  }

  // ---- 1. Spines --------------------------------------------------------
  // Inbound: a wide street from an external road's entry point that curves
  // in toward the anchor and stops near it. Outbound (used only when the
  // city has no external roads): the same street run in reverse, fanning
  // out from the anchor until it hits the boundary.
  const spineStarts: { pos: Point; dir: number; inbound: boolean }[] =
    entryPoints.length > 0
      ? entryPoints.map((p) => ({ pos: p, dir: Math.atan2(anchor.y - p.y, anchor.x - p.x), inbound: true }))
      : Array.from({ length: 4 }, (_, i) => ({ pos: anchor, dir: (i / 4) * Math.PI * 2 + rand() * 0.4, inbound: false }))

  for (const start of spineStarts) {
    const idx = streets.push({ points: [start.pos], isSpine: true }) - 1
    let pos: Point | null = start.pos
    let dir = start.dir
    for (let s = 0; s < budget.spineMaxSteps && pos; s++) {
      if (start.inbound) {
        // Gently curve toward the anchor while it's still far, so spines
        // actually converge on the centre instead of shooting past it.
        if (dist(pos, anchor) <= budget.spineStep * 1.2) break // reached the centre
        const toAnchor = Math.atan2(anchor.y - pos.y, anchor.x - pos.x)
        dir = dir + Math.max(-0.4, Math.min(0.4, Math.atan2(Math.sin(toAnchor - dir), Math.cos(toAnchor - dir)))) + (rand() - 0.5) * 0.25
      } else {
        // Fan outward, mild wander, let advance() stop us at the boundary.
        dir = dir + (rand() - 0.5) * 0.2
      }
      pos = advance(idx, pos, dir, budget.spineStep)
    }
  }

  // ---- 2. Secondary branching ----------------------------------------
  interface Tip {
    streetIdx: number
    pos: Point
    dir: number
    generation: number
  }
  const queue: Tip[] = []
  // Seed branch tips at intervals along every spine, alternating sides.
  for (const street of streets) {
    for (let i = 1; i < street.points.length; i++) {
      const p = street.points[i]
      const prev = street.points[i - 1]
      const along = Math.atan2(p.y - prev.y, p.x - prev.x)
      const side = i % 2 === 0 ? 1 : -1
      const branchIdx = streets.push({ points: [p], isSpine: false }) - 1
      queue.push({ streetIdx: branchIdx, pos: p, dir: along + (side * Math.PI) / 2 + (rand() - 0.5) * 0.3, generation: 1 })
    }
  }

  let iterations = 0
  while (queue.length > 0 && iterations < budget.maxIterations && segments.length < budget.maxSegments) {
    iterations++
    const tip = queue.shift() as Tip
    const density = densityAt(tip.pos)
    // Denser district -> shorter blocks.
    const step = budget.branchStep * (1.3 - 0.6 * density)
    const wander = (rand() - 0.5) * 0.5
    const next = advance(tip.streetIdx, tip.pos, tip.dir + wander, step)
    if (!next) continue

    // Carry on straight...
    queue.push({ streetIdx: tip.streetIdx, pos: next, dir: tip.dir + wander, generation: tip.generation })
    // ...and maybe throw off a perpendicular branch. Probability falls with
    // generation and rises with district density; nothing branches past
    // maxGeneration, which is what actually bounds the tree's depth.
    if (tip.generation < budget.maxGeneration) {
      const branchProb = (0.28 + 0.35 * density) * Math.pow(0.62, tip.generation - 1)
      if (rand() < branchProb) {
        const side = rand() < 0.5 ? 1 : -1
        const bIdx = streets.push({ points: [next], isSpine: false }) - 1
        queue.push({ streetIdx: bIdx, pos: next, dir: tip.dir + (side * Math.PI) / 2 + (rand() - 0.5) * 0.4, generation: tip.generation + 1 })
      }
    }
  }

  // ---- Names ----------------------------------------------------------
  let spineCount = 0
  const named: GeneratedStreet[] = streets
    .filter((s) => s.points.length >= 2)
    .map((s, i) => {
      if (s.isSpine) {
        const name = SPINE_NAMES[spineCount++ % SPINE_NAMES.length]
        return { points: s.points, name, isSpine: true }
      }
      // Short stubs stay nameless (alleys); everything else gets a
      // place-flavoured root + a suffix, chosen deterministically.
      const length = s.points.reduce((sum, p, k) => (k === 0 ? 0 : sum + dist(p, s.points[k - 1])), 0)
      if (length < budget.branchStep * 1.4) return { points: s.points, name: null, isSpine: false }
      const root = placeRoot(namingStyleId, () => deterministicFraction(hashSeed(seed, 7000 + i, spineCount)))
      const suffix = STREET_SUFFIXES[Math.floor(deterministicFraction(hashSeed(seed, 8000 + i)) * STREET_SUFFIXES.length)]
      return { points: s.points, name: `${root} ${suffix}`, isSpine: false }
    })

  // ---- 3. Blocks ----------------------------------------------------
  const blocks = traceBlocks(named.map((s) => s.points), boundaryMask, widthPixels, heightPixels, blockGridResolution)

  return { streets: named, blocks }
}

// A place-flavoured root word for a street name — placeNames.ts is already
// a mapGeneration dependency (see civilizations.ts).
function placeRoot(styleId: string | null | undefined, rng: () => number): string {
  return generatePlaceName(resolvePlaceNameStyle(styleId ?? null), rng)
}

// Rasterise the street polylines as walls on a fine grid (plus everything
// outside the boundary), flood-fill the open cells into components, and
// trace each into a polygon — contour.ts's grid-to-polygon pipeline, same
// as landmasses / territories / districts.
export function traceBlocks(
  streetPolylines: Point[][],
  boundaryMask: Point[],
  widthPixels: number,
  heightPixels: number,
  gridResolution = 150
): Point[][] {
  if (boundaryMask.length < 3) return []
  const bbox = boundingBoxOf(boundaryMask)
  if (bbox.width <= 0 || bbox.height <= 0) return []
  const longer = Math.max(bbox.width, bbox.height)
  const cols = Math.max(8, Math.round((bbox.width / longer) * gridResolution))
  const rows = Math.max(8, Math.round((bbox.height / longer) * gridResolution))
  const pxX = bbox.width / cols
  const pxY = bbox.height / rows
  const cellCentre = (x: number, y: number): Point => ({ x: bbox.x + (x + 0.5) * pxX, y: bbox.y + (y + 0.5) * pxY })

  const wall: boolean[][] = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => !pointInPolygon(cellCentre(x, y), boundaryMask))
  )
  // Mark every cell a street segment passes through (DDA-ish walk), plus a
  // one-cell dilation so blocks don't leak into each other through a
  // diagonal gap.
  const markCell = (cx: number, cy: number): void => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) wall[ny][nx] = true
      }
  }
  for (const line of streetPolylines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const steps = Math.max(1, Math.ceil(dist(a, b) / Math.min(pxX, pxY)))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const px = a.x + (b.x - a.x) * t
        const py = a.y + (b.y - a.y) * t
        markCell(Math.floor((px - bbox.x) / pxX), Math.floor((py - bbox.y) / pxY))
      }
    }
  }

  const totalArea = widthPixels * heightPixels
  return traceRegionBoundaries(cols, rows, (x, y) => x >= 0 && x < cols && y >= 0 && y < rows && !wall[y][x])
    .filter((loop) => signedPolygonArea(loop) > 0)
    .map((loop) => smoothPolygon(loop.map((p) => ({ x: bbox.x + p.x * pxX, y: bbox.y + p.y * pxY })), 1))
    .filter((poly) => polygonArea(poly) >= 0.0004 * totalArea)
}
