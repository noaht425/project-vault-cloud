"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/workspaceTree";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

type Mode = "menu" | "rename" | "confirmDelete";

// Overflow menu per row — action-sheet style rather than the desktop tree's
// hover icons, since hover doesn't exist on a touchscreen. Rename/delete
// hit the same PATCH/DELETE routes the desktop FileTree uses.
export function RowActions({ node, onDeleted }: { node: TreeNode; onDeleted?: () => void }) {
  const { refresh } = useWorkspaceTree();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState(node.name);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = (): void => {
    setOpen(false);
    setMode("menu");
    setName(node.name);
    setError(null);
  };

  const rename = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return close();
    setSubmitting(true);
    setError(null);
    try {
      const url = node.isDirectory ? `/api/folders/${node.id}` : `/api/notes/${node.id}`;
      // Notes are optimistic-concurrency (need the current version); folders
      // aren't versioned at all — see the API route shapes.
      const body = node.isDirectory ? { name: trimmed } : { name: trimmed, version: node.version };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      await refresh();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const url = node.isDirectory ? `/api/folders/${node.id}` : `/api/notes/${node.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await refresh();
      close();
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        aria-label={`Actions for ${node.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ⋯
      </Button>
      <BottomSheet open={open} onClose={close}>
        {mode === "menu" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted truncate px-1">{node.name}</p>
            <Button className="w-full" onClick={() => setMode("rename")}>
              Rename
            </Button>
            <Button variant="danger" className="w-full" onClick={() => setMode("confirmDelete")}>
              Delete
            </Button>
          </div>
        )}
        {mode === "rename" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <TextField label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setMode("menu")}>
                Back
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
        {mode === "confirmDelete" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Delete {node.isDirectory ? "folder" : "note"} &ldquo;{node.name}&rdquo;
              {node.isDirectory ? " and everything inside it" : ""}? This can&apos;t be undone.
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setMode("menu")}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => void del()} disabled={submitting}>
                {submitting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
