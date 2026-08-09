// Ported verbatim from the Electron app's src/common/noteTypes/event.ts.
// structuredDate is kept in the schema (so it round-trips correctly for
// notes that already have one, set from Electron) but EventForm.tsx below
// doesn't expose it for editing yet — it depends on Calendar note data,
// which doesn't have a mobile form of its own yet either.
import { z } from "zod";

export const eventStructuredDateSchema = z.object({
  calendarNoteTitle: z.string(),
  eraId: z.string(),
  year: z.coerce.number(),
  monthId: z.string(),
  day: z.coerce.number().catch(1),
  hour: z.coerce.number().catch(0),
  minute: z.coerce.number().catch(0),
  annualRecurrence: z.boolean().catch(false),
});
export type EventStructuredDate = z.infer<typeof eventStructuredDateSchema>;

export const eventFrontmatterSchema = z
  .object({
    type: z.literal("event"),
    tags: z.array(z.string()).catch([]),
    date: z.string().catch(""),
    structuredDate: eventStructuredDateSchema.nullable().catch(null),
    summary: z.string().catch(""),
    location: z.string().nullable().catch(null),
  })
  .passthrough();

export type EventFrontmatter = z.infer<typeof eventFrontmatterSchema>;

export function defaultEventFrontmatter(): EventFrontmatter {
  return eventFrontmatterSchema.parse({ type: "event" });
}
