import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { buildSnippet, extractSearchableText, matchesAllTokens, tokenize } from "@/lib/search";
import { dbErrorResponse } from "@/lib/dbError";

interface SearchRow {
  id: string;
  name: string;
  note_type: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
}

// Full-text-ish search over name + body + frontmatter, scoped to the
// caller's workspace. No FTS index on the notes table yet (see
// supabase/migrations/0001_init_schema.sql) — this pulls the workspace's
// notes and searches them in process, same tradeoff /api/notes/[id]/backlinks
// and /api/graph make. Fine at prototype scale.
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { searchParams } = new URL(request.url);
  const tokens = tokenize(searchParams.get("q") ?? "");
  const type = searchParams.get("type") ?? undefined;
  if (tokens.length === 0) return NextResponse.json([]);

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  let query = supabase
    .from("notes")
    .select("id, name, note_type, body, frontmatter")
    .eq("workspace_id", workspaceId);
  if (type) query = query.eq("note_type", type);

  const { data: notes, error } = await query;
  if (error) return dbErrorResponse(error, "GET /api/search");

  const results = (notes as SearchRow[])
    .map((note) => {
      const metadataText = extractSearchableText(note.frontmatter).join(" ");
      const haystack = [note.name, note.body, metadataText].join(" ");
      if (!matchesAllTokens(haystack, tokens)) return null;

      // Prefer a snippet from whichever field actually shows the match in
      // context — name/metadata hits are usually more informative than an
      // arbitrary body excerpt, so try them first.
      const snippet =
        buildSnippet(note.name, tokens) ?? buildSnippet(note.body, tokens) ?? buildSnippet(metadataText, tokens) ?? note.name;

      return { id: note.id, name: note.name, noteType: note.note_type, snippet };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30);

  return NextResponse.json(results);
}
