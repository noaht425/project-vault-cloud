// Ported verbatim from the Electron app's src/common/noteTypes/session.ts.
import { z } from "zod";

export const sessionFrontmatterSchema = z
  .object({
    type: z.literal("session"),
    tags: z.array(z.string()).catch([]),
    date: z.string().catch(""), // free text (not a strict date type) so a partial/approximate date never breaks parsing
    summary: z.string().catch(""),
  })
  .passthrough();

export type SessionFrontmatter = z.infer<typeof sessionFrontmatterSchema>;

export function defaultSessionFrontmatter(): SessionFrontmatter {
  const today = new Date().toISOString().slice(0, 10);
  return sessionFrontmatterSchema.parse({ type: "session", date: today });
}
