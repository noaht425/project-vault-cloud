# Project Vault Cloud

Early prototype of a hosted backend for [Project Vault](../Project%20Vault) — validating that a
Postgres-backed API can replace the local vault-folder storage while staying at least as fast
(local-first caching, not built yet) and never silently overwriting a note (optimistic
concurrency via each note's `version` column — see `src/app/api/notes/[id]/route.ts`).

## Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com) — a separate project
   from A Bent Fork's, since this is a different app with different data.
2. Copy `.env.local.example` to `.env.local` and fill in the URL/anon key from
   Settings -> API.
3. Run `supabase/migrations/0001_init_schema.sql` in the Supabase Dashboard's SQL Editor
   (New query -> paste the whole file -> Run). This creates the `workspaces`, `folders`, and
   `notes` tables, RLS policies, and a trigger that gives every new signed-up user a workspace.
4. `npm install`
5. `npm run dev` and open [http://localhost:3000](http://localhost:3000).

There's no sign-up UI yet — the API routes exist (`POST /api/notes`, `GET /api/notes/[id]`,
`PATCH /api/notes/[id]`) but need an authenticated Supabase session to call, which currently
means creating a user manually in the Supabase Dashboard (Authentication -> Users -> Add user)
and signing in via the Supabase JS client from the browser console until real auth pages exist.

## What's here vs. what's next

Built: schema, RLS, and the create/read/update note endpoints with version-conflict handling.

Not built yet: sign-in UI, folder endpoints, listing/tree endpoint, and the local-first cache
layer on the client (the piece that makes this feel as fast as the local-file version instead of
round-tripping to the server on every read).
