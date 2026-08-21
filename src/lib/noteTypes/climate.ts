// Ported verbatim from the Electron app's src/common/noteTypes/climate.ts.
// The full schema (seasons/conditions) is kept for correct round-tripping,
// but ClimateForm.tsx below only edits summary/calendarNoteTitle — the
// seasons editor needs a calendar's own month list to be usable (season
// month-membership is picked from it), and Calendar notes don't have a
// mobile form yet. Same deferral shape as EventForm's structuredDate.
import { z } from "zod";

export const weatherConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.coerce.number().catch(1),
});
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

export const climateSeasonSchema = z.object({
  id: z.string(),
  name: z.string(),
  monthIds: z.array(z.string()).catch([]),
  conditions: z.array(weatherConditionSchema).catch([]),
});
export type ClimateSeason = z.infer<typeof climateSeasonSchema>;

export const climateFrontmatterSchema = z
  .object({
    type: z.literal("climate"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
    calendarNoteTitle: z.string().catch(""),
    seasons: z.array(climateSeasonSchema).catch([]),
    // One of mapGeneration/climate.ts's fixed BiomeId values (e.g.
    // 'desert', 'tundra') — optional, null until set. Kept as a plain
    // string here (not an imported literal union) so this note-types
    // module doesn't depend on the map generation lib, same "resolved by
    // lookup, not an enum" convention as terrainTypeId/climateTypeId
    // elsewhere in noteTypes/map.ts. Lets a settlement/kingdom's own
    // already-researched climate note act as a ground-truth anchor when
    // the map's own procedural climate layer is generated near it (see the
    // map generation plan's Phase 6 follow-up) — every existing climate
    // note has this null, with zero effect until a map generation run
    // actually resolves a pin to it.
    biomeId: z.string().nullable().catch(null),
  })
  .passthrough();

export type ClimateFrontmatter = z.infer<typeof climateFrontmatterSchema>;

export function defaultClimateFrontmatter(): ClimateFrontmatter {
  return climateFrontmatterSchema.parse({ type: "climate" });
}
