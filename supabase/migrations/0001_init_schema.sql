-- Project Vault Cloud — initial schema
-- Run once in Supabase Dashboard: SQL Editor -> New query -> paste all -> Run

create extension if not exists pgcrypto;

-- ============================================================
-- workspaces — one per user for now (this is what a local "vault"
-- folder becomes). owner_id is the only access check until a future
-- migration adds shared/collaborative workspaces.
-- ============================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Vault',
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

grant select, insert, update, delete on public.workspaces to authenticated;

create policy "workspaces_owner_all"
  on public.workspaces for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Every new signed-up user gets a workspace automatically, so the API
-- always has somewhere to create notes without an extra setup step.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- folders — replaces filesystem directories. Root-level folders
-- have parent_id null.
-- ============================================================
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, parent_id, name)
);

alter table public.folders enable row level security;

create index idx_folders_workspace on public.folders(workspace_id);
create index idx_folders_parent on public.folders(parent_id);

grant select, insert, update, delete on public.folders to authenticated;

create policy "folders_owner_all"
  on public.folders for all
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

-- ============================================================
-- notes — replaces markdown files. frontmatter holds everything the
-- old "## Word:"/"type:"/"tags:" YAML frontmatter held; note_type is
-- a generated column pulled out of it so it can be indexed/filtered
-- without duplicating data that could drift out of sync.
--
-- version is the whole mechanism for the "don't silently overwrite"
-- requirement: every update is `... where id = $1 and version = $2`.
-- A stale write matches zero rows instead of clobbering a newer one —
-- the API layer turns that into a 409 with the current content, so
-- the caller sees an explicit conflict instead of losing data (the
-- exact failure mode the old file-based conflict copies came from).
-- ============================================================
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete cascade,
  name text not null,
  frontmatter jsonb not null default '{}',
  note_type text generated always as (frontmatter->>'type') stored,
  body text not null default '',
  version int not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, folder_id, name)
);

alter table public.notes enable row level security;

create index idx_notes_workspace on public.notes(workspace_id);
create index idx_notes_folder on public.notes(folder_id);
create index idx_notes_type on public.notes(note_type);

grant select, insert, update, delete on public.notes to authenticated;

create policy "notes_owner_all"
  on public.notes for all
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();
