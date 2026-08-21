// Pure map-trip math — no React/DOM/IPC imports, so it's testable the same
// way graph.ts is (see tests/mapGeometry.test.ts). The one non-obvious part
// is splitLineByZones: rather than requiring the user to trace a route by
// hand for every distance query, it walks the straight line between two
// pins and automatically works out which painted terrain zones it passes
// through and how much of the line falls in each.
import type { LineType, MapLandmass, MapLine, MapScale, MapZone, TerrainType } from './noteTypes/map'
import type { TravelMode } from './noteTypes/travelModes'

export interface Point {
  x: number
  y: number
}

export function segmentDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

export function pixelsToReal(pixels: number, scale: MapScale): number {
  return pixels * (scale.realDistance / scale.pixelDistance)
}

// Time to travel a fixed real-world distance at a given multiplier — the
// same per-segment math calculateTrip does, exposed standalone so the line
// -drawing form can preview "this width costs about N hours to cross"
// without needing two real pins and a full trip. Infinity at 0 speed,
// matching calculateTrip's impassable-terrain convention. Deliberately not
// latitude-distortion-aware: at the point this preview is shown (mid-draw,
// picking a width), the line has no map position yet to look up a latitude
// for — this stays the flat estimate it's always been.
export function crossingTime(widthPixels: number, scale: MapScale, speedMultiplier: number, travelMode: TravelMode): number {
  const realDistance = pixelsToReal(widthPixels, scale)
  const effectiveSpeed = travelMode.speed * speedMultiplier
  return effectiveSpeed === 0 ? Infinity : realDistance / effectiveSpeed
}

export interface LatitudeDistortionConfig {
  equatorY: number
  planetCircumference: number
}

// Latitude (in radians, signed to match true geographic convention —
// positive north of the equator, negative south) at a given image-pixel y,
// treating the map as an equirectangular projection (y is linear in
// latitude, same assumption nearly every flat hand-drawn or digital map
// already makes implicitly, and image y increases downward = south, same as
// "north is up" on virtually every map). Derived from the map's existing
// vertical scale plus two extra settings: where the equator falls (equatorY,
// which may sit outside the image entirely — a map of one kingdom far from
// the equator still works) and the planet's real circumference (which fixes
// how much real distance one degree of latitude covers, independent of how
// much of the planet this particular map depicts).
export function latitudeRadiansAt(y: number, scale: MapScale, config: LatitudeDistortionConfig): number {
  const distanceFromEquator = pixelsToReal(config.equatorY - y, scale) // positive when y is above (north of) the equator row
  const distancePerDegree = config.planetCircumference / 360
  const degrees = distanceFromEquator / distancePerDegree
  return (degrees * Math.PI) / 180
}

// The image-pixel y where latitude crosses 0, linearly interpolated/
// extrapolated from the latitude at the image's top (y=0) and bottom
// (y=imageHeight) edges — may legitimately fall outside [0, imageHeight]
// for a map that doesn't depict the equator at all (e.g. one kingdom far to
// the north), same as the old manually-clicked equatorY could. Null for a
// degenerate top===bottom span (a map with zero north-south extent has no
// well-defined equator crossing).
export function deriveEquatorY(topLatitude: number, bottomLatitude: number, imageHeight: number): number | null {
  if (bottomLatitude === topLatitude) return null
  return (-topLatitude / (bottomLatitude - topLatitude)) * imageHeight
}

// Derives a MapScale directly from how many degrees of latitude the image
// spans top-to-bottom plus the planet's real circumference, instead of
// requiring a manual two-point calibration click. This is what makes
// 'latitude' scale mode self-consistent by construction: vertical
// distance-per-pixel can never disagree with planetCircumference, because
// it's computed FROM planetCircumference rather than independently
// calibrated and hoped to agree — see the scaleMode comment in
// noteTypes/map.ts for why that mattered. Works identically whether the
// image depicts the whole planet (e.g. topLatitude=90, bottomLatitude=-90)
// or a narrow regional band — same formula either way.
export function deriveScaleFromLatitudeSpan(
  topLatitude: number,
  bottomLatitude: number,
  planetCircumference: number,
  imageHeight: number,
  unit: string
): MapScale {
  const milesPerDegree = planetCircumference / 360
  const realDistance = Math.abs(bottomLatitude - topLatitude) * milesPerDegree
  return { pixelDistance: imageHeight, realDistance, unit }
}

