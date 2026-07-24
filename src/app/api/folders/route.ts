import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { name, parentId = null } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // One workspace per user for now — see 0001_init_schema.sql.
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });
  }

  const { data: folder, error } = await supabase
    .from("folders")
    .insert({ workspace_id: workspace.id, parent_id: parentId, name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(folder, { status: 201 });
}
