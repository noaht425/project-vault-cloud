import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { dbErrorResponse } from "@/lib/dbError";

export async function POST(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { name, parentId = null } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // One workspace per user for now — see 0001_init_schema.sql.
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .single();
  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .insert({ workspace_id: workspace.id, parent_id: parentId, name })
    .select()
    .single();

  if (error) return dbErrorResponse(error, "POST /api/folders create");
  return NextResponse.json(folder, { status: 201 });
}
