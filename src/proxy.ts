import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return updateSession(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
