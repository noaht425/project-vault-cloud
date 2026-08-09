import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { arrayMove } from "@/lib/arrayMove";
import { Button } from "@/components/ui/Button";

export function CalendarWeekTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const updateDay = (i: number, name: string): void =>
    updateFrontmatter({ weekDays: data.weekDays.map((d, di) => (di === i ? name : d)) });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {data.weekDays.length}-day week. Order is the day-of-week cycle — day 1 of the calendar&apos;s epoch falls on
        whichever day is listed first.
      </p>
      {data.weekDays.map((day, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-xs text-muted">{i + 1}</span>
          <input className="flex-1 min-w-0" value={day} onChange={(e) => updateDay(i, e.target.value)} />
          <Button variant="ghost" disabled={i === 0} onClick={() => updateFrontmatter({ weekDays: arrayMove(data.weekDays, i, "up") })}>
            ↑
          </Button>
          <Button
            variant="ghost"
            disabled={i === data.weekDays.length - 1}
            onClick={() => updateFrontmatter({ weekDays: arrayMove(data.weekDays, i, "down") })}
          >
            ↓
          </Button>
          <Button variant="ghost" onClick={() => updateFrontmatter({ weekDays: data.weekDays.filter((_, di) => di !== i) })}>
            ✕
          </Button>
        </div>
      ))}
      <Button onClick={() => updateFrontmatter({ weekDays: [...data.weekDays, `Day ${data.weekDays.length + 1}`] })}>
        + Add day
      </Button>
    </div>
  );
}