// Real-world distance across one straight, undistorted sub-segment (start ->
// end, both in image pixels), correcting for how much a flat equirectangular
// map exaggerates east-west distance away from the equator. Only the
// east-west (x) component is compressed by cos(latitude); north-south (y) is
// unaffected, since meridians stay evenly spaced in this projection. Samples
// latitude once, at the segment's own midpoint, rather than integrating
// continuously along it — the same flat-per-piece approximation
// splitLineByZones already makes for terrain lookups (zoneAt/isLandAt), so a
// segment that's short relative to how fast latitude is changing (i.e. any
// segment between two zone/landmass crossings) stays accurate enough without
// needing calculus.
export function distortedSegmentRealDistance(start: Point, end: Point, scale: MapScale, config: LatitudeDistortionConfig): number {
  const midY = (start.y + end.y) / 2
  const lat = latitudeRadiansAt(midY, scale, config)
  const dxReal = pixelsToReal(end.x - start.x, scale) * Math.cos(lat)
  const dyReal = pixelsToReal(end.y - start.y, scale)
  return Math.hypot(dxReal, dyReal)
}

// Standard ray-casting point-in-polygon test. Only correct for simple
// single-ring polygons (no holes, no self-intersection) — the only kind
// MapZone can express in v1.
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const straddles = a.y > point.y !== b.y > point.y
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// Plain average-of-vertices centroid — not area-weighted (a real polygon
// centroid would need the shoelace-weighted formula), but this is only ever
// used as a cheap "roughly where is this shape" representative point (e.g.
// deciding whether a generated zone/territory falls inside an active
// boundary mask during augment-mode regeneration), not for anything
// requiring geometric precision.
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

// A map with no landmasses drawn treats everywhere as land — same as the
// pre-landmass behavior, so existing maps don't silently pick up a "water"
// default they never configured. Once at least one landmass exists, a point
// counts as land only if it falls inside one of them (union, no priority
// between overlapping landmasses needed since they carry no terrain of
// their own — see mapLandmassSchema's comment in noteTypes/map.ts).
export function isLandAt(point: Point, landmasses: MapLandmass[]): boolean {
  if (landmasses.length === 0) return true
  return landmasses.some((landmass) => pointInPolygon(point, landmass.points))
}

