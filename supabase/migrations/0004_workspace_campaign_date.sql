-- Project Vault Cloud — per-workspace campaign "today" date
-- Run once in Supabase Dashboard: SQL Editor -> New query -> paste all -> Run
--
-- Month-grid Calendar view (Events section) — a per-vault/per-workspace
-- in-world "today," same "shared setting, not per-user" reasoning as
-- 0003's active_calendar_titles. Mirrors the local Electron app's
-- VaultSettings.campaignDate (.project-vault-settings.json at the vault
-- root): { calendarNoteTitle, eraId, year, monthId, day } or null if the
-- user hasn't set one yet — the grid still works without it, just opens on
-- the latest event's month with no highlight/upcoming list.

alter table public.workspaces
  add column if not exists campaign_date jsonb;
