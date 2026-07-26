# Project Vault Cloud

Hosted backend for [Project Vault](../Project%20Vault)'s Cloud Workspace — a Postgres-backed API
that replaces local vault-folder storage while never silently overwriting a note (optimistic
concurrency via each note's `version` column — see `src/app/api/notes/[id]/route.ts`). Consumed
by the Electron app's `cloudSession`/`cloudApi`, not by a web UI (see below).

**Deployed:** [project-vault-cloud.vercel.app](https://project-vault-cloud.vercel.app), under its
own dedicated Vercel team (`noaht425-project-vault`) — kept separate from A Bent Fork's `abentfork`
team. GitHub auto-deploy-on-push isn't connected yet (Vercel's GitHub App needs manual repo access
granted from github.com/settings/installations); until then, deploy changes with
`vercel deploy --prod` from this directory.

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

There's no sign-up UI — creating a user still means using the Supabase Dashboard (Authentication
-> Users -> Add user). The homepage (`src/app/page.tsx`) is a throwaway cookie-auth API test
harness (sign in, create/update/delete notes and folders, force a version conflict, load the
tree) — it predates the Electron app's real Cloud Workspace UI and was never meant to be a real
front end; it's also what's live at the production URL's `/` today.

## What's here vs. what's next

Built: schema, RLS, full note/folder CRUD with version-conflict handling, workspace tree, title
search, full-text search with snippets, backlinks, the note-link graph, and session/event
timeline endpoints (`/api/sessions`, `/api/events`) — see `src/app/api/*`. Bearer-token auth
alongside cookie auth, so the Electron app (which can't hold browser cookies) can call every
route the same way the web test harness does.

Not built yet: a real web UI (sign-up/sign-in pages, an actual note editor) beyond the test
harness above, and a full-text search index (current `/api/search` scans note bodies in process —
fine at prototype scale, see `src/lib/search.ts`).

## Testing

`npm test` runs `vitest` against the pure functions in `src/lib/` (wiki-link extraction, graph
building, search tokenizing/snippets, world-date parsing and comparison, history/born-died fact
extraction) — see `tests/`. The API route handlers themselves aren't covered yet, since they need
a real or mocked Supabase client to exercise.
