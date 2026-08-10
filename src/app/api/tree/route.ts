import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/apiAuth";
import { dbErrorResponse } from "@/lib/dbError";

// Shape mirrors the desktop app's TreeEntry (see Project Vault's
// src/renderer/src/components/file-tree/FileTree.tsx): isDirectory +
// children is exactly what that component recurses over, just with a
// database id in place of a filesystem path.
interface TreeNode {
  id: string;
  name: string;
  isDirectory: boolean;
  noteType?: string | null;
  version?: number;
  children?: TreeNode[];
}

export async function GET(request: Request) {
  const authed = await getAuthedClient(request);
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, userId } = authed;

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .single();
  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });
  }

  const [{ data: folders, error: foldersError }, { data: notes, error: notesError }] = await Promise.all([
    supabase.from("folders").select("id, parent_id, name").eq("workspace_id", workspace.id),
    supabase.from("notes").select("id, folder_id, name, note_type, version").eq("workspace_id", workspace.id),
  ]);
  if (foldersError) return dbErrorResponse(foldersError, "GET /api/tree folders");
  if (notesError) return dbErrorResponse(notesError, "GET /api/tree notes");

  const build = (parentId: string | null): TreeNode[] => {
    const childFolders = (folders ?? [])
      .filter((f) => f.parent_id === parentId)
      .map((f) => ({ id: f.id, name: f.name, isDirectory: true, children: build(f.id) }));
    const childNotes = (notes ?? [])
      .filter((n) => n.folder_id === parentId)
      .map((n) => ({ id: n.id, name: n.name, isDirectory: false, noteType: n.note_type, version: n.version }));
    return [...childFolders, ...childNotes].sort((a, b) => a.name.localeCompare(b.name));
  };

  return NextResponse.json(build(null));
}
