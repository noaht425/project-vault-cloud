"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EventsListView } from "@/components/timeline/EventsListView";
import { EventsPillTimelineView } from "@/components/timeline/EventsPillTimelineView";
import { MonthGridView } from "@/components/timeline/MonthGridView";

type EventsTab = "list" | "timeline" | "grid";

// Mirrors the Electron app's CloudEventsSection.tsx tab switcher.
export default function EventsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<EventsTab>("list");

  const openEvent = (id: string) => router.push(`/notes/${id}`);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Button variant={tab === "list" ? "primary" : "default"} onClick={() => setTab("list")}>
          List
        </Button>
        <Button variant={tab === "timeline" ? "primary" : "default"} onClick={() => setTab("timeline")}>
          Timeline
        </Button>
        <Button variant={tab === "grid" ? "primary" : "default"} onClick={() => setTab("grid")}>
          Calendar
        </Button>
      </div>
      {tab === "list" && <EventsListView onOpenEvent={openEvent} />}
      {tab === "timeline" && <EventsPillTimelineView onOpenEvent={openEvent} />}
      {tab === "grid" && <MonthGridView onOpenEvent={openEvent} />}
    </div>
  );
}
