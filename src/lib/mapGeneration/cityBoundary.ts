// A single settlement's outer footprint for the city-scale street map
// (procedural map generation plan, Phase 7.1). Reuses elevation.ts's
// island-mask idea — a smooth base shape perturbed by fractal noise so the
// edge reads as organically grown rather than a drawn circle or a
// noise-textured square — but expressed as a *radial* polygon: one vertex
// per sampled angle around the settlement centre, radius = base * (nearby-
// geography stretch) * (1 + noise * irregularity), plus ribbon lobes along
// any road leaving town.
//
// Radial-from-a-centre (a "star-shaped" polygon) is deliberate: as long as
// the sampled angles strictly increase and every radius stays positive the
// result can't self-intersect, so the boundary is always a valid single-
// ring polygon — the same guarantee every later step (districts, streets,
// blocks, lots) needs of the mask it generates inside. The trade-off is
// that a "ribbon" along a road is a pulled-out lobe rather than a truly
// narrow corridor; at the zoom a city map is legible, that reads the same
// and keeps the simple-polygon guarantee.
//
// Pure and deterministic — same params always produce the same points.
// Nothing here is persisted except the returned polygon (plan decision 9).
import type { Point } from '../mapGeometry'
import { fractalNoise2D } from './noise'
import { smoothPolygon } from './contour'

export interface CityBoundaryParams {
  seed: number
  widthPixels: number
  heightPixels: number
  // Settlement centre. Defaults to the canvas centre — Phase 7.6 drives it
  // from the settlement's own pin instead.
  center?: Point
  // Base (un-perturbed) radius of the footprint. Defaults to a fraction of
  // the smaller canvas dimension; always clamped so the blob can't spill
  // off the canvas even at full irregularity + elongation.
  radiusPixels?: number
  // 0-1 (decision 7). How hard noise perturbs the base shape: low = a
  // clean, near-circular planned footprint; high = a rough, multi-lobed
  // organically-grown sprawl. Default 0.5.
  boundaryIrregularity?: number
  // A walled town gets a smoother, more convex edge (real fortification
  // lines don't wander) and no road ribbons — nothing grows outside the
  // wall. Default false. Echoed back on the result so the caller can store
  // it alongside the points.
  walled?: boolean
  // Optional stretch of the base shape toward nearby geography a caller
  // already knows about (a river or coastline from the parent map) —
  // `angleRadians` is the direction to elongate along, `strength` (0-1) how
  // much. Passed as plain numbers so this module never imports the note
  // schema, same decoupling as climate.ts's `anchors`. Null = round base.
  elongation?: { angleRadians: number; strength: number } | null
  // Bearings (radians, measured from `center`) of any road already leaving
  // the settlement. An unwalled town grows a ribbon lobe outward along each
  // — real ribbon development along trade routes. Ignored when walled.
  roadExitBearings?: number[]
  // Vertices sampled around the ring before Chaikin smoothing. Default 160.
  sampleCount?: number
}

export interface CityBoundaryResult {
  points: Point[]
  walled: boolean
}

// Base radius never exceeds this fraction of a canvas half-dimension, so
// even a fully-irregular, fully-elongated, ribbon-extended blob stays on
// the canvas.
const MAX_RADIUS_FRACTION = 0.42
// Radius of the circle walked through 2-D noise space to get the ring's
// wobble — small enough that only a few big lobes fit around the ring (so
// high irregularity reads as "multi-lobed sprawl", not fine fuzz), and
// walked as a true circle so the perturbation is seamless where the ring
// closes.
const NOISE_RING_RADIUS = 2.6
// Half-width (radians) of a road ribbon lobe's angular falloff.
const RIBBON_ANGULAR_HALF_WIDTH = 0.28

function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

// Smallest absolute angular difference between two bearings, in [0, PI].
function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

export function generateCityBoundary(params: CityBoundaryParams): CityBoundaryResult {
  const {
    seed,
    widthPixels,
    heightPixels,
    center = { x: widthPixels / 2, y: heightPixels / 2 },
    boundaryIrregularity = 0.5,
    walled = false,
    elongation = null,
    roadExitBearings = [],
    sampleCount = 160
  } = params

  const irregularity = Math.min(1, Math.max(0, boundaryIrregularity))
  const maxRadius = MAX_RADIUS_FRACTION * Math.min(widthPixels, heightPixels)
  const baseRadius = Math.min(params.radiusPixels ?? 0.34 * Math.min(widthPixels, heightPixels), maxRadius)

  // A wall doesn't wander: much less noise, and each vertex later pulled
  // partway toward the mean radius (a circle is the limit of that pull) for
  // a convex-hull-ish edge. An unwalled town keeps the full wobble and
  // grows ribbons instead.
  const wobbleAmplitude = irregularity * (walled ? 0.2 : 0.6)
  const ribbonLength = walled ? 0 : baseRadius * 0.4

  const rawRadii: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    const theta = (i / sampleCount) * Math.PI * 2

    // Elongation: an ellipse-ish stretch up to (1 + strength) along the
    // given axis, 1 across it. cos^2 keeps it symmetric (both ends stretch).
    let radius = baseRadius
    if (elongation && elongation.strength > 0) {
      const along = Math.cos(theta - elongation.angleRadians)
      radius *= 1 + Math.min(1, Math.max(0, elongation.strength)) * along * along
    }

    // Seamless ring wobble — sample fractal noise on a circle in noise
    // space so i=0 and i=sampleCount land on the same value.
    const nx = NOISE_RING_RADIUS * Math.cos(theta) + 100
    const ny = NOISE_RING_RADIUS * Math.sin(theta) + 100
    const wobble = fractalNoise2D(seed, nx, ny, { octaves: 4, scale: 1 }) * 2 - 1
    radius *= 1 + wobble * wobbleAmplitude

    // Road ribbons: a smooth lobe pulled outward wherever this angle points
    // near a road's exit bearing.
    for (const bearing of roadExitBearings) {
      const falloff = 1 - angularDistance(theta, bearing) / RIBBON_ANGULAR_HALF_WIDTH
      if (falloff > 0) radius += ribbonLength * smoothstep01(falloff)
    }

    rawRadii.push(Math.max(baseRadius * 0.25, radius))
  }

  const meanRadius = rawRadii.reduce((sum, r) => sum + r, 0) / rawRadii.length
  const convexPull = walled ? 0.5 : 0

  const margin = 2
  const ringPoints: Point[] = rawRadii.map((raw, i) => {
    const theta = (i / sampleCount) * Math.PI * 2
    const radius = raw + (meanRadius - raw) * convexPull
    return {
      x: Math.min(widthPixels - margin, Math.max(margin, center.x + Math.cos(theta) * radius)),
      y: Math.min(heightPixels - margin, Math.max(margin, center.y + Math.sin(theta) * radius))
    }
  })

  // Chaikin corner-cutting rounds the sampled ring into smooth curves —
  // fewer passes when walled, since its edge is meant to read as
  // deliberately laid out rather than fully organic.
  return { points: smoothPolygon(ringPoints, walled ? 2 : 3), walled }
}
