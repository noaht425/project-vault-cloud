"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { WorkspaceTreeProvider } from "@/components/tree/WorkspaceTreeProvider";
import { Sidebar } from "@/components/tree/Sidebar";
import { DiceRoller } from "@/components/dice/DiceRoller";

// Nav chrome shared by every authenticated route. WorkspaceTreeProvider
// lives here (not in a specific page) so the fetched tree survives
// client-side navigation between folders/notes. Sidebar renders the same
// tree as a permanently-expanded desktop panel; it's hidden entirely on
// mobile (see its own `hidden md:flex`), where FolderBrowser is the sole
// content pane instead — same data, no second fetch.
export function Shell({ userEmail, children }: { userEmail: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async (): Promise<void> => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <WorkspaceTreeProvider>
      <div className="min-h-full flex flex-col">
        <header className="flex items-center justify-between gap-3 gap-y-2 flex-wrap px-4 py-3 border-b border-border bg-sidebar">
          <span className="font-serif text-base">Project Vault</span>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {userEmail && <span className="text-sm text-muted hidden sm:inline">{userEmail}</span>}
            <DiceRoller />
            <Link href="/events">
              <Button variant="ghost" aria-label="Events">
                Events
              </Button>
            </Link>
            <Link href="/initiative">
              <Button variant="ghost" aria-label="Initiative tracker">
                Initiative
              </Button>
            </Link>
            <Link href="/contradictions">
              <Button variant="ghost" aria-label="Contradiction check">
                Checks
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="ghost" aria-label="Search">
                Search
              </Button>
            </Link>
            <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>
        <div className="flex-1 flex min-h-0">
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </div>
      </div>
    </WorkspaceTreeProvider>
  );
}
