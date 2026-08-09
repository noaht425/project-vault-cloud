import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { dbErrorResponse } from "@/lib/dbError";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = authed;

  const { data: note, error } = await supabase.from("notes").select("*").eq("id", id).single();
  if (error || !note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(note);
}

// Optimistic-concurrency update: the caller sends the version it last read.
// If another write landed in between, `version` no longer matches and this
// update touches zero rows — that's the signal to return 409 with the
// current note instead of silently overwriting someone else's change (the
// failure mode the old file-based "-conflict-" copies came from).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { version, name, frontmatter, body, folderId } = await request.json();
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { version: version + 1, updated_by: userId };
  if (name !== undefined) patch.name = name;
  if (frontmatter !== undefined) patch.frontmatter = frontmatter;
  if (body !== undefined) patch.body = body;
  if (folderId !== undefined) patch.folder_id = folderId;

  const { data: updated, error } = await supabase
    .from("notes")
    .update(patch)
    .eq("id", id)
    .eq("version", version)
    .select()
    .maybeSingle();

  if (error) return dbErrorResponse(error, "PATCH /api/notes/[id]");

  if (!updated) {
    // Either the note doesn't exist, or the version didn't match — tell
    // those apart so the client can show "someone else changed this" vs.
    // "this note doesn't exist" instead of one generic failure.
    const { data: current } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Version conflict", current }, { status: 409 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = authed;

  const { data: deleted, error } = await supabase.from("notes").delete().eq("id", id).select().maybeSingle();

  if (error) return dbErrorResponse(error, "DELETE /api/notes/[id]");
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
