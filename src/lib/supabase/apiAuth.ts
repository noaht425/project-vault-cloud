import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "./server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// API routes need to authenticate two kinds of caller: the web test
// harness, which relies on the cookie-based session from
// src/lib/supabase/server.ts, and non-browser clients (the Electron app)
// that can't hold browser cookies and send a bearer token instead. Bearer
// auth.getUser(token) validates the JWT directly against Supabase Auth —
// unlike the no-argument form, it doesn't depend on any client-side
// session state, which a freshly created client here never has.
export async function getAuthedClient(request: Request): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const bearerClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await bearerClient.auth.getUser(token);
    if (error || !data.user) return null;
    return { supabase: bearerClient, userId: data.user.id };
  }

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase, userId: data.user.id };
}
