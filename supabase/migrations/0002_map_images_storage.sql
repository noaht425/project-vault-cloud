-- Project Vault Cloud — map images storage
-- Run once in Supabase Dashboard: SQL Editor -> New query -> paste all -> Run
--
-- Backs the new "map" note type's background images. Private bucket —
-- objects are only ever reached via a signed URL the app requests for
-- itself, never a public URL. Object paths are namespaced
-- "{auth.uid()}/{uuid}-{filename}", and the RLS policy below checks that
-- first path segment against the caller's own id, mirroring the
-- owner_id-scoping every table in 0001_init_schema.sql already uses.

insert into storage.buckets (id, name, public)
values ('map-images', 'map-images', false)
on conflict (id) do nothing;

create policy "map_images_owner_all"
  on storage.objects for all
  using (bucket_id = 'map-images' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'map-images' and auth.uid()::text = (storage.foldername(name))[1]);
