import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { TextField } from "@/components/ui/TextField";

export function CalendarDaysTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Sub-day precision — not required for anything in the workspace yet, but future events/timeline entries can
        use it once set.
      </p>
      <div className="flex gap-2">
        <TextField
          label="Hours per day"
          type="number"
          value={data.hoursPerDay}
          onChange={(e) => updateFrontmatter({ hoursPerDay: Number(e.target.value) })}
        />
        <TextField
          label="Minutes per hour"
          type="number"
          value={data.minutesPerHour}
          onChange={(e) => updateFrontmatter({ minutesPerHour: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
