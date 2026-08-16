"use client";

import Link from "next/link";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { getPathToNode } from "@/lib/workspaceTree";

export function Breadcrumbs({ folderId }: { folderId: string | null }) {
  const { tree } = useWorkspaceTree();
  const path = tree && folderId ? getPathToNode(tree, folderId) : [];

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted overflow-x-auto whitespace-nowrap border-b border-border">
      <Link href="/vault" className="hover:text-normal shrink-0">
        Vault
      </Link>
      {path.map((node, i) => (
        <span key={node.id} className="flex items-center gap-1.5 shrink-0">
          <span>/</span>
          {i === path.length - 1 ? (
            <span className="text-normal">{node.name}</span>
          ) : (
            <Link href={`/folders/${node.id}`} className="hover:text-normal">
              {node.name}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}
