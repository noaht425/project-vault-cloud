import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell/Shell";

// Server-side gate: decide before painting anything, rather than a client
// component briefly rendering authenticated UI (or a redirect flash) while
// a getUser() call is still in flight. Every route under (app) is private.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return <Shell userEmail={user.email ?? null}>{children}</Shell>;
}