// Parametric intersection of segment p1->p2 with segment a->b, returned as
// t along p1->p2 (0..1), or null if they don't cross within both segments'
// bounds. Parallel/collinear edges return null — a zero-measure edge case
// not worth special-casing here.
function segmentIntersectionT(p1: Point, p2: Point, a: Point, b: Point): number | null {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = b.x - a.x
  const d2y = b.y - a.y
  const denom = d1x * d2y - d1y * d2x
  if (denom === 0) return null

  const dx = a.x - p1.x
  const dy = a.y - p1.y
  const t = (dx * d2y - dy * d2x) / denom
  const u = (dx * d1y - dy * d1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return t
}

// First zone (in array order) whose polygon contains the point, or null if
// the point falls outside every painted zone — no z-order/priority system
// for overlapping zones in v1, first-in-array-order wins.
function zoneAt(point: Point, zones: MapZone[]): string | null {
  for (const zone of zones) {
    if (pointInPolygon(point, zone.points)) return zone.terrainTypeId
  }
  return null
}

export interface ZoneSegment {
  terrainTypeId: string | null // null = outside every painted zone
  isLand: boolean // only meaningful when terrainTypeId is null — see calculateTrip
  pixelLength: number
  // The segment's own endpoints (a sub-span of the original p1->p2 line) —
  // needed alongside pixelLength so calculateTrip can apply latitude
  // distortion, which depends on this particular stretch's direction (how
  // much of pixelLength is east-west vs north-south) and its own y position,
  // not just its scalar length.
  start: Point
  end: Point
}

export function splitLineByZones(p1: Point, p2: Point, zones: MapZone[], landmasses: MapLandmass[] = []): ZoneSegment[] {
  const totalLength = segmentDistance(p1, p2)
  if (totalLength === 0) {
    return [{ terrainTypeId: zoneAt(p1, zones), isLand: isLandAt(p1, landmasses), pixelLength: 0, start: p1, end: p2 }]
  }

  const ts = new Set<number>([0, 1])
  for (const zone of zones) {
    for (let i = 0; i < zone.points.length; i++) {
      const a = zone.points[i]
      const b = zone.points[(i + 1) % zone.points.length]
      const t = segmentIntersectionT(p1, p2, a, b)
      if (t !== null) ts.add(t)
    }
  }
  // A landmass boundary crossing changes the land/water default even where
  // no zone/line covers the point, so it needs its own split points too —
  // otherwise a route that exits a landmass into open water without ever
  // touching a painted zone would be scored as one long "unpainted" segment
  // straddling both land and water.
  for (const landmass of landmasses) {
    for (let i = 0; i < landmass.points.length; i++) {
      const a = landmass.points[i]
      const b = landmass.points[(i + 1) % landmass.points.length]
      const t = segmentIntersectionT(p1, p2, a, b)
      if (t !== null) ts.add(t)
    }
  }

  const sorted = [...ts].sort((x, y) => x - y)
  const segments: ZoneSegment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const tStart = sorted[i]
    const tEnd = sorted[i + 1]
    if (tEnd - tStart < 1e-9) continue // dedupe near-identical crossing points

    const tMid = (tStart + tEnd) / 2
    const at = (t: number): Point => ({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t })
    const midpoint = at(tMid)
    segments.push({
      terrainTypeId: zoneAt(midpoint, zones),
      isLand: isLandAt(midpoint, landmasses),
      pixelLength: totalLength * (tEnd - tStart),
      start: at(tStart),
      end: at(tEnd)
    })
  }

  const merged: ZoneSegment[] = []
  for (const segment of segments) {
    const last = merged.at(-1)
    // isLand only needs to match when terrainTypeId is null — an explicitly
    // painted zone/line's speed doesn't depend on which side of a landmass
    // boundary it's on, so two explicit segments of the same terrain type
    // still merge even if a landmass edge happens to run through them.
    if (last && last.terrainTypeId === segment.terrainTypeId && (segment.terrainTypeId !== null || last.isLand === segment.isLand)) {
      last.pixelLength += segment.pixelLength
      last.end = segment.end // extend the merged run's span, keeping its original start
    } else {
      merged.push({ ...segment })
    }
  }
  return merged
}

// A road/path/river is drawn as a thin open line rather than a filled
// region (painting a thin, winding river as a polygon is impractical) —
// but the crossing math only understands polygons. So each straight
// segment of a line gets turned into a thin rectangle ("corridor") of the
// line's configured width, offset perpendicular to the segment's
// direction. Once that's done, a line is indistinguishable from a zone as
// far as splitLineByZones is concerned: a route that runs alongside a
// road's corridor for a stretch picks up the road's multiplier for that
// stretch, and a route that crosses a river's (typically much thinner)
// corridor picks up the slowdown right at the crossing — "follows a road"
// and "crosses a river" fall out of the exact same mechanism, just at
// different corridor widths and angles of approach.
function lineToCorridorZones(line: MapLine): MapZone[] {
  const halfWidth = line.widthPixels / 2
  const corridors: MapZone[] = []

  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i]
    const b = line.points[i + 1]
    const length = segmentDistance(a, b)
    if (length === 0) continue

    // Unit vector perpendicular to a->b, scaled to half the corridor width.
    const nx = (-(b.y - a.y) / length) * halfWidth
    const ny = ((b.x - a.x) / length) * halfWidth

    corridors.push({
      id: `${line.id}-seg${i}`,
      // Corridors are MapZone-shaped for reuse with splitLineByZones — this
      // is the one place a line's lineTypeId gets mapped into a zone's
      // terrainTypeId field; calculateTrip below resolves it against the
      // combined terrainTypes+lineTypes pool, not terrainTypes alone.
      terrainTypeId: line.lineTypeId,
      points: [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny }
      ],
      generated: false
    })
    // Adjacent segment corridors aren't joined/mitered at the seam — a v1
    // simplification. A route crossing exactly at a sharp joint could miss
    // a sliver of coverage; not worth the added geometry for how rarely a
    // straight pin-to-pin line lands precisely on a line's vertex.
  }

  return corridors
}

