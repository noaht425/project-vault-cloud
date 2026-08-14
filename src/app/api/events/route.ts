import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { extractHistoryFacts, extractBornDiedFacts, extractInlineTimelineFacts } from "@/lib/worldTimeline";
import { compareWorldDates } from "@/lib/worldDate";
import { migrateFreeTextDate, parseCalendarDefinition, type CalendarCandidate } from "@/lib/dateMigration";
import { dbErrorResponse } from "@/lib/dbError";

interface EventRow {
  id: string;
  name: string;
  note_type: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
}

interface EventSummary {
  id: string;
  name: string;
  date: string;
  summary: string;
  noteType: string;
  structuredDate?: unknown;
  // Only ever set for noteType === "event" entries (a location note's
  // title, from that note's own `location` field) — History-section-
  // derived facts have no such concept. Consumed by the Map×Timeline
  // crossover (mapTimeline.ts) to match an event to a pin on a given map.
  location?: string | null;
}

// The whole workspace's history, not just note_type='event' notes — every
// note gets scanned for a "## History" section and bare "Born:"/"Died:"
// lines (see src/lib/worldTimeline.ts) so a kingdom's founding or a king's
// death shows up alongside dedicated Event notes, mirroring the local
// app's listEvents. Sorted with compareWorldDates (in-world AF/AM
// calendar), unlike /api/sessions' plain string sort.
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, name, note_type, body, frontmatter")
    .eq("workspace_id", workspaceId);
  if (error) return dbErrorResponse(error, "GET /api/events");

  // Calendar notes are already in `notes` above — no second query. Used
  // below to resolve inline [[timeline: ...]] mentions (worldTimeline.ts's
  // extractInlineTimelineFacts) to a structuredDate, the same name/
  // abbreviation matching /api/migrate-dates uses for whole Event notes, so
  // these mentions can be placed on the pill timeline and month grid too,
  // not just this flat list.
  const calendars: CalendarCandidate[] = [];
  for (const note of notes as EventRow[]) {
    if (note.note_type !== "calendar") continue;
    const definition = parseCalendarDefinition(note.frontmatter);
    if (definition) calendars.push({ noteTitle: note.name, frontmatter: definition });
  }

  const entries: EventSummary[] = [];
  for (const note of notes as EventRow[]) {
    const noteType = note.note_type ?? "note";

    if (noteType === "event") {
      entries.push({
        id: note.id,
        name: note.name,
        date: typeof note.frontmatter.date === "string" ? note.frontmatter.date : "",
        summary: typeof note.frontmatter.summary === "string" ? note.frontmatter.summary : "",
        noteType: "event",
        structuredDate: note.frontmatter.structuredDate ?? null,
        location: typeof note.frontmatter.location === "string" ? note.frontmatter.location : null,
      });
    }

    for (const fact of [...extractHistoryFacts(note.body), ...extractBornDiedFacts(note.body)]) {
      entries.push({ id: note.id, name: note.name, date: fact.date, summary: fact.description, noteType });
    }

    for (const fact of extractInlineTimelineFacts(note.body)) {
      const structuredDate = calendars.length > 0 ? migrateFreeTextDate(fact.date, calendars) : null;
      entries.push({
        id: note.id,
        name: note.name,
        date: fact.date,
        summary: fact.description,
        noteType,
        structuredDate: structuredDate ? { ...structuredDate, annualRecurrence: false } : undefined,
      });
    }
  }

  entries.sort((a, b) => compareWorldDates(a.date, b.date));
  return NextResponse.json(entries);
}
