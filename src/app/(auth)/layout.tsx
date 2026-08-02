import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Symmetric with (app)/layout.tsx's server-side gate — a signed-in user
// hitting /sign-in or /sign-up directly (e.g. a stale bookmark, or tapping
// back after signing in) gets sent to their workspace instead of the form,
// same "decide server-side before painting anything" principle.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
