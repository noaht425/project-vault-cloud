// Traces the boundary of a region on a grid of cells into closed polygons —
// shared by elevation.ts (landmass coastlines, mountain-range outlines) and
// reusable later for climate biome zones (Phase 2).
//
// Deliberately NOT interpolated marching squares (the "textbook" way to
// contour a scalar field): that needs a 16-case edge-crossing lookup table
// with two genuinely ambiguous saddle cases, which is easy to get subtly
// wrong and hard to unit-test with confidence. Instead: every "inside" cell
// contributes its 4 unit-square edges in a fixed winding order; an edge
// shared by two inside cells is interior and cancels against its neighbor's
// opposite-direction copy of the same edge; whatever's left over IS the
// boundary, with no case analysis at all. The tradeoff is a blockier,
// grid-aligned outline instead of a smoothly interpolated one —
// smoothPolygon() below (Chaikin corner-cutting) fixes that cheaply as a
// separate pass, rather than baking smoothing into the tracer itself.
import type { Point } from '../mapGeometry'

function pointKey(p: Point): string {
  return `${p.x},${p.y}`
}

// One closed loop per connected component of "inside" cells, in grid-cell
// units (0..cols, 0..rows) — the caller scales to pixel space, including
// blobs that touch only diagonally (see the outgoing-edges handling
// below). A fully enclosed "hole" (e.g. a lake surrounded by land) also
// produces its own loop here, wound the opposite way from an outer
// boundary; this module doesn't try to associate a hole with its
// containing loop (the existing MapLandmass/MapZone schemas are
// single-ring, v1) — callers typically filter tiny loops by area anyway,
// which catches most small holes as a side effect.
export function traceRegionBoundaries(cols: number, rows: number, isInside: (x: number, y: number) => boolean): Point[][] {
  // Each entry: the edge FROM this point TO the mapped point, in the
  // winding direction the owning cell contributed it in.
  const edgeFrom = new Map<string, Point>()
  const reverseExists = new Set<string>()

  function addEdge(a: Point, b: Point): void {
    const key = pointKey(a)
    // A cell's own 4 edges are already distinct from each other (they share
    // only endpoints, not full edges), so this only ever collides with a
    // NEIGHBORING cell's edge in the same direction, which can't happen on
    // a proper grid — safe to just set.
    edgeFrom.set(`${key}->${pointKey(b)}`, b)
    void a
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isInside(x, y)) continue
      // Fixed clockwise winding (image coordinates, y down): top-left ->
      // top-right -> bottom-right -> bottom-left -> top-left. Two adjacent
      // inside cells always traverse their shared edge in OPPOSITE
      // directions (each "owns" it from its own side), which is exactly
      // what makes the cancellation below work.
      const corners: Point[] = [
        { x, y },
        { x: x + 1, y },
        { x: x + 1, y: y + 1 },
        { x, y: y + 1 }
      ]
      for (let i = 0; i < 4; i++) {
        addEdge(corners[i], corners[(i + 1) % 4])
      }
    }
  }

  for (const key of edgeFrom.keys()) {
    const [fromStr, toStr] = key.split('->')
    reverseExists.add(`${toStr}->${fromStr}`)
  }

  // Boundary edges are exactly the ones with no opposite-direction
  // counterpart — an interior edge between two inside cells always has
  // both directions present (each cell contributed its own side), so it's
  // excluded; an edge on the outside of the region has only one direction.
  //
  // Kept as a list per starting point, not a single value: at a corner
  // where two inside cells touch only DIAGONALLY (a checkerboard corner),
  // two genuinely different boundary edges start at the same point — one
  // per diagonal blob. Collapsing to a single edge there (an earlier
  // version of this function did, via plain Map.set overwriting) corrupts
  // the walk below into a single bogus loop instead of two correct ones;
  // confirmed via generateTerrain's own tests producing an impossible
  // "landmass" covering the entire grid before this fix.
  const outgoing = new Map<string, Point[]>()
  let boundaryEdgeCount = 0
  for (const [key, to] of edgeFrom) {
    const fromStr = key.split('->')[0]
    if (edgeFrom.has(`${to.x},${to.y}->${fromStr}`)) continue // interior, cancels
    if (!outgoing.has(fromStr)) outgoing.set(fromStr, [])
    outgoing.get(fromStr)!.push(to)
    boundaryEdgeCount++
  }

  const loops: Point[][] = []
  for (const [startKey, candidates] of outgoing) {
    // A diagonal-touch point can be the start of more than one loop (one
    // per blob meeting there) — keep tracing new loops from this point
    // until its candidate list is exhausted, not just once.
    while (candidates.length > 0) {
      const loop: Point[] = []
      let currentKey = startKey
      // A malformed/degenerate input (shouldn't happen for a well-formed
      // isInside predicate over a finite grid) could otherwise loop
      // forever — bounded by the total edge count as a hard safety valve.
      for (let step = 0; step < boundaryEdgeCount + 1; step++) {
        const list = outgoing.get(currentKey)
        if (!list || list.length === 0) break // dead end — shouldn't happen for a well-formed boundary
        const next = list.shift()! // consume this specific directed edge, not the whole point
        const [xStr, yStr] = currentKey.split(',')
        loop.push({ x: Number(xStr), y: Number(yStr) })
        currentKey = pointKey(next)
        if (currentKey === startKey) break // closed the loop
      }
      if (loop.length >= 3) loops.push(loop)
      else break // avoid spinning if something degenerate is left dangling
    }
  }
  return loops
}

// Shoelace formula, signed — traceRegionBoundaries's fixed per-cell winding
// means an outer boundary always comes out with the SAME sign, while a
// fully-enclosed hole (a lake inside land, or any water pocket that
// doesn't reach the region's own outer edge) always comes out with the
// OPPOSITE sign, empirically positive-for-outer/negative-for-hole for this
// module's winding convention. This is what callers should filter on to
// discard holes rather than emitting them as their own phantom
// landmass/zone — plain absolute-value area alone can't tell a large lake
// apart from a large real landmass.
export function signedPolygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

// Unsigned area — used to filter noise-speck loops (tiny islands) below a
// minimum size rather than emitting every last artifact as its own
// landmass/zone. Does NOT distinguish an outer boundary from a hole (see
// signedPolygonArea for that) — most call sites want both checks.
export function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points))
}

// Chaikin corner-cutting: each iteration replaces every edge with two
// points 1/4 and 3/4 along it, which rounds off the grid-aligned right
// angles traceRegionBoundaries produces into a much more natural-looking
// coastline. Purely cosmetic — never changes topology (loop stays closed,
// no new components), so it's safe to run after area-filtering rather than
// before.
export function smoothPolygon(points: Point[], iterations = 3): Point[] {
  let current = points
  for (let iter = 0; iter < iterations; iter++) {
    if (current.length < 3) return current
    const next: Point[] = []
    for (let i = 0; i < current.length; i++) {
      const a = current[i]
      const b = current[(i + 1) % current.length]
      next.push({ x: a.x + (b.x - a.x) * 0.25, y: a.y + (b.y - a.y) * 0.25 })
      next.push({ x: a.x + (b.x - a.x) * 0.75, y: a.y + (b.y - a.y) * 0.75 })
    }
    current = next
  }
  return current
}
