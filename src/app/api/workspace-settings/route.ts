import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";

// Build step 6 of the calendar/timeline system (see the Electron app's
// docs/plans/2026-07-28-calendar-timeline-system.md — this repo doesn't
// keep its own copy). Per-workspace, not per-note and not version-checked
// like /api/notes/[id] — this is a single owner's own display preference,
// not shared/contended content, so a plain last-write-wins update is
// proportionate (no version column exists on workspaces, unlike notes).
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data, error } = await supabase
    .from("workspaces")
    .select("active_calendar_titles")
    .eq("id", workspaceId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ activeCalendarNoteTitles: data.active_calendar_titles ?? [] });
}

export async function PATCH(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { activeCalendarNoteTitles } = await request.json();
  if (!Array.isArray(activeCalendarNoteTitles) || !activeCalendarNoteTitles.every((t) => typeof t === "string")) {
    return NextResponse.json({ error: "activeCalendarNoteTitles must be an array of strings" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update({ active_calendar_titles: activeCalendarNoteTitles })
    .eq("id", workspaceId)
    .select("active_calendar_titles")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ activeCalendarNoteTitles: data.active_calendar_titles ?? [] });
}
