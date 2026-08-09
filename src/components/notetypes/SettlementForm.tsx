"use client";

import { useEffect, useMemo, useState } from "react";
import { settlementFrontmatterSchema, type SettlementBuilding, type SettlementResident } from "@/lib/noteTypes/settlement";
import { shouldOffloadBulkData } from "@/lib/settlementBulkData";
import { uploadSettlementBulkData, getSettlementBulkData } from "@/lib/settlementStorage";
import { SettlementSetupTab } from "./settlement/SettlementSetupTab";
import { SettlementPeopleTab } from "./settlement/SettlementPeopleTab";
import { SettlementBuildingsTab } from "./settlement/SettlementBuildingsTab";
import { SettlementFactionsTab } from "./settlement/SettlementFactionsTab";

type SettlementTab = "setup" | "people" | "buildings" | "factions";

// Adapted from the Electron app's SettlementSheet.tsx — same tab switcher
// and storage-aware save wrapper (see docs/plans/2026-08-03-cloud-
// settlement-storage-offload.md), rebuilt against this repo's {frontmatter,
// onChange} prop shape instead of a raw content string. Every call site that
// touches residents/buildings (Setup tab's Generate, People/Buildings tabs'
// Promote) is a discrete button tap, never a per-keystroke edit, so
// re-uploading the full arrays to Storage on each one (when large enough to
// need it) is fine.
export function SettlementForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const rawData = useMemo(() => settlementFrontmatterSchema.parse(frontmatter), [frontmatter]);

  const [bulkData, setBulkData] = useState<{ path: string; residents: SettlementResident[]; buildings: SettlementBuilding[] } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Derived, not its own state — "we have a path but haven't fetched a
  // matching blob yet" already fully describes loading, and computing it
  // this way (instead of a parallel setState in the effect below) avoids
  // a synchronous setState call in the effect body (react-hooks/
  // set-state-in-effect — see EventsPillTimelineView's identical pattern).
  const bulkFetching = rawData.bulkDataStoragePath !== null && bulkData?.path !== rawData.bulkDataStoragePath;

  useEffect(() => {
    const path = rawData.bulkDataStoragePath;
    if (!path || bulkData?.path === path) return;
    let cancelled = false;
    getSettlementBulkData(path)
      .then((result) => {
        if (!cancelled) setBulkData({ path, ...result });
      })
      .catch((err) => {
        if (!cancelled) setBulkError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData.bulkDataStoragePath]);

  const data = useMemo(() => {
    if (rawData.bulkDataStoragePath && bulkData && bulkData.path === rawData.bulkDataStoragePath) {
      return { ...rawData, residents: bulkData.residents, buildings: bulkData.buildings };
    }
    return rawData;
  }, [rawData, bulkData]);

  // Storage-aware wrapper: a patch that touches residents/buildings decides,
  // by size, whether they belong inline (small settlement — today's
  // behavior, no Storage round-trip) or in Supabase Storage (large
  // settlement — see shouldOffloadBulkData). Every other patch (Setup tab's
  // non-bulk fields, everything else) flows straight through to onChange
  // unchanged, same as every other ported note type's form.
  const updateFrontmatter = async (patch: Record<string, unknown>): Promise<void> => {
    const touchesBulkData = "residents" in patch || "buildings" in patch;
    if (!touchesBulkData) {
      onChange(patch);
      return;
    }

    const nextResidents = ("residents" in patch ? patch.residents : data.residents) as SettlementResident[];
    const nextBuildings = ("buildings" in patch ? patch.buildings : data.buildings) as SettlementBuilding[];
    const rest = { ...patch };
    delete rest.residents;
    delete rest.buildings;

    if (!shouldOffloadBulkData(nextResidents, nextBuildings)) {
      // Small enough to stay (or go back to being) inline — clears a stale
      // pointer if a previous Generate had offloaded a larger population.
      onChange({ ...rest, residents: nextResidents, buildings: nextBuildings, bulkDataStoragePath: null });
      setBulkData(null);
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    try {
      const { path } = await uploadSettlementBulkData(nextResidents, nextBuildings);
      setBulkData({ path, residents: nextResidents, buildings: nextBuildings });
      onChange({ ...rest, residents: [], buildings: [], bulkDataStoragePath: path });
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBulkSaving(false);
    }
  };

  const [tab, setTab] = useState<SettlementTab>("setup");

  const tabs: { id: SettlementTab; label: string }[] = [
    { id: "setup", label: "Setup" },
    { id: "people", label: `People (${data.residents.length})` },
    { id: "buildings", label: `Buildings (${data.buildings.length})` },
    { id: "factions", label: `Factions (${data.factions.length})` },
  ];

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`px-2.5 py-1 text-sm rounded-md border ${tab === t.id ? "bg-accent border-accent text-white" : "border-border hover:bg-hover"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {bulkFetching && <p className="text-sm text-muted">Loading residents/buildings…</p>}
      {bulkSaving && <p className="text-sm text-muted">Saving residents/buildings…</p>}
      {bulkError && <p className="text-sm text-danger">{bulkError}</p>}

      {tab === "setup" && <SettlementSetupTab data={data} updateFrontmatter={updateFrontmatter} />}
      {tab === "people" && <SettlementPeopleTab data={data} updateFrontmatter={updateFrontmatter} />}
      {tab === "buildings" && <SettlementBuildingsTab data={data} updateFrontmatter={updateFrontmatter} />}
      {tab === "factions" && <SettlementFactionsTab data={data} />}
    </div>
  );
}
