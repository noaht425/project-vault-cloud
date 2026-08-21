import { useMemo } from "react";
import { climateFrontmatterSchema } from "@/lib/noteTypes/climate";
import { BIOME_DEFINITIONS } from "@/lib/mapGeneration/climate";
import { TextField } from "@/components/ui/TextField";

// Adapted from the Electron app's ClimateSheet.tsx. The seasons/weather
// editor is cut — it needs a calendar's own month list to assign season
// membership against, and Calendar notes don't have a mobile form yet.
// calendarNoteTitle ports as a plain text field (same parity-without-lookup
// precedent as classRef/climateNoteTitle elsewhere); any seasons already
// set on a note created in Electron are preserved untouched (NoteEditor
// merges this form's patch onto the full frontmatter, never drops
// unmentioned keys), just not editable here yet.
export function ClimateForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => climateFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
      <TextField
        label="Calendar"
        placeholder="e.g. Age of the Many"
        value={data.calendarNoteTitle}
        onChange={(e) => onChange({ calendarNoteTitle: e.target.value })}
      />
      {data.seasons.length > 0 && (
        <p className="text-sm text-muted">
          This climate has {data.seasons.length} season{data.seasons.length === 1 ? "" : "s"} set in the desktop app
          — not editable here yet, but they won&apos;t be lost by editing the fields above.
        </p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">
          Map biome (optional) — if any settlement/kingdom linked to this climate note sits on a generated map, its pin
          becomes a ground-truth anchor: nearby procedural climate generation is pulled toward this biome instead of
          picking one at random, fading smoothly into the noise-driven climate further away.
        </span>
        <select value={data.biomeId ?? ""} onChange={(e) => onChange({ biomeId: e.target.value || null })}>
          <option value="">Not set (no effect on map generation)</option>
          {BIOME_DEFINITIONS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
