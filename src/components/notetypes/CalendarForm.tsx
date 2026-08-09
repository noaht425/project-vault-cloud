import { useMemo, useState } from "react";
import { calendarFrontmatterSchema } from "@/lib/noteTypes/calendar";
import { Button } from "@/components/ui/Button";
import { CalendarOverviewTab } from "./calendar/CalendarOverviewTab";
import { CalendarMonthsTab } from "./calendar/CalendarMonthsTab";
import { CalendarWeekTab } from "./calendar/CalendarWeekTab";
import { CalendarDaysTab } from "./calendar/CalendarDaysTab";
import { CalendarYearsErasTab } from "./calendar/CalendarYearsErasTab";
import { CalendarMoonsTab } from "./calendar/CalendarMoonsTab";
import { CalendarSettingsTab } from "./calendar/CalendarSettingsTab";

type CalendarTab = "overview" | "months" | "week" | "days" | "years-eras" | "moons" | "settings";

// Adapted from the Electron app's CalendarSheet.tsx — same 7-tab structure,
// ports directly (no cross-note lookups anywhere in this note type, unlike
// Event/Location/Climate elsewhere in this app).
export function CalendarForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const data = useMemo(() => calendarFrontmatterSchema.parse(frontmatter), [frontmatter]);
  const [tab, setTab] = useState<CalendarTab>("overview");

  const tabs: { id: CalendarTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "months", label: `Months (${data.months.length})` },
    { id: "week", label: `Week (${data.weekDays.length})` },
    { id: "days", label: "Days" },
    { id: "years-eras", label: `Years & Eras (${data.eras.length})` },
    { id: "moons", label: `Moons (${data.moons.length})` },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "default"} className="text-xs" onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "overview" && <CalendarOverviewTab data={data} updateFrontmatter={onChange} />}
      {tab === "months" && <CalendarMonthsTab data={data} updateFrontmatter={onChange} />}
      {tab === "week" && <CalendarWeekTab data={data} updateFrontmatter={onChange} />}
      {tab === "days" && <CalendarDaysTab data={data} updateFrontmatter={onChange} />}
      {tab === "years-eras" && <CalendarYearsErasTab data={data} updateFrontmatter={onChange} />}
      {tab === "moons" && <CalendarMoonsTab data={data} updateFrontmatter={onChange} />}
      {tab === "settings" && <CalendarSettingsTab data={data} updateFrontmatter={onChange} />}
    </div>
  );
}
