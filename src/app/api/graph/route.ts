import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { extractWikiLinkTitles } from "@/lib/wikiLinks";
import { buildGraph } from "@/lib/graph";

// Every note in the workspace as a node, every [[wiki-link]] as an edge —
// mirrors the local app's graph:get. See src/lib/graph.ts for the actual
// graph-building logic (ported from Project Vault's common/graph.ts).
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, name, note_type, body")
    .eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = notes as { id: string; name: string; note_type: string | null; body: string }[];
  const links = rows.flatMap((note) =>
    extractWikiLinkTitles(note.body).map((targetTitle) => ({ sourceId: note.id, targetTitle }))
  );
  const graph = buildGraph(
    rows.map((n) => ({ id: n.id, name: n.name, noteType: n.note_type })),
    links
  );

  return NextResponse.json(graph);
}
