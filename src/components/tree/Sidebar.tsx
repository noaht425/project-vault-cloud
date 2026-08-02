"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceTree } from "./WorkspaceTreeProvider";
import { getChildrenOf, type TreeNode } from "@/lib/workspaceTree";

// getChildrenOf([node], node.id) works because findNodeById checks the node
// itself before recursing — this reuses the same folders-first sort as
// FolderBrowser instead of duplicating it here.
function SidebarNode({ node, depth, pathname }: { node: TreeNode; depth: number; pathname: string }) {
  const href = node.isDirectory ? `/folders/${node.id}` : `/notes/${node.id}`;
  const isActive = pathname === href;
  const children = node.isDirectory ? getChildrenOf([node], node.id) : [];

  return (
    <div>
      <Link
        href={href}
        className={`block truncate px-2 py-1.5 rounded text-sm hover:bg-hover ${isActive ? "bg-active" : ""} ${
          node.isDirectory ? "font-medium" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {node.name}
      </Link>
      {children.map((child) => (
        <SidebarNode key={child.id} node={child} depth={depth + 1} pathname={pathname} />
      ))}
    </div>
  );
}

// Desktop-only (hidden below md:), permanently-expanded rendering of the
// same tree data FolderBrowser uses on mobile — no separate fetch, no
// separate data shape.
export function Sidebar() {
  const pathname = usePathname();
  const { tree, loading } = useWorkspaceTree();
  const rootChildren = tree ? getChildrenOf(tree, null) : [];

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
        <SidebarNode key={node.id} node={node} depth={0} pathname={pathname} />
      ))}
    </aside>
  );
}
