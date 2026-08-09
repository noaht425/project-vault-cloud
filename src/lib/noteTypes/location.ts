// Ported verbatim from the Electron app's src/common/noteTypes/location.ts.
import { z } from "zod";

export const LOCATION_KINDS = ["plane", "kingdom", "city", "location"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const locationFrontmatterSchema = z
  .object({
    type: z.literal("location"),
    tags: z.array(z.string()).catch([]),
    locationType: z
      .string()
      .catch("location")
      .transform((v): LocationKind => (LOCATION_KINDS.includes(v as LocationKind) ? (v as LocationKind) : "location")),
    summary: z.string().catch(""),
    climateNoteTitle: z.string().nullable().catch(null),
  })
  .passthrough();

export type LocationFrontmatter = z.infer<typeof locationFrontmatterSchema>;

export function defaultLocationFrontmatter(): LocationFrontmatter {
  return locationFrontmatterSchema.parse({ type: "location" });
}
