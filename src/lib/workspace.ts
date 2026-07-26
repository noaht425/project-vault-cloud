import type { SupabaseClient } from "@supabase/supabase-js";

// One workspace per user for now — see supabase/migrations/0001_init_schema.sql.
// Shared by every route that needs to scope a query to "this user's stuff."
export async function getWorkspaceId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("workspaces").select("id").eq("owner_id", userId).single();
  return data?.id ?? null;
}
