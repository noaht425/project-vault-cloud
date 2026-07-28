import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { computeDateMigration, type CalendarCandidate, type CalendarDefinition } from "@/lib/dateMigration";

interface NoteRow {
  id: string;
  name: string;
  note_type: string | null;
  frontmatter: Record<string, unknown>;
  version: number;
}

function asCalendarDefinition(frontmatter: Record<string, unknown>): CalendarDefinition | null {
  const months = Array.isArray(frontmatter.months) ? frontmatter.months : null;
  const eras = Array.isArray(frontmatter.eras) ? frontmatter.eras : null;
  if (!months || !eras) return null;
  return {
    months: months.filter(
      (m): m is { id: string; name: string } => typeof m?.id === "string" && typeof m?.name === "string"
    ),
    eras: eras.filter(
      (e): e is { id: string; abbreviation: string } => typeof e?.id === "string" && typeof e?.abbreviation === "string"
    ),
    defaultEraId: typeof frontmatter.defaultEraId === "string" ? frontmatter.defaultEraId : null,
  };
}

// Step 5 of the calendar/timeline system (see the Electron app's
// docs/plans/2026-07-28-calendar-timeline-system.md — this repo doesn't
// keep its own copy of that doc). Confirmed with the user: this runs
// automatically — the Electron renderer calls it once per workspace open
// (App.tsx's signedIn effect), same trigger point as the local vault's
// equivalent in main/vault/session.ts's openVault. Populates
// event.structuredDate from the existing free-text date field by matching
// it against whatever calendar notes exist in this workspace; anything
// that can't be matched is left undated (the original free text is never
// touched either way — see src/lib/dateMigration.ts).
//
// Idempotent by construction: computeDateMigration only ever considers
// events with no structuredDate yet, so calling this on every workspace
// open is always safe, no separate "already ran" tracking needed.
export async function POST(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, name, note_type, frontmatter, version")
    .eq("workspace_id", workspaceId)
    .in("note_type", ["event", "calendar"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const calendars: CalendarCandidate[] = [];
  const events: { id: string; date: string; hasStructuredDate: boolean }[] = [];
  const eventRowsById = new Map<string, NoteRow>();

  for (const note of notes as NoteRow[]) {
    if (note.note_type === "calendar") {
      const definition = asCalendarDefinition(note.frontmatter);
      if (definition) calendars.push({ noteTitle: note.name, frontmatter: definition });
    } else if (note.note_type === "event") {
      eventRowsById.set(note.id, note);
      events.push({
        id: note.id,
        date: typeof note.frontmatter.date === "string" ? note.frontmatter.date : "",
        hasStructuredDate: Boolean(note.frontmatter.structuredDate),
      });
    }
  }

  if (calendars.length === 0) return NextResponse.json({ migrated: 0, skipped: 0 });

  const updates = computeDateMigration(events, calendars);
  let migrated = 0;
  for (const update of updates) {
    const row = eventRowsById.get(update.id);
    if (!row) continue;

    // Version-checked update, same optimistic-concurrency pattern as
    // /api/notes/[id] PATCH — a mismatch means this event was edited
    // between our read above and now, so skip it silently rather than
    // clobber a concurrent change; the next migration run will retry
    // against whatever's there then.
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        frontmatter: { ...row.frontmatter, structuredDate: update.structuredDate },
        version: row.version + 1,
        updated_by: userId,
      })
      .eq("id", update.id)
      .eq("version", row.version);
    if (!updateError) migrated++;
  }

  return NextResponse.json({ migrated, skipped: updates.length - migrated });
}
