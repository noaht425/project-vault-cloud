"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

// Nav chrome shared by every authenticated route. Deliberately minimal for
// now — Phase 3 fills in the workspace tree/sidebar; this phase only needs
// enough shell to prove sign-in -> authenticated area -> sign-out works
// end to end.
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
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-sidebar">
        <span className="font-serif text-base">Project Vault</span>
        <div className="flex items-center gap-2">
          {userEmail && <span className="text-sm text-muted hidden sm:inline">{userEmail}</span>}
          <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  );
}
