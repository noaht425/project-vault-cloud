"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { getChildrenOf } from "@/lib/workspaceTree";
import { RowActions } from "./RowActions";
import { NewItemSheet } from "./NewItemSheet";
import { Button } from "@/components/ui/Button";

// The mobile primary view (also used inside Sidebar's desktop rendering of
// the same data). No per-row icon, matching the desktop FileTree's own
// plain-text convention — folders get a trailing "›" disclosure indicator
// since tapping drills into a new screen here, unlike the desktop's
// expand-in-place caret.
export function FolderBrowser({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const { tree, loading, error } = useWorkspaceTree();
  const [newItemOpen, setNewItemOpen] = useState(false);

  if (loading && !tree) {
    return <div className="flex-1 flex items-center justify-center text-muted text-sm p-6">Loading…</div>;
  }
  if (error) {
    return <div className="flex-1 flex items-center justify-center text-danger text-sm p-6 text-center">{error}</div>;
  }
  if (!tree) return null;

  const children = getChildrenOf(tree, folderId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {children.length === 0 && <p className="p-6 text-center text-muted text-sm">Nothing here yet.</p>}
        {children.map((node) => (
          <div
            key={node.id}
            className="flex items-center gap-2 px-4 py-3 border-b border-border cursor-pointer hover:bg-hover"
            onClick={() => router.push(node.isDirectory ? `/folders/${node.id}` : `/notes/${node.id}`)}
          >
            <span className={`flex-1 truncate ${node.isDirectory ? "font-medium" : ""}`}>{node.name}</span>
            {node.isDirectory && <span className="text-muted">›</span>}
            <RowActions node={node} />
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-border">
        <Button variant="primary" className="w-full" onClick={() => setNewItemOpen(true)}>
          + New
        </Button>
      </div>
      <NewItemSheet folderId={folderId} open={newItemOpen} onClose={() => setNewItemOpen(false)} />
    </div>
  );
}
