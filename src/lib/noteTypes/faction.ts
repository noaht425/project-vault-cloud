// Ported verbatim from the Electron app's src/common/noteTypes/faction.ts.
import { z } from "zod";

export const factionFrontmatterSchema = z
  .object({
    type: z.literal("faction"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
  })
  .passthrough();

export type FactionFrontmatter = z.infer<typeof factionFrontmatterSchema>;

export function defaultFactionFrontmatter(): FactionFrontmatter {
  return factionFrontmatterSchema.parse({ type: "faction" });
}