// Lines take priority over area zones where they overlap — a road cutting
// through a painted forest zone should read as fast travel, not slow, so
// corridor polygons go first in zoneAt's first-match-wins order.
export function zonesIncludingLines(zones: MapZone[], lines: MapLine[]): MapZone[] {
  return [...lines.flatMap(lineToCorridorZones), ...zones]
}

export interface TripSegmentResult {
  terrainTypeId: string | null
  isLand: boolean // only meaningful when terrainTypeId is null — see calculateTrip
  realDistance: number
  time: number
}

export interface TripResult {
  totalPixelDistance: number
  totalRealDistance: number
  totalTime: number // Infinity if any crossed segment's terrain has a 0 speedMultiplier — UI must handle this ("no route — impassable")
  segments: TripSegmentResult[]
}

// Concatenates the results of calculating a trip leg-by-leg (see wrapLegs)
// into one TripResult, as if it had been calculated as a single path.
// totalTime sums to Infinity if any leg's did, matching calculateTrip's own
// impassable-terrain convention.
export function mergeTripResults(results: TripResult[]): TripResult {
  return {
    totalPixelDistance: results.reduce((sum, r) => sum + r.totalPixelDistance, 0),
    totalRealDistance: results.reduce((sum, r) => sum + r.totalRealDistance, 0),
    totalTime: results.reduce((sum, r) => sum + r.totalTime, 0),
    segments: results.flatMap((r) => r.segments)
  }
}

export interface WrapConfig {
  mapWidth: number
  mapHeight: number
  wrapsHorizontally: boolean
  wrapsVertically: boolean
}

// Folds a single point back into the map's [0, mapWidth) x [0, mapHeight)
// bounds via modulo, wherever the corresponding axis wraps — e.g. for a
// live cursor position while drawing a route, so the user can see exactly
// where an off-canvas click would land on the opposite edge before they
// commit to it (see MapCanvas's draw-trip ghost preview), rather than
// guessing and only finding out after the fact.
export function foldPoint(point: Point, config: WrapConfig): Point {
  const wrap = (v: number, period: number): number => ((v % period) + period) % period
  return {
    x: config.wrapsHorizontally ? wrap(point.x, config.mapWidth) : point.x,
    y: config.wrapsVertically ? wrap(point.y, config.mapHeight) : point.y
  }
}

// Splits a straight p1->p2 trip into 1-3 real-coordinate legs representing
// the shortest path once the map's configured edges are treated as
// wrapping — e.g. a point near the west edge and a point near the east edge
// are actually close together, reachable by going off the west edge and
// reappearing on the east one, same as a flat projection of a cylindrical
// (one axis wraps) or toroidal (both axes wrap) world.
//
// Approach: try translating p2 by (0, ±mapWidth) and/or (0, ±mapHeight) —
// each translation is a candidate "the same destination, reached by going
// around" — and keep whichever candidate (including the untranslated one)
// gives the shortest straight-line distance from p1. Only ever wraps once
// per axis, since wrapping twice around is never shorter.
//
// If the winning candidate required a translation, the straight line to it
// crosses the map's edge (in x, y, or both) at one or two points along the
// way. This function cuts the line at those crossings and folds each
// resulting piece back into the map's real bounds (via modulo), producing
// 2-3 short real-coordinate legs whose lengths sum to the same wrapped
// distance — each independently safe to feed through calculateTrip (and to
// render on the map), since none of them cross an edge internally.
// t-values (0..1, exclusive) along a start->end run on one axis where it
// crosses a multiple of `period` — i.e. every wrapping seam it passes
// through on that axis. General on purpose: a hand-drawn segment (see
// foldDrawnPathAtWraps) could cross a seam more than once if drawn far
// enough past an edge, unlike wrapLegs's own search below, which only ever
// needs at most one.
function seamCrossingTs(startCoord: number, endCoord: number, period: number): number[] {
  const delta = endCoord - startCoord
  if (delta === 0) return []
  const lo = Math.min(startCoord, endCoord)
  const hi = Math.max(startCoord, endCoord)
  const ts: number[] = []
  for (let k = Math.floor(lo / period) + 1; k * period < hi; k++) {
    const t = (k * period - startCoord) / delta
    if (t > 0 && t < 1) ts.push(t)
  }
  return ts
}

