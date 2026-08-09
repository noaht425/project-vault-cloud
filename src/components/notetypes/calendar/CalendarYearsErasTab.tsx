import type { CalendarFrontmatter } from "@/lib/noteTypes/calendar";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";

export function CalendarYearsErasTab({
  data,
  updateFrontmatter,
}: {
  data: CalendarFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const updateEra = (id: string, patch: Record<string, unknown>): void =>
    updateFrontmatter({ eras: data.eras.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const rule = data.leapYearRule;
  const updateRule = (patch: Record<string, unknown>): void => updateFrontmatter({ leapYearRule: { ...rule, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <strong className="text-sm">Eras</strong>
        <p className="text-sm text-muted">
          A named span of years, counting up (like CE) or down (like BCE). Most settings need at least one
          &quot;counts up&quot; era; add a second &quot;counts down&quot; one only if the calendar has a
          before/after split.
        </p>
        {data.eras.map((era) => (
          <div key={era.id} className="flex items-center gap-2">
            <input className="flex-1 min-w-0" value={era.name} onChange={(e) => updateEra(era.id, { name: e.target.value })} />
            <input className="w-16" value={era.abbreviation} onChange={(e) => updateEra(era.id, { abbreviation: e.target.value })} />
            <select value={era.direction} onChange={(e) => updateEra(era.id, { direction: e.target.value })}>
              <option value="up">Counts up</option>
              <option value="down">Counts down</option>
            </select>
            <Button variant="ghost" onClick={() => updateFrontmatter({ eras: data.eras.filter((e) => e.id !== era.id) })}>
              ✕
            </Button>
          </div>
        ))}
        <Button
          onClick={() =>
            updateFrontmatter({
              eras: [...data.eras, { id: crypto.randomUUID(), name: "New Era", abbreviation: "", direction: "up" }],
            })
          }
        >
          + Add era
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <strong className="text-sm">Leap years</strong>
        <p className="text-sm text-muted">
          Optional. Adds extra day(s) to a chosen month (or as standalone day(s) belonging to no month) on a
          recurring year interval, with up to two levels of exception — the same shape as the real Gregorian rule
          (every 4 years, except every 100, except every 400).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule !== null}
            onChange={(e) =>
              updateFrontmatter({
                leapYearRule: e.target.checked
                  ? { intervalYears: 4, exceptionEveryYears: null, exceptionToExceptionEveryYears: null, extraDays: 1, monthId: null }
                  : null,
              })
            }
          />
          This calendar has leap years
        </label>
        {rule && (
          <div className="flex gap-2 flex-wrap">
            <TextField
              label="Every N years"
              type="number"
              className="w-20"
              value={rule.intervalYears}
              onChange={(e) => updateRule({ intervalYears: Number(e.target.value) })}
            />
            <TextField
              label="Except every N years"
              type="number"
              placeholder="none"
              className="w-24"
              value={rule.exceptionEveryYears ?? ""}
              onChange={(e) => updateRule({ exceptionEveryYears: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <TextField
              label="Except THAT every N years"
              type="number"
              placeholder="none"
              className="w-24"
              disabled={rule.exceptionEveryYears === null}
              value={rule.exceptionToExceptionEveryYears ?? ""}
              onChange={(e) =>
                updateRule({ exceptionToExceptionEveryYears: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
            <TextField
              label="Extra days"
              type="number"
              className="w-20"
              value={rule.extraDays}
              onChange={(e) => updateRule({ extraDays: Number(e.target.value) })}
            />
            <SelectField
              label="Added to month"
              value={rule.monthId ?? ""}
              onChange={(e) => updateRule({ monthId: e.target.value === "" ? null : e.target.value })}
            >
              <option value="">(standalone day, no month)</option>
              {data.months.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}
      </div>
    </div>
  );
}
