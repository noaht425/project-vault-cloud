"use client";

import { createClient } from "@/lib/supabase/client";
import type { SettlementBuilding, SettlementResident } from "@/lib/noteTypes/settlement";

const SETTLEMENT_DATA_BUCKET = "settlement-data";

// Mirrors the Electron app's cloudSession.ts uploadSettlementBulkData/
// getSettlementBulkData (see docs/plans/2026-08-03-cloud-settlement-storage-
// offload.md) — a settlement's residents/buildings can run 30+MB of JSON at
// Metropolis scale, nowhere close to fitting in a PATCH /api/notes/[id]
// body under Vercel's ~4.5MB Serverless Function limit. This uploads/
// downloads that data directly against Supabase Storage using the
// browser's own authenticated session (createBrowserClient already carries
// it via cookies — no bearer-token dance needed the way Electron's main
// process requires), bypassing the Vercel API — and its size limit —
// entirely for this data. Object paths are namespaced under the caller's
// own user id, matching the "settlement_data_owner_all" RLS policy
// (0005_settlement_data_storage.sql).
export async function uploadSettlementBulkData(
  residents: SettlementResident[],
  buildings: SettlementBuilding[]
): Promise<{ path: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const objectPath = `${user.id}/${crypto.randomUUID()}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify({ residents, buildings }));

  const { error } = await supabase.storage
    .from(SETTLEMENT_DATA_BUCKET)
    .upload(objectPath, bytes, { contentType: "application/json" });
  if (error) throw new Error(error.message);

  return { path: objectPath };
}

export async function getSettlementBulkData(
  path: string
): Promise<{ residents: SettlementResident[]; buildings: SettlementBuilding[] }> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(SETTLEMENT_DATA_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "Failed to download settlement data");
  return JSON.parse(await data.text()) as { residents: SettlementResident[]; buildings: SettlementBuilding[] };
}