// Splits a start->end segment into 1+ real-coordinate legs, folding each
// piece back into the map's [0, mapWidth) x [0, mapHeight) bounds via
// modulo wherever the corresponding axis wraps — start/end are taken
// exactly as given, with no search for a shorter path (see wrapLegs for
// that). This is what makes a hand-drawn route that strays past a wrapping
// edge (see foldDrawnPathAtWraps) work the same way: the off-canvas point
// the user placed already says exactly where the route goes, this just
// re-expresses it in the map's real bounds.
function foldSegmentAtWraps(start: Point, end: Point, config: WrapConfig): Point[][] {
  const { mapWidth: W, mapHeight: H, wrapsHorizontally, wrapsVertically } = config
  const dx = end.x - start.x
  const dy = end.y - start.y

  const ts = new Set<number>([0, 1])
  if (wrapsHorizontally) for (const t of seamCrossingTs(start.x, end.x, W)) ts.add(t)
  if (wrapsVertically) for (const t of seamCrossingTs(start.y, end.y, H)) ts.add(t)

  const raw = (t: number): Point => ({ x: start.x + dx * t, y: start.y + dy * t })
  const sorted = [...ts].sort((a, b) => a - b)
  const legs: Point[][] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const tStart = sorted[i]
    const tEnd = sorted[i + 1]
    if (tEnd - tStart < 1e-9) continue // dedupe a crossing that landed exactly on 0 or 1

    // The whole leg lies within one "tile" (no seam crossing inside it, by
    // construction), so one integer shift per axis folds both endpoints back
    // into the map's real bounds consistently. That shift has to come from
    // the leg's midpoint, not from each endpoint independently (plain
    // modulo) — a modulo fold is discontinuous exactly at a seam value (e.g.
    // wrap(0, W) = 0 but wrap(-epsilon, W) ~= W), so folding an endpoint that
    // sits exactly on the seam can silently pick the wrong side, landing a
    // leg back on the edge it just left instead of the opposite one.
    const mid = raw((tStart + tEnd) / 2)
    const shiftX = wrapsHorizontally ? Math.floor(mid.x / W) * W : 0
    const shiftY = wrapsVertically ? Math.floor(mid.y / H) * H : 0
    const legStart = raw(tStart)
    const legEnd = raw(tEnd)
    legs.push([
      { x: legStart.x - shiftX, y: legStart.y - shiftY },
      { x: legEnd.x - shiftX, y: legEnd.y - shiftY }
    ])
  }
  return legs
}

export function wrapLegs(p1: Point, p2: Point, config: WrapConfig): Point[][] {
  const { mapWidth: W, mapHeight: H, wrapsHorizontally, wrapsVertically } = config

  let bestOffset: Point = { x: 0, y: 0 }
  let bestDist = segmentDistance(p1, p2)
  for (const dx of wrapsHorizontally ? [-W, 0, W] : [0]) {
    for (const dy of wrapsVertically ? [-H, 0, H] : [0]) {
      if (dx === 0 && dy === 0) continue
      const dist = segmentDistance(p1, { x: p2.x + dx, y: p2.y + dy })
      if (dist < bestDist) {
        bestDist = dist
        bestOffset = { x: dx, y: dy }
      }
    }
  }

  if (bestOffset.x === 0 && bestOffset.y === 0) return [[p1, p2]]

  const p2Shifted = { x: p2.x + bestOffset.x, y: p2.y + bestOffset.y }
  return foldSegmentAtWraps(p1, p2Shifted, config)
}

