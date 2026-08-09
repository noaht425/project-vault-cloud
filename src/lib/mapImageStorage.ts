"use client";

import { createClient } from "@/lib/supabase/client";

const MAP_IMAGES_BUCKET = "map-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Mirrors the Electron app's cloudSession.ts uploadMapImage/getMapImageUrl.
// Object paths are namespaced under the caller's own user id, matching the
// "map_images_owner_all" RLS policy (0002_map_images_storage.sql, already
// in this repo's migrations). A browser File already carries its own MIME
// type, so unlike Electron's version (reading raw bytes off disk, with no
// type info of its own) there's no need for an extension->contentType map.
export async function uploadMapImage(file: File): Promise<{ path: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const objectPath = `${user.id}/${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(MAP_IMAGES_BUCKET)
    .upload(objectPath, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(error.message);

  return { path: objectPath };
}

export async function getMapImageUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(MAP_IMAGES_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(error?.message ?? "Failed to create signed URL");
  return data.signedUrl;
}
