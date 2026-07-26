import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { extractHistoryFacts, extractBornDiedFacts } from "@/lib/worldTimeline";
import { compareWorldDates } from "@/lib/worldDate";

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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
      });
    }

    for (const fact of [...extractHistoryFacts(note.body), ...extractBornDiedFacts(note.body)]) {
      entries.push({ id: note.id, name: note.name, date: fact.date, summary: fact.description, noteType });
    }
  }

  entries.sort((a, b) => compareWorldDates(a.date, b.date));
  return NextResponse.json(entries);
}
