"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { getChildrenOf, getPathToNode, type TreeNode } from "@/lib/workspaceTree";

function activeNodeIdFromPathname(pathname: string): string | null {
  return pathname.match(/^\/folders\/([^/]+)/)?.[1] ?? pathname.match(/^\/notes\/([^/]+)/)?.[1] ?? null;
}

// getChildrenOf([node], node.id) works because findNodeById checks the node
// itself before recursing — this reuses the same folders-first sort as
// FolderBrowser instead of duplicating it here.
function SidebarNode({
  node,
  depth,
  pathname,
  expandedIds,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  pathname: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const href = node.isDirectory ? `/folders/${node.id}` : `/notes/${node.id}`;
  const isActive = pathname === href;
  const children = node.isDirectory ? getChildrenOf([node], node.id) : [];
  const isExpanded = expandedIds.has(node.id);

  return (
    <div>
      <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 14 }}>
        {node.isDirectory && children.length > 0 ? (
          <button
            type="button"
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="w-4 shrink-0 text-muted hover:text-normal bg-transparent border-0 cursor-pointer p-0 text-[10px] leading-none"
            onClick={() => onToggle(node.id)}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Link
          href={href}
          className={`flex-1 min-w-0 truncate px-1.5 py-1.5 rounded text-sm hover:bg-hover ${isActive ? "bg-active" : ""} ${
            node.isDirectory ? "font-medium" : ""
          }`}
        >
          {node.name}
        </Link>
      </div>
      {node.isDirectory &&
        isExpanded &&
        children.map((child) => (
          <SidebarNode key={child.id} node={child} depth={depth + 1} pathname={pathname} expandedIds={expandedIds} onToggle={onToggle} />
        ))}
    </div>
  );
}

// Desktop-only (hidden below md:), rendering of the same tree data
// FolderBrowser uses on mobile — no separate fetch, no separate data
// shape. Folders start collapsed (a vault with many categories otherwise
// renders as one very long permanently-expanded list, confirmed as a real
// problem on a real vault) except for the ancestor chain down to whichever
// folder/note is currently open, so you can always see where you are
// without manually expanding each level first.
export function Sidebar() {
  const pathname = usePathname();
  const { tree, loading } = useWorkspaceTree();
  const rootChildren = tree ? getChildrenOf(tree, null) : [];

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Tracks which active node the auto-expand below has already run for —
  // without it, every render would re-force the ancestor chain open,
  // fighting the user's own manual collapse of an ancestor they'd already
  // opened once. Re-derives (not an effect) the same "adjust state during
  // render" way MapCanvas.tsx's mode/image resets do.
  const [autoExpandedFor, setAutoExpandedFor] = useState<string | null>(null);
  const activeId = activeNodeIdFromPathname(pathname);
  if (tree && activeId && autoExpandedFor !== activeId) {
    setAutoExpandedFor(activeId);
    const ancestors = getPathToNode(tree, activeId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const node of ancestors) if (node.isDirectory) next.add(node.id);
      return next;
    });
  }

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 shrink-0 border-r border-border bg-sidebar overflow-y-auto p-2">
      <Link
        href="/"
        className={`block truncate px-2 py-1.5 rounded text-sm font-serif hover:bg-hover ${pathname === "/" ? "bg-active" : ""}`}
      >
        Vault
      </Link>
      {loading && !tree && <p className="px-2 py-1.5 text-sm text-muted">Loading…</p>}
      {rootChildren.map((node) => (
        <SidebarNode key={node.id} node={node} depth={0} pathname={pathname} expandedIds={expandedIds} onToggle={toggle} />
      ))}
    </aside>
  );
}
