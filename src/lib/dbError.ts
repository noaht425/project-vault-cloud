import { NextResponse } from "next/server";

// Postgres/PostgREST error.message can include schema/constraint/column
// names — not a secret (RLS already scopes every query to the caller's own
// workspace, so it's detail about the caller's own request), but no reason
// to hand it to the client either. Log the real message server-side, return
// a generic one.
export function dbErrorResponse(error: { message: string }, context: string) {
  console.error(`[db] ${context}:`, error.message);
  return NextResponse.json({ error: "Something went wrong, please try again." }, { status: 400 });
}
