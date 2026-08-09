import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { dbErrorResponse } from "@/lib/dbError";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = authed;

  const { name, parentId } = await request.json();
  if (name === undefined && parentId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // A parent change needs the cycle check + update to be one atomic
  // database operation (see supabase/migrations/0006_atomic_folder_move.sql)
  // — two concurrent moves checking against pre-move state in separate
  // requests could otherwise jointly create a real cycle. A rename with no
  // parent change carries no such risk, so it stays a plain update.
  if (parentId !== undefined) {
    const { data: folder, error } = await supabase.rpc("move_folder", {
      p_folder_id: id,
      p_new_parent_id: parentId,
      p_new_name: name ?? null,
    });
    if (error) {
      if (error.code === "P0001") {
        return NextResponse.json(
          { error: "Cannot move a folder into itself or one of its own descendants" },
          { status: 400 }
        );
      }
      if (error.code === "P0002") return NextResponse.json({ error: "Not found" }, { status: 404 });
      return dbErrorResponse(error, "PATCH /api/folders/[id] move");
    }
    return NextResponse.json(folder);
  }

  const { data: folder, error } = await supabase.from("folders").update({ name }).eq("id", id).select().maybeSingle();
  if (error) return dbErrorResponse(error, "PATCH /api/folders/[id] rename");
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

  if (error) return dbErrorResponse(error, "DELETE /api/folders/[id]");
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
