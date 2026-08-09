import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { getWorkspaceId } from "@/lib/workspace";
import { dbErrorResponse } from "@/lib/dbError";

interface SessionRow {
  id: string;
  name: string;
  frontmatter: Record<string, unknown>;
}

// Every note_type='session' note in the workspace, mirroring the local
// app's listSessions. Session dates are real-world ISO dates (not the
// in-world calendar /api/events sorts by), so a plain string sort is
// correct here — see Project Vault's main/vault/session.ts for the same
// reasoning.
export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const workspaceId = await getWorkspaceId(supabase, userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, name, frontmatter")
    .eq("workspace_id", workspaceId)
    .eq("note_type", "session");
  if (error) return dbErrorResponse(error, "GET /api/sessions");

  const summaries = (notes as SessionRow[])
    .map((note) => ({
      id: note.id,
      name: note.name,
      date: typeof note.frontmatter.date === "string" ? note.frontmatter.date : "",
      summary: typeof note.frontmatter.summary === "string" ? note.frontmatter.summary : "",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(summaries);
}
