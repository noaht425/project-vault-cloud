import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { SelectField } from "@/components/ui/SelectField";

export function CalendarSettingsTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label="Default era"
        value={data.defaultEraId ?? ""}
        onChange={(e) => updateFrontmatter({ defaultEraId: e.target.value === "" ? null : e.target.value })}
      >
        <option value="">(none)</option>
        {data.eras.map((era) => (
          <option key={era.id} value={era.id}>
            {era.name} {era.abbreviation && `(${era.abbreviation})`}
          </option>
        ))}
      </SelectField>
      <p className="text-sm text-muted">
        Which era a bare year with no written suffix is assumed to belong to — e.g. a date written just
        &quot;150&quot; is read as 150 of this era. Only matters once this calendar has 2+ eras.
      </p>
    </div>
  );
}
