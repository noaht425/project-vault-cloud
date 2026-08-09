import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { dbErrorResponse } from "@/lib/dbError";

// Build step 6 of the calendar/timeline system (see the Electron app's
// docs/plans/2026-07-28-calendar-timeline-system.md — this repo doesn't
// keep its own copy). Per-workspace, not per-note and not version-checked
// like /api/notes/[id] — this is a single owner's own display preference,
// not shared/contended content, so a plain last-write-wins update is
// proportionate (no version column exists on workspaces, unlike notes).
//
// campaignDate added for the month-grid Calendar view (0004 migration) —
// PATCH is field-optional (only touches whichever key is present in the
// body) rather than requiring activeCalendarNoteTitles every time, since
// the grid's "Set as campaign date" button only ever wants to update that
// one field without also having to resend the calendar toggle list.

function isValidCampaignDate(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.calendarNoteTitle === "string" &&
    typeof v.eraId === "string" &&
    typeof v.year === "number" &&
    typeof v.monthId === "string" &&
    typeof v.day === "number"
  );
}

export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data, error } = await supabase
    .from("workspaces")
    .select("active_calendar_titles, campaign_date")
    .eq("id", workspaceId)
    .single();
  if (error) return dbErrorResponse(error, "GET /api/workspace-settings");

  return NextResponse.json({
    activeCalendarNoteTitles: data.active_calendar_titles ?? [],
    campaignDate: data.campaign_date ?? null,
  });
}

export async function PATCH(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if ("activeCalendarNoteTitles" in body) {
    const { activeCalendarNoteTitles } = body;
    if (!Array.isArray(activeCalendarNoteTitles) || !activeCalendarNoteTitles.every((t: unknown) => typeof t === "string")) {
      return NextResponse.json({ error: "activeCalendarNoteTitles must be an array of strings" }, { status: 400 });
    }
    update.active_calendar_titles = activeCalendarNoteTitles;
  }

  if ("campaignDate" in body) {
    if (!isValidCampaignDate(body.campaignDate)) {
      return NextResponse.json({ error: "campaignDate must be a valid CampaignDate object or null" }, { status: 400 });
    }
    update.campaign_date = body.campaignDate;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update(update)
    .eq("id", workspaceId)
    .select("active_calendar_titles, campaign_date")
    .single();
  if (error) return dbErrorResponse(error, "PATCH /api/workspace-settings");

  return NextResponse.json({
    activeCalendarNoteTitles: data.active_calendar_titles ?? [],
    campaignDate: data.campaign_date ?? null,
  });
}
