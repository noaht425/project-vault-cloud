import { useMemo } from "react";
import { locationFrontmatterSchema, LOCATION_KINDS } from "@/lib/noteTypes/location";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";

// Adapted from the Electron app's LocationSheet.tsx. Two things are cut,
// same reasoning as PcForm's classRef: neither Climate notes nor Settlement
// notes have a mobile form yet, so the climate-title autocomplete/"Open"
// button and the "Promote to Settlement" button (locationType === 'city')
// don't have anywhere useful to go yet — climateNoteTitle ports as a plain
// text field, same parity-without-lookup precedent as classRef. Revisit
// both once Climate/Settlement land on mobile (see project backlog).
export function LocationForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => locationFrontmatterSchema.parse(frontmatter), [frontmatter]);

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-3xl md:mx-auto md:w-full">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Type"
          value={data.locationType}
          onChange={(e) => onChange({ locationType: e.target.value })}
        >
          {LOCATION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind[0].toUpperCase() + kind.slice(1)}
            </option>
          ))}
        </SelectField>
        <TextField label="Summary" value={data.summary} onChange={(e) => onChange({ summary: e.target.value })} />
      </div>
      <TextField
        label="Climate"
        placeholder="e.g. Arctic Tundra"
        value={data.climateNoteTitle ?? ""}
        onChange={(e) => onChange({ climateNoteTitle: e.target.value || null })}
      />
    </div>
  );
}
