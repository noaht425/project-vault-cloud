// Ported from the Electron app's src/common/noteTypes/classReference.ts —
// only the frontmatter schema; parseClassReferenceLevels (which reads
// "## Level N" headings out of the body) isn't needed here since the mobile
// body textarea already edits that text directly, same convention as
// desktop. The PC form's level-gated ClassFeaturesPanel lookup that reads
// those parsed levels is still deferred, same as classRef itself.
import { z } from "zod";

export const classReferenceFrontmatterSchema = z
  .object({
    type: z.literal("class-reference"),
    tags: z.array(z.string()).catch([]),
    class: z.string().catch(""),
    subclass: z.string().catch(""),
  })
  .passthrough();

export type ClassReferenceFrontmatter = z.infer<typeof classReferenceFrontmatterSchema>;

export function defaultClassReferenceFrontmatter(): ClassReferenceFrontmatter {
  return classReferenceFrontmatterSchema.parse({ type: "class-reference" });
}
