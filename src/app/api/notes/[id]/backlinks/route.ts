import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { extractWikiLinkTitles } from "@/lib/wikiLinks";
import { dbErrorResponse } from "@/lib/dbError";

// Which other notes in this workspace link to this one. No links table
// (unlike the local app's SQLite index) — extracts [[wiki-links]] from
// every note's body in process each request. Fine at prototype scale; see
// /api/graph for the same tradeoff applied to the whole workspace at once.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data: target, error: targetError } = await supabase
    .from("notes")
    .select("id, name")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (targetError) return dbErrorResponse(targetError, "GET /api/notes/[id]/backlinks target lookup");
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, name, body")
    .eq("workspace_id", workspaceId)
    .neq("id", id);
  if (error) return dbErrorResponse(error, "GET /api/notes/[id]/backlinks");

  const targetNameLower = target.name.toLowerCase();
  const backlinks = (notes as { id: string; name: string; body: string }[])
    .filter((note) => extractWikiLinkTitles(note.body).some((title) => title.toLowerCase() === targetNameLower))
    .map((note) => ({ sourceId: note.id, sourceName: note.name }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName));

  return NextResponse.json(backlinks);
}
