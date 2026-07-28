-- Project Vault Cloud — per-workspace calendar/timeline display settings
-- Run once in Supabase Dashboard: SQL Editor -> New query -> paste all -> Run
--
-- Build step 6 of the calendar/timeline system (see the Electron app's
-- docs/plans/2026-07-28-calendar-timeline-system.md — this repo doesn't
-- keep its own copy). Confirmed with the user: per-vault/per-workspace,
-- not per-user, same as every other shared setting in this app — so this
-- is a column on workspaces itself, not a separate per-user table.
-- Mirrors the local Electron app's equivalent (.project-vault-settings.json
-- at the vault root): a plain list of calendar note titles whose dates get
-- shown on the pill timeline. Empty array = no calendars active yet,
-- meaning dates render as raw free text, same "still works with zero
-- configuration" fallback the local app uses.

alter table public.workspaces
  add column if not exists active_calendar_titles jsonb not null default '[]';
