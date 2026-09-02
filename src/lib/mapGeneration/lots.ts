// Block -> lots (procedural map generation plan, Phase 7.4). Recursive
// longest-axis subdivision of a city block down to roughly a district's
// targetLotAreaPixels, each leaf inset for a street-facing gap / yard, one
// rectangle per lot. Rectangles (not arbitrary polygons — decision 4) are
// cheap to make, cheap to render, and detailed enough at any zoom the map
// is still legible as a map; a rotationDegrees lets a lot hug an angled
// block without a real polygon.
//
// Pure and deterministic.
import { boundingBoxOf, pointInPolygon, type Point } from '../mapGeometry'
import { deterministicFraction, hashSeed } from '../rng'

// Same shape as noteTypes/settlement.ts's building `footprint` — x/y are
// the CENTRE, rotationDegrees rotates about it.
export interface LotRect {
  x: number
  y: number
  width: number
  height: number
  rotationDegrees: number
}

export interface BlockSubdivisionOptions {
  seed?: number
  // Gap left around every lot for street frontage / a yard, in pixels.
  // Default 3.
  streetInsetPixels?: number
  // Stop splitting once a cell is within this factor of the target area.
  // >1 so lots come out around the target, not way under it. Default 1.35
  // — low enough that a block actually subdivides down to roughly
  // one-building lots rather than leaving half the town without a plot.
  splitStopFactor?: number
  // Hard recursion-depth bound (safety, independent of area). Default 9.
  maxDepth?: number
}

// Length-weighted circular mean of the block's edge directions, folded into
// [0, PI/2) since a rectangle has 90-degree symmetry — the angle to align
// lots to so they sit square to the block's dominant frontage.
function dominantEdgeAngle(poly: Point[]): number {
  let sx = 0
  let sy = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-6) continue
    const theta = Math.atan2(b.y - a.y, b.x - a.x)
    // Period PI/2 -> multiply the angle by 4 before averaging as a vector.
    sx += len * Math.cos(4 * theta)
    sy += len * Math.sin(4 * theta)
  }
  if (sx === 0 && sy === 0) return 0
  const mean = Math.atan2(sy, sx) / 4
  return ((mean % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
}

export function subdivideBlock(block: Point[], targetLotAreaPixels: number, opts: BlockSubdivisionOptions = {}): LotRect[] {
  if (block.length < 3 || !(targetLotAreaPixels > 0)) return []
  const { seed = 1, streetInsetPixels = 3, splitStopFactor = 1.35, maxDepth = 9 } = opts

  const angle = dominantEdgeAngle(block)
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  // Rotate a point into the block's own frame (by -angle) and back.
  const toLocal = (p: Point): Point => ({ x: p.x * cosA + p.y * sinA, y: -p.x * sinA + p.y * cosA })
  const toWorld = (p: Point): Point => ({ x: p.x * cosA - p.y * sinA, y: p.x * sinA + p.y * cosA })

  const bb = boundingBoxOf(block.map(toLocal))
  if (bb.width <= 2 || bb.height <= 2) return []

  const rotationDegrees = (angle * 180) / Math.PI
  const out: LotRect[] = []
  let counter = 0
  const rand = (): number => deterministicFraction(hashSeed(seed, counter++))

  const recurse = (x0: number, y0: number, w: number, h: number, depth: number): void => {
    if (w * h <= targetLotAreaPixels * splitStopFactor || depth >= maxDepth || Math.min(w, h) <= streetInsetPixels * 3) {
      const iw = w - 2 * streetInsetPixels
      const ih = h - 2 * streetInsetPixels
      if (iw <= 1 || ih <= 1) return
      const centre = toWorld({ x: x0 + w / 2, y: y0 + h / 2 })
      // The rotated bounding box overshoots a non-rectangular block, so a
      // lot whose centre lands outside the actual block is dropped rather
      // than placed in dead space.
      if (!pointInPolygon(centre, block)) return
      out.push({ x: centre.x, y: centre.y, width: iw, height: ih, rotationDegrees })
      return
    }
    // Split the longer axis, with a little deterministic jitter so lots
    // aren't all identical.
    const ratio = 0.5 + (rand() - 0.5) * 0.3
    if (w >= h) {
      const left = w * ratio
      recurse(x0, y0, left, h, depth + 1)
      recurse(x0 + left, y0, w - left, h, depth + 1)
    } else {
      const top = h * ratio
      recurse(x0, y0, w, top, depth + 1)
      recurse(x0, y0 + top, w, h - top, depth + 1)
    }
  }
  recurse(bb.x, bb.y, bb.width, bb.height, 0)
  return out
}
