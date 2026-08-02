// Pure helpers over /api/tree's response shape — no fetch, no React, fully
// unit-testable in isolation.

export interface TreeNode {
  id: string;
  name: string;
  isDirectory: boolean;
  noteType?: string | null;
  version?: number;
  children?: TreeNode[];
}

export function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// The API sorts folders and notes together, purely alphabetically (see
// src/app/api/tree/route.ts) — this re-sorts folders-first, matching the
// Electron desktop app's own tree convention (src/main/vault/tree.ts),
// which is the more familiar file-browser UX. Kept as a client-side
// presentation choice rather than changing the shared API route, since
// that route also serves the Electron app's own Cloud Workspace tree.
function sortFolderFirst(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// null folderId means the workspace root.
export function getChildrenOf(tree: TreeNode[], folderId: string | null): TreeNode[] {
  if (folderId === null) return sortFolderFirst(tree);
  const folder = findNodeById(tree, folderId);
  if (!folder || !folder.isDirectory) return [];
  return sortFolderFirst(folder.children ?? []);
}

// Ancestor chain from the workspace root down to (and including) the given
// node, for breadcrumbs. Returns [] if the node isn't found.
export function getPathToNode(tree: TreeNode[], id: string): TreeNode[] {
  function search(nodes: TreeNode[], trail: TreeNode[]): TreeNode[] | null {
    for (const node of nodes) {
      const nextTrail = [...trail, node];
      if (node.id === id) return nextTrail;
      if (node.children) {
        const found = search(node.children, nextTrail);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree, []) ?? [];
}
