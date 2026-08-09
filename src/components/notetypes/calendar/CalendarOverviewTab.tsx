import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { TextField } from "@/components/ui/TextField";

export function CalendarOverviewTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const totalYearDays = data.months.reduce((sum, m) => sum + m.days, 0);

  return (
    <div className="flex flex-col gap-2">
      <TextField label="Summary" value={data.summary} onChange={(e) => updateFrontmatter({ summary: e.target.value })} />
      <p className="text-sm text-muted">
        {data.months.length} month{data.months.length === 1 ? "" : "s"} ({totalYearDays} days/year),{" "}
        {data.weekDays.length}-day week, {data.eras.length} era{data.eras.length === 1 ? "" : "s"},{" "}
        {data.moons.length} moon{data.moons.length === 1 ? "" : "s"}
        {data.leapYearRule && " — has a leap-year rule"}. Edit the details in the other tabs.
      </p>
    </div>
  );
}
