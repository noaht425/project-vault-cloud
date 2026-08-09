import { z } from 'zod'

// Global (not per-map) list of travel-mode presets, stored as the single
// note of this type in the Cloud Workspace — see travelModesStore.ts, which
// finds-or-creates it. Deliberately not part of NoteTemplate/
// CREATABLE_NOTE_KINDS (see map.ts's comment) — never user-created via the
// normal "New" menu.

export const travelModeSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Distance-per-time-unit, in whatever real-world unit the map's scale
  // uses (see map.ts's MapScale.unit) — e.g. 3 "miles" per 1 "hours".
  speed: z.coerce.number().catch(1),
  timeUnitLabel: z.string().catch('hours')
})

export type TravelMode = z.infer<typeof travelModeSchema>

export const travelModesFrontmatterSchema = z
  .object({
    type: z.literal('travel-modes'),
    tags: z.array(z.string()).catch([]),
    modes: z.array(travelModeSchema).catch(() => defaultTravelModes())
  })
  .passthrough()

export type TravelModesFrontmatter = z.infer<typeof travelModesFrontmatterSchema>

// Round, clearly-placeholder numbers — not attributed to or copied from any
// specific published ruleset. The user is expected to rename/retune these
// (or delete them and add their own) via TravelModesEditor before relying
// on the trip calculator for real numbers.
export function defaultTravelModes(): TravelMode[] {
  return [
    { id: 'walking', name: 'Walking (edit me)', speed: 3, timeUnitLabel: 'hours' },
    { id: 'mounted', name: 'Mounted (edit me)', speed: 6, timeUnitLabel: 'hours' },
    { id: 'ship', name: 'Ship (edit me)', speed: 5, timeUnitLabel: 'hours' }
  ]
}

export function defaultTravelModesFrontmatter(): TravelModesFrontmatter {
  return travelModesFrontmatterSchema.parse({ type: 'travel-modes' })
}
