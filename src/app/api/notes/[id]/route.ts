import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { version, name, frontmatter, body } = await request.json();
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { version: version + 1, updated_by: user.id };
  if (name !== undefined) patch.name = name;
  if (frontmatter !== undefined) patch.frontmatter = frontmatter;
  if (body !== undefined) patch.body = body;

  const { data: updated, error } = await supabase
    .from("notes")
    .update(patch)
    .eq("id", id)
    .eq("version", version)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
