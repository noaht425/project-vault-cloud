import { z } from 'zod'

// Deliberately not part of NoteTemplate/CREATABLE_NOTE_KINDS (see
// noteTemplateDefaults.ts) even though Local Vault can have Map notes too
// now (see docs/plans/2026-08-04-cloud-to-local-copy.md Phase 3) — that
// shared list drives the generic "New" dropdown (NewItemMenu.tsx), and a
// map note's own dedicated "+ Map" button (in both CloudFileTree.tsx and
// the local FileTree.tsx) is the only creation entry point on either side,
// bypassing vaultApi/cloudApi's template-based defaulting entirely in favor
// of writing defaultMapFrontmatter() directly. MapSheet.tsx itself branches
// on noteRefApi.isCloud between window.cloudApi's and window.vaultApi's
// image-storage calls.

const pointSchema = z.object({ x: z.number(), y: z.number() })

const mapImageSchema = z.object({
  path: z.string(),
  width: z.number(),
  height: z.number()
})

const mapScaleSchema = z.object({
  pixelDistance: z.number(),
  realDistance: z.number(),
  unit: z.string().catch('miles')
})

export const terrainTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().catch('#4caf6e'),
  // Multiplies a travel mode's base speed while crossing this terrain — 1 is
  // normal, <1 slower, >1 faster, 0 impassable (see mapGeometry.calculateTrip).
  speedMultiplier: z.coerce.number().catch(1)
})

export const mapZoneSchema = z.object({
  id: z.string(),
  terrainTypeId: z.string(),
  // Simple single-ring polygon — no holes, no multi-part regions (v1).
  points: z.array(pointSchema)
})

// Same shape as a terrain type, kept as a separate name/pool since lines
// (roads, paths, rivers) and zones (painted regions) are two distinct
// concepts to the user, with their own dropdown/editor UI — a road isn't a
// "terrain" you'd paint as a region, and a mountain range isn't a line you'd
// trace. Reusing the schema shape, not the list, avoids duplicating the
// {id, name, color, speedMultiplier} definition.
export const lineTypeSchema = terrainTypeSchema

export const mapLineSchema = z.object({
  id: z.string(),
  lineTypeId: z.string(),
  // An open polyline (not closed like a zone) — a road, path, or river.
  points: z.array(pointSchema),
  // How wide a corridor around this line counts as "on/crossing it", in map
  // image pixels — judge it by eye against the map's own detail level.
  widthPixels: z.coerce.number().catch(20)
})

// A landmass has no terrain/speed of its own — it's a pure land/water
// boundary. Anything inside any landmass polygon counts as land (unpainted
// default, same 1x as today); anything outside every landmass on the map
// counts as water, using the map's waterTerrainTypeId (see mapGeometry.ts's
// calculateTrip). A map with zero landmasses behaves exactly as before —
// this is additive, not a replacement for the existing zone/line system,
// which still wins wherever explicitly painted (a river or a sea lane keeps
// its own speed regardless of which side of a landmass boundary it's on).
export const mapLandmassSchema = z.object({
  id: z.string(),
  name: z.string().catch(''),
  // Simple single-ring polygon, same shape/limitations as a MapZone (v1).
  points: z.array(pointSchema)
})

export const mapPinSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  // References a location note by title, matching this app's existing
  // [[wiki-link]] convention (see FamilyTreeSheet) rather than an id-based
  // scheme that doesn't exist anywhere else in the codebase. Null for a
  // freehand pin with no linked note — old pins (from before freehand pins
  // existed) always have this set, so they need no migration here.
  locationTitle: z.string().nullable().catch(null),
  // Display text for a freehand pin (locationTitle === null) — unused/empty
  // when locationTitle is set, since the linked note's own title is shown
  // instead. See pinDisplayLabel() below.
  label: z.string().catch('')
})

export function pinDisplayLabel(pin: { locationTitle: string | null; label: string }): string {
  return pin.locationTitle ?? pin.label
}

