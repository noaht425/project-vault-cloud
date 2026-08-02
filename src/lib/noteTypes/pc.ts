// Ported verbatim from the Electron app's src/common/noteTypes/pc.ts. The
// `classRef` field is kept (stored/editable) for parity with notes created
// in Electron, but the level-gated class-feature lookup UI that field
// drives there (ClassFeaturesPanel, resolving a linked class-reference
// note) isn't ported — deferred along with class-reference notes
// themselves, which don't have a mobile form yet either.
import { z } from "zod";
import { abilityScoresSchema } from "./creatureStats";

export const pcFrontmatterSchema = z
  .object({
    type: z.literal("pc"),
    tags: z.array(z.string()).catch([]),
    class: z.string().catch(""),
    subclass: z.string().catch(""),
    classRef: z.string().catch(""),
    level: z.coerce.number().catch(1),
    race: z.string().catch(""),
    ac: z.coerce.number().catch(10),
    hp: z.coerce.number().catch(10),
    maxHp: z.coerce.number().catch(10),
    stats: abilityScoresSchema,
  })
  .passthrough();

export type PcFrontmatter = z.infer<typeof pcFrontmatterSchema>;

export function defaultPcFrontmatter(): PcFrontmatter {
  return pcFrontmatterSchema.parse({ type: "pc" });
}
