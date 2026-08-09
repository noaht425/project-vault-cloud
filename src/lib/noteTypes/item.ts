// Ported verbatim from the Electron app's src/common/noteTypes/item.ts.
import { z } from "zod";

export const itemFrontmatterSchema = z
  .object({
    type: z.literal("item"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
  })
  .passthrough();

export type ItemFrontmatter = z.infer<typeof itemFrontmatterSchema>;

export function defaultItemFrontmatter(): ItemFrontmatter {
  return itemFrontmatterSchema.parse({ type: "item" });
}
