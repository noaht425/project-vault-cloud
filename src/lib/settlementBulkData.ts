import type { SettlementBuilding, SettlementResident } from './noteTypes/settlement'

// See docs/plans/2026-08-03-cloud-settlement-storage-offload.md. Vercel's
// Serverless Function request body limit is ~4.5MB — this threshold leaves
// headroom under that for the rest of a settlement note's frontmatter
// (Setup-tab config fields, factions, etc.) alongside residents/buildings.
// Below it, Cloud Workspace keeps saving residents/buildings inline exactly
// like today (simplest, no Storage round-trip for the common small-
// settlement case); at/above it, they get offloaded to Supabase Storage
// instead, bypassing the Vercel API (and its size limit) entirely.
export const BULK_DATA_INLINE_THRESHOLD_BYTES = 2_000_000

/** UTF-8 byte size of a settlement's residents+buildings if serialized together, same shape they're stored as in Supabase Storage. */
export function bulkDataByteSize(residents: SettlementResident[], buildings: SettlementBuilding[]): number {
  return new TextEncoder().encode(JSON.stringify({ residents, buildings })).length
}

/** Whether this residents/buildings pair is large enough that Cloud Workspace should store it in Supabase Storage rather than inline in the note's frontmatter. Local Vault never calls this — it has no size limit. */
export function shouldOffloadBulkData(residents: SettlementResident[], buildings: SettlementBuilding[]): boolean {
  return bulkDataByteSize(residents, buildings) >= BULK_DATA_INLINE_THRESHOLD_BYTES
}
