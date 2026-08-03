-- Project Vault Cloud — settlement bulk data storage
-- Run once in Supabase Dashboard: SQL Editor -> New query -> paste all -> Run
--
-- Backs a settlement note's residents/buildings arrays once they're too
-- large to fit in a PATCH /api/notes/[id] request body (Vercel's ~4.5MB
-- Serverless Function limit — see docs/plans/2026-08-03-cloud-settlement-
-- storage-offload.md in the Electron app repo). Same shape as
-- 0002_map_images_storage.sql's map-images bucket: private bucket, objects
-- namespaced "{auth.uid()}/{uuid}", RLS checks that first path segment
-- against the caller's own id. Content is JSON instead of an image.

insert into storage.buckets (id, name, public)
values ('settlement-data', 'settlement-data', false)
on conflict (id) do nothing;

create policy "settlement_data_owner_all"
  on storage.objects for all
  using (bucket_id = 'settlement-data' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'settlement-data' and auth.uid()::text = (storage.foldername(name))[1]);
