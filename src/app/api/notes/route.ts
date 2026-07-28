import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";

// Title-only search, scoped to the caller's workspace — mirrors the local
// app's searchTitles (used for wiki-link autocomplete), not a full-text
// search over note bodies. See /api/search for that.
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? undefined;
  // An empty query with NO type filter is a genuinely-empty autocomplete
  // box — short-circuiting to [] avoids an unfiltered near-global list for
  // that case. But an empty query WITH a type filter (e.g. "every
  // calendar note", used by EventSheet's calendar picker and the pill
  // timeline view to list ALL calendar notes) is a deliberate "give me
  // everything of this type" request, not an empty-input case — the local
  // Electron app's own searchTitles (session.ts) already treats it that
  // way (`LIKE '%%'` matches everything), so short-circuiting only here
  // was a local/cloud parity bug: the local app worked, cloud silently
  // never found any calendar/location notes at all.
  if (!q && !type) return NextResponse.json([]);

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  let query = supabase
    .from("notes")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(20);
  if (type) query = query.eq("note_type", type);

  const { data: notes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { name, folderId = null, frontmatter = {}, body = "" } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // One workspace per user for now — see 0001_init_schema.sql, created
  // automatically on signup, so this should always find one.
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .single();
  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });
  }

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      workspace_id: workspace.id,
      folder_id: folderId,
      name,
      frontmatter,
      body,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(note, { status: 201 });
}
