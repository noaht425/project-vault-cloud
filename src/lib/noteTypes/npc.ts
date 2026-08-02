// Ported verbatim from the Electron app's src/common/noteTypes/npc.ts.
import { z } from "zod";
import { abilityScoresSchema } from "./creatureStats";

export const npcFrontmatterSchema = z
  .object({
    type: z.literal("npc"),
    tags: z.array(z.string()).catch([]),
    role: z.string().catch(""), // e.g. "Villager", "Boss", "Beast"
    cr: z.string().catch(""), // challenge rating — free text since it can be fractional ("1/4")
    ac: z.coerce.number().catch(10),
    hp: z.coerce.number().catch(10),
    maxHp: z.coerce.number().catch(10),
    stats: abilityScoresSchema,
    // Optional — null means "unknown," not 0.
    age: z.number().int().nonnegative().nullable().catch(null),
  })
  .passthrough();

export type NpcFrontmatter = z.infer<typeof npcFrontmatterSchema>;

export function defaultNpcFrontmatter(): NpcFrontmatter {
  return npcFrontmatterSchema.parse({ type: "npc" });
}
