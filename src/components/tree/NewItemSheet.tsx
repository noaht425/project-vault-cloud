"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

type Kind = "note" | "folder" | null;

// New notes default to the plain-note template (no per-type picker) —
// structured note types get their own creation flow once their sheets
// exist (Phase 2+, not this pass).
export function NewItemSheet({
  folderId,
  open,
  onClose,
}: {
  folderId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { refresh } = useWorkspaceTree();
  const [kind, setKind] = useState<Kind>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = (): void => {
    onClose();
    setKind(null);
    setName("");
    setError(null);
  };

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!kind || !trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "folder") {
        const res = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, parentId: folderId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create folder");
        await refresh();
        close();
      } else {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, folderId, frontmatter: { type: "note", tags: [] }, body: "" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create note");
        await refresh();
        close();
        router.push(`/notes/${data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={close}>
      {!kind ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={() => setKind("note")}>
            New note
          </Button>
          <Button className="w-full" onClick={() => setKind("folder")}>
            New folder
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={kind === "note" ? "Note name" : "Folder name"}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setKind(null)}>
              Back
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