// A hand-drawn route (see MapCanvas's 'draw-trip' mode) doesn't get the
// automatic shortest-path search wrapLegs does — the user has already
// chosen their exact route point by point. But since panning/zooming
// already lets you place a point past the image's edge, a drawn route CAN
// cross a wrapping seam: this walks the path leg by leg and folds any
// segment that strays outside the map's real bounds back into them,
// splitting at the seam the same way wrapLegs does for the automatic case.
// A path entirely within bounds (the common case, and the only case when
// neither axis wraps) comes back completely unchanged, one leg per input
// segment.
export function foldDrawnPathAtWraps(path: Point[], config: WrapConfig): Point[][] {
  const legs: Point[][] = []
  for (let i = 0; i < path.length - 1; i++) {
    legs.push(...foldSegmentAtWraps(path[i], path[i + 1], config))
  }
  return legs
}

// path is 2+ points — either the two endpoint pins of a straight-line trip,
// or a longer hand-drawn route (see MapCanvas's 'draw-trip' mode) for a
// journey that doesn't take the direct line, e.g. walking to a dock, taking
// a boat across, then walking again on the far shore. Each leg between
// consecutive path points is split and resolved independently and the
// results concatenated — a route that alternates land/water several times
// picks up the matching travel mode each time it crosses a landmass
// boundary, with no need to tag each leg by hand.
export function calculateTrip(
  path: Point[],
  zones: MapZone[],
  lines: MapLine[],
  terrainTypes: TerrainType[],
  lineTypes: LineType[],
  landmasses: MapLandmass[],
  waterTerrainTypeId: string | null,
  scale: MapScale,
  landTravelMode: TravelMode,
  waterTravelMode: TravelMode,
  // Optional — when set, each segment's real distance corrects for
  // equirectangular east-west distortion (see distortedSegmentRealDistance)
  // instead of the plain flat pixelsToReal conversion. Omitted/null leaves
  // every existing caller's behavior unchanged.
  latitudeDistortion?: LatitudeDistortionConfig | null
): TripResult {
  // A crossed segment's terrainTypeId may resolve against either pool —
  // zones only ever reference terrainTypes, but a line-derived corridor
  // (see lineToCorridorZones) carries the line's lineTypeId in that same
  // field, so both pools need to be searchable here.
  const multiplierById = new Map([...terrainTypes, ...lineTypes].map((t) => [t.id, t.speedMultiplier]))
  const allZones = zonesIncludingLines(zones, lines)

  let totalPixelDistance = 0
  let totalRealDistance = 0
  let totalTime = 0
  const segments: TripSegmentResult[] = []

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    totalPixelDistance += segmentDistance(p1, p2)

    for (const seg of splitLineByZones(p1, p2, allZones, landmasses)) {
      const realDistance = latitudeDistortion
        ? distortedSegmentRealDistance(seg.start, seg.end, scale, latitudeDistortion)
        : pixelsToReal(seg.pixelLength, scale)
      // Which travel mode's base speed applies is decided purely by land vs
      // water — an explicitly painted zone/line's multiplier still always
      // wins over the unpainted default, but it scales whichever of the two
      // base speeds is in effect for that stretch of ground, same as a
      // "Road" zone scales walking speed today. Otherwise land defaults to
      // 1x (unchanged from before landmasses existed), and water defaults to
      // the map's chosen water terrain type — or 1x too, if none has been
      // picked yet, so drawing a landmass boundary without setting a water
      // terrain is a visual no-op rather than a silent slowdown.
      const travelMode = seg.isLand ? landTravelMode : waterTravelMode
      const multiplier =
        seg.terrainTypeId !== null
          ? (multiplierById.get(seg.terrainTypeId) ?? 1)
          : seg.isLand || waterTerrainTypeId === null
            ? 1
            : (multiplierById.get(waterTerrainTypeId) ?? 1)
      const effectiveSpeed = travelMode.speed * multiplier
      const time = effectiveSpeed === 0 ? Infinity : realDistance / effectiveSpeed

      totalRealDistance += realDistance
      totalTime += time
      segments.push({ terrainTypeId: seg.terrainTypeId, isLand: seg.isLand, realDistance, time })
    }
  }

  return { totalPixelDistance, totalRealDistance, totalTime, segments }
}