export const mapFrontmatterSchema = z
  .object({
    type: z.literal('map'),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(''),
    image: mapImageSchema.nullable().catch(null),
    scale: mapScaleSchema.nullable().catch(null),
    terrainTypes: z.array(terrainTypeSchema).catch([]),
    lineTypes: z.array(lineTypeSchema).catch([]),
    zones: z.array(mapZoneSchema).catch([]),
    lines: z.array(mapLineSchema).catch([]),
    landmasses: z.array(mapLandmassSchema).catch([]),
    // Which terrainTypes entry represents "water" — used as the default
    // speed for anything outside every landmass and not otherwise covered
    // by a painted zone/line. Null until the user sets one (see MapSheet's
    // Water terrain picker), in which case water areas default to 1x, same
    // as unpainted land — a deliberate no-op until configured, not a hidden
    // slowdown/impassable surprise on maps that predate this feature.
    waterTerrainTypeId: z.string().nullable().catch(null),
    pins: z.array(mapPinSchema).catch([]),
    // Treats the map image's left/right (and/or top/bottom) edges as
    // identified, same as a flat projection of a cylindrical or toroidal
    // world — so the trip calculator can consider "go off this edge and
    // reappear on the opposite one" as a candidate route. Off by default so
    // existing maps (most of which represent a bounded region, not a whole
    // wrapping world) are unaffected. See mapGeometry.ts's wrapLegs.
    wrapsHorizontally: z.boolean().catch(false),
    wrapsVertically: z.boolean().catch(false),
    // 'manual' (default) is the original system, unchanged: scale.pixelDistance
    // /realDistance comes entirely from clicking two points (Calibrate Scale)
    // and no latitude concept exists at all — the simplest option for anyone
    // who doesn't want to think about curvature. 'latitude' replaces BOTH
    // Calibrate Scale and manually placing the equator with three plain
    // numbers below (topLatitude/bottomLatitude/planetCircumference), which
    // derive scale and the equator's position automatically — see
    // mapGeometry.ts's deriveScaleFromLatitudeSpan/deriveEquatorY. Deriving
    // rather than independently calibrating removes the failure mode where a
    // horizontal scale calibration away from the equator silently
    // contradicts the curvature math (see the "Set Equator" mode history in
    // git log for the version this replaced).
    scaleMode: z.enum(['manual', 'latitude']).catch('manual'),
    // Latitude at the image's top edge (y=0) and bottom edge (y=image.height)
    // — only used when scaleMode is 'latitude'. Works identically for a
    // whole-world map (e.g. 90 / -90) or a map of just one region (e.g. 65 /
    // 10) — same two numbers either way, no separate "is this a world map"
    // toggle needed. Null until both are set.
    topLatitude: z.number().nullable().catch(null),
    bottomLatitude: z.number().nullable().catch(null),
    // The planet's real circumference, in latitudeUnit below — lets 1 degree
    // of latitude convert to a real distance (circumference / 360),
    // independent of how much of the planet this particular map depicts.
    // Null until set. Used by 'latitude' scale mode to derive scale itself,
    // and by either mode (if set) to power the curvature toggle below.
    planetCircumference: z.number().nullable().catch(null),
    // 'latitude' scale mode's own unit label — deliberately separate from
    // scale.unit (which belongs to 'manual' mode's own click-calibrated
    // scale) rather than shared, so switching scale modes can never leak a
    // placeholder scale value from one mode into the other.
    latitudeUnit: z.string().catch('miles'),
    // Approximates a flat (equirectangular) map's real east-west distance as
    // shrinking by cos(latitude) away from the equator, same reason
    // Greenland looks continent-sized on real-world flat maps — while
    // north-south distance is left as-is. Only takes effect in 'latitude'
    // scale mode (no latitude is known at all in 'manual' mode); off by
    // default even there, so it's opt-in rather than a surprise once you
    // switch modes. See mapGeometry.ts's calculateTrip.
    accountForLatitudeDistortion: z.boolean().catch(false)
  })
  .passthrough()

export type MapFrontmatter = z.infer<typeof mapFrontmatterSchema>
export type MapImage = z.infer<typeof mapImageSchema>
export type MapScale = z.infer<typeof mapScaleSchema>
export type TerrainType = z.infer<typeof terrainTypeSchema>
export type LineType = z.infer<typeof lineTypeSchema>
export type MapZone = z.infer<typeof mapZoneSchema>
export type MapLine = z.infer<typeof mapLineSchema>
export type MapLandmass = z.infer<typeof mapLandmassSchema>
export type MapPin = z.infer<typeof mapPinSchema>

// Seeded on every new map — generic real-world-ish starting points, not
// tied to any specific published ruleset (same spirit as
// travelModes.ts's DEFAULT_TRAVEL_MODES). Multipliers are relative to a
// travel mode's normal (1x) speed.
export function defaultTerrainTypes(): TerrainType[] {
  return [
    { id: 'mountains', name: 'Mountains', color: '#8a7a6d', speedMultiplier: 0.33 },
    { id: 'forest', name: 'Forest', color: '#3f7a4e', speedMultiplier: 0.5 }
  ]
}

// Roads/paths/rivers are thin, winding features that are impractical to
// paint as a filled region — see mapGeometry.ts's zonesIncludingLines for
// how a drawn line still factors into the same distance/time math as a zone.
export function defaultLineTypes(): LineType[] {
  return [
    { id: 'road', name: 'Road', color: '#c9a24d', speedMultiplier: 1.5 },
    { id: 'path', name: 'Path', color: '#a68a5b', speedMultiplier: 1.2 },
    // ~5x slower — assumes fording on foot. Flip above 1x instead if a
    // river represents traveling *by boat along* it rather than crossing
    // it, or set to 0 to make it a hard barrier without a bridge/boat.
    { id: 'river', name: 'River', color: '#3c8fe0', speedMultiplier: 0.2 }
  ]
}

export function defaultMapFrontmatter(): MapFrontmatter {
  return mapFrontmatterSchema.parse({ type: 'map', terrainTypes: defaultTerrainTypes(), lineTypes: defaultLineTypes() })
}
