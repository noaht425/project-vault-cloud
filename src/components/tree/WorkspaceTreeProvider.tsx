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
    void refresh();
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
