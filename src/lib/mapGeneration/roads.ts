// Road network generation: connects a given set of settlement points with
// roads that actually follow cheap terrain rather than cutting straight
// lines through mountains — real Dijkstra pathfinding over the elevation
// grid (same terrainDifficulty cost elevation.ts/civilizations.ts use),
// then a minimum spanning tree over the settlements' pairwise path costs
// (plus a density dial for extra connections beyond the bare tree) decides
// which pairs actually get a road.
import { type Point } from '../mapGeometry'
import type { MapLine } from '../noteTypes/map'
import { computeElevationGrid, terrainDifficulty, type ElevationGridParams } from './elevation'

const NEIGHBOR_OFFSETS: Point[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

export interface RoadGenerationParams extends ElevationGridParams {
  seaLevel?: number
  roadLineTypeId?: string
  roadWidthPixels?: number
  // 0-1 — 0 connects settlements with only the bare minimum spanning tree
  // (a single connected road network, no redundancy); 1 adds roughly
  // twice as many extra connections on top for a denser mesh. Default 0.3.
  roadDensity?: number
}

// Single-source Dijkstra over land cells, cost = terrainDifficulty summed
// along the path — cheap enough at these grid sizes (a few thousand
// cells) to just run once per settlement rather than needing a fancier
// all-pairs algorithm.
function dijkstraFrom(
  source: Point,
  elevation: number[][],
  cols: number,
  rows: number,
  isLandCell: (x: number, y: number) => boolean
): { cost: number[][]; prev: (Point | null)[][] } {
  const cost: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity))
  const prev: (Point | null)[][] = Array.from({ length: rows }, () => new Array(cols).fill(null))
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false))
  if (!isLandCell(source.x, source.y)) return { cost, prev }
  cost[source.y][source.x] = 0
  const queue: { x: number; y: number; cost: number }[] = [{ x: source.x, y: source.y, cost: 0 }]
  while (queue.length > 0) {
    let minIndex = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[minIndex].cost) minIndex = i
    const current = queue.splice(minIndex, 1)[0]
    if (visited[current.y][current.x]) continue
    visited[current.y][current.x] = true
    for (const offset of NEIGHBOR_OFFSETS) {
      const nx = current.x + offset.x
      const ny = current.y + offset.y
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !isLandCell(nx, ny) || visited[ny][nx]) continue
      const newCost = current.cost + terrainDifficulty(elevation[ny][nx])
      if (newCost < cost[ny][nx]) {
        cost[ny][nx] = newCost
        prev[ny][nx] = { x: current.x, y: current.y }
        queue.push({ x: nx, y: ny, cost: newCost })
      }
    }
  }
  return { cost, prev }
}

function reconstructPath(prev: (Point | null)[][], from: Point, to: Point): Point[] {
  const path: Point[] = []
  let current: Point | null = to
  const maxSteps = prev.length * (prev[0]?.length ?? 1) + 1
  for (let step = 0; step < maxSteps && current; step++) {
    path.push(current)
    if (current.x === from.x && current.y === from.y) break
    current = prev[current.y][current.x]
  }
  path.reverse()
  return path
}

// Plain union-find (path-compressed) for Kruskal's minimum spanning tree.
class UnionFind {
  private parent: number[]
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(a: number, b: number): boolean {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return false
    this.parent[rootA] = rootB
    return true
  }
}

// settlements are pixel-space points (e.g. civilizations.ts's generated
// pins) — this module converts them to grid cells internally and never
// needs to know they're settlements specifically; any set of points works.
export function generateRoads(params: RoadGenerationParams, settlements: Point[], idFactory: () => string = () => crypto.randomUUID()): MapLine[] {
  const { seaLevel = 0.5, roadLineTypeId = 'road', roadWidthPixels = 6, roadDensity = 0.3 } = params
  if (settlements.length < 2) return []
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)
  const isLandCell = (x: number, y: number): boolean => x >= 0 && x < cols && y >= 0 && y < rows && elevation[y][x] >= seaLevel

  const cells: Point[] = settlements.map((s) => ({
    x: Math.min(cols - 1, Math.max(0, Math.floor(s.x / pixelsPerCellX))),
    y: Math.min(rows - 1, Math.max(0, Math.floor(s.y / pixelsPerCellY)))
  }))

  const dijkstraResults = cells.map((c) => dijkstraFrom(c, elevation, cols, rows, isLandCell))

  interface Candidate {
    a: number
    b: number
    cost: number
  }
  const candidates: Candidate[] = []
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const cost = dijkstraResults[a].cost[cells[b].y][cells[b].x]
      if (Number.isFinite(cost)) candidates.push({ a, b, cost })
    }
  }
  candidates.sort((x, y) => x.cost - y.cost)

  const unionFind = new UnionFind(cells.length)
  const chosen: Candidate[] = []
  const remaining: Candidate[] = []
  for (const candidate of candidates) {
    if (unionFind.union(candidate.a, candidate.b)) {
      chosen.push(candidate)
    } else {
      remaining.push(candidate)
    }
  }
  // remaining is already cost-sorted (filtered from the sorted candidates
  // list in order) — take the cheapest extras on top of the spanning tree.
  const extraCount = Math.round(roadDensity * chosen.length)
  chosen.push(...remaining.slice(0, extraCount))

  const roads: MapLine[] = []
  for (const { a, b } of chosen) {
    const gridPath = reconstructPath(dijkstraResults[a].prev, cells[a], cells[b])
    if (gridPath.length < 2) continue
    const points = gridPath.map((p) => ({ x: (p.x + 0.5) * pixelsPerCellX, y: (p.y + 0.5) * pixelsPerCellY }))
    roads.push({ id: idFactory(), lineTypeId: roadLineTypeId, points, widthPixels: roadWidthPixels, generated: true })
  }
  return roads
}
