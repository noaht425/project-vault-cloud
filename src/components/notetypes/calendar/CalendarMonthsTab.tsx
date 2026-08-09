import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { arrayMove } from "@/lib/arrayMove";
import { Button } from "@/components/ui/Button";

// Order matters (day-of-year math walks this list in sequence), so every
// row gets up/down move buttons, not just add/remove.
export function CalendarMonthsTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const totalDays = data.months.reduce((sum, m) => sum + m.days, 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Total: {totalDays} day{totalDays === 1 ? "" : "s"}/year, across {data.months.length} month
        {data.months.length === 1 ? "" : "s"}. Order matters — it determines day-of-year numbering.
      </p>
      <div className="flex flex-col gap-1">
        {data.months.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0"
              value={m.name}
              onChange={(e) =>
                updateFrontmatter({ months: data.months.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })
              }
            />
            <input
              type="number"
              className="w-16"
              value={m.days}
              onChange={(e) =>
                updateFrontmatter({ months: data.months.map((x) => (x.id === m.id ? { ...x, days: Number(e.target.value) } : x)) })
              }
            />
            <Button variant="ghost" disabled={i === 0} onClick={() => updateFrontmatter({ months: arrayMove(data.months, i, "up") })}>
              ↑
            </Button>
            <Button
              variant="ghost"
              disabled={i === data.months.length - 1}
              onClick={() => updateFrontmatter({ months: arrayMove(data.months, i, "down") })}
            >
              ↓
            </Button>
            <Button variant="ghost" onClick={() => updateFrontmatter({ months: data.months.filter((x) => x.id !== m.id) })}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button
        onClick={() => updateFrontmatter({ months: [...data.months, { id: crypto.randomUUID(), name: "New Month", days: 30 }] })}
      >
        + Add month
      </Button>
    </div>
  );
}
