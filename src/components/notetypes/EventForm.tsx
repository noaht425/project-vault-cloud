import { useMemo } from "react";
import { eventFrontmatterSchema } from "@/lib/noteTypes/event";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's EventSheet.tsx. The structured-date
// section (calendar/era/year/month/day/hour/minute + moon phase + weather
// display) is cut for this pass — it depends on Calendar note data, which
// doesn't have a mobile form yet. `date` (free text) and `location` port
// directly as plain fields, same parity-without-lookup precedent as
// LocationForm's climateNoteTitle — location has no autocomplete/"Open"
// button yet. Both `structuredDate` and any existing `location` value are
// preserved untouched on notes that already have them (NoteEditor merges
// this form's patch onto the full frontmatter, it never drops
// unmentioned keys), this form just doesn't offer editing them (yet).
export function EventForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => eventFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Date"
          placeholder="e.g. Year 12 of the Third Age"
          value={data.date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
        <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
      </div>
      <TextField
        label="Location"
        placeholder="e.g. Townsville"
        value={data.location ?? ""}
        onChange={(e) => onChange({ location: e.target.value || null })}
      />
      {data.structuredDate && (
        <p className="text-sm text-muted">
          This event also has a structured calendar date set in the desktop app — not editable here yet, but it
          won&apos;t be lost by editing the fields above.
        </p>
      )}
      <p className="text-sm text-muted">
        Link factions, locations, and characters with [[wiki-links]] in the body below — they&apos;ll show up on
        those notes&apos; Backlinks panel automatically.
      </p>
    </div>
  );
}
