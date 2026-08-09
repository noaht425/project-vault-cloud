import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { Button } from "@/components/ui/Button";

export function CalendarMoonsTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const updateMoon = (id: string, patch: Record<string, unknown>): void =>
    updateFrontmatter({ moons: data.moons.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Zero or more moons, each with its own cycle length in days (rarely a clean divisor of this calendar&apos;s
        months) and a phase offset so moons don&apos;t have to share a new-moon date.
      </p>
      {data.moons.map((moon) => (
        <div key={moon.id} className="flex items-center gap-2">
          <input className="flex-1 min-w-0" value={moon.name} onChange={(e) => updateMoon(moon.id, { name: e.target.value })} />
          <input
            type="number"
            className="w-20"
            value={moon.cycleDays}
            onChange={(e) => updateMoon(moon.id, { cycleDays: Number(e.target.value) })}
          />
          <input
            type="number"
            className="w-20"
            value={moon.phaseOffsetDays}
            onChange={(e) => updateMoon(moon.id, { phaseOffsetDays: Number(e.target.value) })}
          />
          <Button variant="ghost" onClick={() => updateFrontmatter({ moons: data.moons.filter((m) => m.id !== moon.id) })}>
            ✕
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          updateFrontmatter({ moons: [...data.moons, { id: crypto.randomUUID(), name: "New Moon", cycleDays: 30, phaseOffsetDays: 0 }] })
        }
      >
        + Add moon
      </Button>
    </div>
  );
}
