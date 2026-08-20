// River generation: a standard single-flow-direction (D8-style) hydrology
// simulation over the same elevation field elevation.ts's landmasses come
// from — every river-eligible cell flows to whichever of its 8 neighbors is
// lowest, and "flow accumulation" (how much upstream area drains through a
// cell) builds up downhill. Cells whose accumulation crosses a threshold
// are rivers; each one is traced from its headwater down to the coast (or
// an interior low point — a landlocked basin) and emitted as a MapLine.
import { pointInPolygon, type Point } from '../mapGeometry'
import type { MapLine } from '../noteTypes/map'
import { computeElevationGrid, type ElevationGridParams } from './elevation'

export interface HydrologyGenerationParams extends ElevationGridParams {
  seaLevel?: number
  // 0-1 — higher means more, longer rivers (a lower flow-accumulation
  // threshold to qualify). Default 0.5.
  riverDensity?: number
  riverLineTypeId?: string
  riverWidthPixels?: number
  boundaryMask?: Point[] | null
}

const NEIGHBOR_OFFSETS: Point[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
]

// A river shorter than this many points is treated as noise (a stray
// one-cell trickle) rather than a real waterway worth drawing.
const MIN_RIVER_POINTS = 4

export function generateRivers(params: HydrologyGenerationParams, idFactory: () => string = () => crypto.randomUUID()): MapLine[] {
  const { seaLevel = 0.5, riverDensity = 0.5, riverLineTypeId = 'river', riverWidthPixels = 10, boundaryMask = null } = params
  const { values: elevation, cols, rows, pixelsPerCellX, pixelsPerCellY } = computeElevationGrid(params)

  const hasMask = boundaryMask !== null && boundaryMask.length >= 3
  const insideMask = (x: number, y: number): boolean => {
    if (!hasMask) return true
    const centerPx = { x: (x + 0.5) * pixelsPerCellX, y: (y + 0.5) * pixelsPerCellY }
    return pointInPolygon(centerPx, boundaryMask as Point[])
  }
  const isLandCell = (x: number, y: number): boolean => elevation[y][x] >= seaLevel && insideMask(x, y)

  // Steepest-descent flow direction for every land cell — the single
  // neighbor (8-connected) with the lowest elevation, or null if this cell
  // is already a local minimum (a landlocked basin's bottom). Deliberately
  // single-flow-direction (D8), not a multi-direction/D-infinity model —
  // simpler, and the stylized-map look this is going for doesn't need
  // hydrologically precise branching.
  const flowTarget: (Point | null)[][] = []
  for (let y = 0; y < rows; y++) {
    const row: (Point | null)[] = []
    for (let x = 0; x < cols; x++) {
      if (!isLandCell(x, y)) {
        row.push(null)
        continue
      }
      let best: Point | null = null
      let bestElevation = elevation[y][x]
      for (const offset of NEIGHBOR_OFFSETS) {
        const nx = x + offset.x
        const ny = y + offset.y
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
        if (elevation[ny][nx] < bestElevation) {
          bestElevation = elevation[ny][nx]
          best = { x: nx, y: ny }
        }
      }
      row.push(best)
    }
    flowTarget.push(row)
  }

  // Flow accumulation: process land cells from highest to lowest elevation
  // so that by the time a cell is processed, every cell that flows INTO it
  // has already contributed its own accumulation — a single downhill pass
  // is enough, no iteration to convergence needed (this is the standard
  // trick for D8 accumulation on a DAG — flow strictly decreases in
  // elevation, so there are no cycles to worry about).
  const accumulation: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(1))
  const landCellsHighToLow: Point[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isLandCell(x, y)) landCellsHighToLow.push({ x, y })
    }
  }
  landCellsHighToLow.sort((a, b) => elevation[b.y][b.x] - elevation[a.y][a.x])
  for (const { x, y } of landCellsHighToLow) {
    const target = flowTarget[y][x]
    if (target) accumulation[target.y][target.x] += accumulation[y][x]
  }

  // riverDensity=0 -> only the highest-accumulation drainage lines qualify
  // (few, long rivers); riverDensity=1 -> almost any land cell with more
  // than a couple of contributing neighbors qualifies (many, short
  // rivers). Scaled against the grid's TOTAL cell count (land + water), not
  // just land cells — a threshold scaled to total *land* area breaks on a
  // fragmented map (several separate smaller islands instead of one big
  // continent): no single island's own watershed could ever cross a
  // threshold sized for the combined land area of every island on the
  // map. Total grid cells is a fragmentation-independent yardstick, so the
  // same slider position behaves similarly whether the map is one
  // continent or a scattering of islands.
  const threshold = Math.max(2, Math.round(cols * rows * (0.02 - riverDensity * 0.018)))

  // A cell is a river SOURCE — the headwater to trace a path down from —
  // if it crosses the threshold but none of the neighbors that flow into
  // it already did. Without this, every single cell along an already-
  // traced river's course would independently start its own (fully
  // redundant, overlapping) path.
  const incomingCount: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (const { x, y } of landCellsHighToLow) {
    const target = flowTarget[y][x]
    if (target) incomingCount[target.y][target.x]++
  }
  const flowsInFromQualifying = (x: number, y: number): boolean => {
    for (const offset of NEIGHBOR_OFFSETS) {
      const nx = x + offset.x
      const ny = y + offset.y
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      if (!isLandCell(nx, ny)) continue
      const target = flowTarget[ny][nx]
      if (target && target.x === x && target.y === y && accumulation[ny][nx] >= threshold) return true
    }
    return false
  }

  const sources = landCellsHighToLow.filter(({ x, y }) => accumulation[y][x] >= threshold && !flowsInFromQualifying(x, y))
  // Trace the biggest drainage systems first — when two branches merge, the
  // one traced later stops at the merge point (visited) rather than
  // re-walking the shared trunk, so tracing trunks before their
  // tributaries gives the more sensible "long main river, short
  // tributaries feeding into it" result rather than the reverse.
  sources.sort((a, b) => accumulation[b.y][b.x] - accumulation[a.y][a.x])

  const visited = new Set<string>()
  const rivers: MapLine[] = []
  for (const source of sources) {
    const path: Point[] = []
    let current: Point | null = source
    for (let step = 0; step < rows * cols + 1 && current; step++) {
      const key = `${current.x},${current.y}`
      if (visited.has(key)) break
      visited.add(key)
      path.push({ x: (current.x + 0.5) * pixelsPerCellX, y: (current.y + 0.5) * pixelsPerCellY })
      current = current.x >= 0 && current.x < cols && current.y >= 0 && current.y < rows ? flowTarget[current.y][current.x] : null
    }
    if (path.length >= MIN_RIVER_POINTS) {
      rivers.push({ id: idFactory(), lineTypeId: riverLineTypeId, points: path, widthPixels: riverWidthPixels, generated: true })
    }
  }
  return rivers
}
