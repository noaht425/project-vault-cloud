"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { TreeNode } from "@/lib/workspaceTree";

interface WorkspaceTreeContextValue {
  tree: TreeNode[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WorkspaceTreeContext = createContext<WorkspaceTreeContextValue | null>(null);

// Fetches /api/tree once (the whole workspace in one call) and holds it for
// every route under (app) — drill-down navigation is then just client-side
// filtering of this, no per-tap network round trip. Lives in Shell.tsx so
// it survives client-side navigation between folders/notes.
export function WorkspaceTreeProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tree");
      if (!res.ok) throw new Error(`Could not load workspace (${res.status})`);
      setTree(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so refresh()'s own synchronous setLoading(true)/
    // setError(null) prefix doesn't run as part of this effect's own
    // synchronous execution (react-hooks/set-state-in-effect) — refresh()
    // is also called directly from event handlers elsewhere (after
    // create/rename/delete), where that immediate feedback is fine and
    // isn't flagged, since those aren't effect bodies.
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <WorkspaceTreeContext.Provider value={{ tree, loading, error, refresh }}>{children}</WorkspaceTreeContext.Provider>
  );
}

export function useWorkspaceTree(): WorkspaceTreeContextValue {
  const ctx = useContext(WorkspaceTreeContext);
  if (!ctx) throw new Error("useWorkspaceTree must be used within a WorkspaceTreeProvider");
  return ctx;
}
