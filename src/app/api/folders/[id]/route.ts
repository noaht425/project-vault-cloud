import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedClient } from "@/lib/supabase/apiAuth";

// Walks up from the proposed new parent toward the root. If it reaches
// `folderId` along the way, the move would either put a folder inside
// itself or inside one of its own descendants — a cycle that fs.rename
// would reject naturally on a real filesystem, but a bare UPDATE here
// would just silently create, breaking /api/tree's recursion forever.
async function getParentId(supabase: SupabaseClient, id: string): Promise<string | null | undefined> {
  const { data } = await supabase.from("folders").select("parent_id").eq("id", id).maybeSingle();
  return data?.parent_id;
}

async function wouldCreateCycle(supabase: SupabaseClient, folderId: string, newParentId: string | null): Promise<boolean> {
  if (newParentId === null) return false;
  if (newParentId === folderId) return true;

  let cursor: string | null = newParentId;
  while (cursor) {
    const parentId = await getParentId(supabase, cursor);
    if (parentId === undefined) return false;
    if (parentId === folderId) return true;
    cursor = parentId;
  }
  return false;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = authed;

  const { name, parentId } = await request.json();
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (parentId !== undefined) patch.parent_id = parentId;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (parentId !== undefined && (await wouldCreateCycle(supabase, id, parentId))) {
    return NextResponse.json({ error: "Cannot move a folder into itself or one of its own descendants" }, { status: 400 });
  }

  const { data: folder, error } = await supabase.from("folders").update(patch).eq("id", id).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(folder);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = authed;

  // Descendant folders and notes cascade via the "on delete cascade" FK
  // constraints in 0001_init_schema.sql — same effect as recursively
  // removing a directory on the filesystem.
  const { data: folder, error } = await supabase.from("folders").delete().eq("id", id).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
