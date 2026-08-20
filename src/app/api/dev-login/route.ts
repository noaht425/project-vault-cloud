import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Local-development-only convenience: signs into a throwaway dev account so
// an automated browser session doesn't need a real password typed into it
// on every dev server restart. Not a new auth mechanism — this calls the
// exact same supabase.auth.signInWithPassword() the real sign-in form uses
// (src/app/(auth)/sign-in/page.tsx), just triggered by a GET instead of a
// form submit.
//
// Inert everywhere except `next dev`: NODE_ENV is 'production' for every
// `next build`/`next start`, which is what Vercel actually runs — there is
// no supported way to make a deployed build report 'development'. The
// second ENABLE_DEV_LOGIN check is a deliberate extra opt-in on top of that,
// so running `next dev` alone doesn't silently expose a login-as-whoever
// route; both must be set. Credentials live only in .env.local (gitignored,
// never present on Vercel) for an account you create yourself via the
// normal Sign Up page — this route never creates or knows about accounts on
// its own.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.ENABLE_DEV_LOGIN !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return new NextResponse("Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD in .env.local first.", { status: 500 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return new NextResponse(`Dev login failed: ${error.message}`, { status: 401 });

  return NextResponse.redirect(new URL("/vault", request.url));
}
