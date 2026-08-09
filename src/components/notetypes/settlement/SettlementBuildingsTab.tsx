"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BuildingTypeDef, SettlementBuilding, SettlementFrontmatter, SettlementResident } from "@/lib/noteTypes/settlement";
import { BUILDING_SUPERTYPES, BUILDING_SUPERTYPE_LABELS, getBuildingSupertype } from "@/lib/noteTypes/settlement";
import { buildPromotedLocationFrontmatter } from "@/lib/settlementPromotion";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";

type SortKey = "name" | "supertype" | "type" | "wealth" | "district";

const PAGE_SIZE = 50;
const EMPTY_RESIDENTS: SettlementResident[] = [];

interface NoteSummary {
  id: string;
  name: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

function getSortValue(
  b: SettlementBuilding,
  key: SortKey,
  buildingTypeById: Map<string, BuildingTypeDef>,
  wealthTierRankById: Map<string, number>,
  districtNameById: Map<string, string>
): string | number {
  switch (key) {
    case "name":
      return b.name.toLowerCase();
    case "supertype":
      return BUILDING_SUPERTYPES.indexOf(getBuildingSupertype(buildingTypeById.get(b.buildingTypeId)?.category ?? ""));
    case "type":
      return (buildingTypeById.get(b.buildingTypeId)?.name ?? b.buildingTypeId).toLowerCase();
    case "wealth":
      return wealthTierRankById.get(b.wealthTierId) ?? Number.MAX_SAFE_INTEGER;
    case "district":
      return (districtNameById.get(b.districtId) ?? "").toLowerCase();
  }
}

// Adapted from the Electron app's SettlementBuildingsTab.tsx — same card-
// list-not-table adaptation as SettlementPeopleTab.tsx.
export function SettlementBuildingsTab({
  data,
  updateFrontmatter,
}: {
  data: SettlementFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const router = useRouter();
  const [supertypeFilter, setSupertypeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [wealthFilter, setWealthFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(0);

  const districtNameById = useMemo(() => new Map(data.districts.map((d) => [d.id, d.name])), [data.districts]);
  const wealthTierNameById = useMemo(() => new Map(data.wealthTiers.map((t) => [t.id, t.name])), [data.wealthTiers]);
  const wealthTierRankById = useMemo(() => new Map(data.wealthTiers.map((t, i) => [t.id, i])), [data.wealthTiers]);
  const buildingTypeById = useMemo(() => new Map(data.buildingTypes.map((t) => [t.id, t])), [data.buildingTypes]);

  const residentsByBuildingId = useMemo(() => {
    const map = new Map<string, SettlementResident[]>();
    for (const r of data.residents) {
      for (const buildingId of new Set([r.homeBuildingId, r.professionBuildingId])) {
        if (!buildingId) continue;
        const list = map.get(buildingId);
        if (list) list.push(r);
        else map.set(buildingId, [r]);
      }
    }
    return map;
  }, [data.residents]);

  const filtered = useMemo(
    () =>
      data.buildings.filter((b) => {
        if (supertypeFilter && getBuildingSupertype(buildingTypeById.get(b.buildingTypeId)?.category ?? "") !== supertypeFilter) return false;
        if (typeFilter && b.buildingTypeId !== typeFilter) return false;
        if (wealthFilter && b.wealthTierId !== wealthFilter) return false;
        if (districtFilter && b.districtId !== districtFilter) return false;
        return true;
      }),
    [data.buildings, buildingTypeById, supertypeFilter, typeFilter, wealthFilter, districtFilter]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const va = getSortValue(a, sortKey, buildingTypeById, wealthTierRankById, districtNameById);
        const vb = getSortValue(b, sortKey, buildingTypeById, wealthTierRankById, districtNameById);
        return typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
          : va < vb
            ? -1
            : va > vb
              ? 1
              : 0;
      }),
    [filtered, sortKey, buildingTypeById, wealthTierRankById, districtNameById]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(() => sorted.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE), [sorted, clampedPage]);

  const promote = async (building: SettlementBuilding) => {
    setPromotingId(building.id);
    setPromoteError(null);
    try {
      const buildingType = buildingTypeById.get(building.buildingTypeId);
      const { frontmatter, body } = buildPromotedLocationFrontmatter(
        building,
        buildingType?.name ?? "",
        districtNameById.get(building.districtId) ?? "",
        wealthTierNameById.get(building.wealthTierId) ?? ""
      );
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: building.name, folderId: null, frontmatter, body }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error ?? "Could not create note");
      await updateFrontmatter({
        buildings: data.buildings.map((b) => (b.id === building.id ? { ...b, linkedNoteTitle: created.name } : b)),
      });
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromotingId(null);
    }
  };

  const openLinkedNote = async (title: string) => {
    const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(title)}`).catch(() => []);
    const id = resolveWikiLinkTitle(matches, title);
    if (id) router.push(`/notes/${id}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <SelectField
          label="Group"
          className="w-28"
          value={supertypeFilter}
          onChange={(e) => {
            setSupertypeFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All groups</option>
          {BUILDING_SUPERTYPES.map((s) => (
            <option key={s} value={s}>
              {BUILDING_SUPERTYPE_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Type"
          className="w-32"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All types</option>
          {data.buildingTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Wealth"
          className="w-28"
          value={wealthFilter}
          onChange={(e) => {
            setWealthFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All tiers</option>
          {data.wealthTiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="District"
          className="w-32"
          value={districtFilter}
          onChange={(e) => {
            setDistrictFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All districts</option>
          {data.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sort by" className="w-28" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="supertype">Group</option>
          <option value="type">Type</option>
          <option value="wealth">Wealth</option>
          <option value="district">District</option>
        </SelectField>
      </div>

      <p className="text-sm text-muted">
        {filtered.length} of {data.buildings.length} buildings
        {totalPages > 1 ? ` — page ${clampedPage + 1} of ${totalPages}` : ""}
      </p>
      {promoteError && <p className="text-sm text-danger">{promoteError}</p>}
      {data.buildings.length === 0 && <p className="text-sm text-muted">No buildings yet — use the Setup tab&apos;s Generate button.</p>}

      <div className="flex flex-col gap-1.5">
        {pageItems.map((b) => {
          const residentsHere = residentsByBuildingId.get(b.id) ?? EMPTY_RESIDENTS;
          return (
            <div key={b.id} className="border border-border rounded-lg overflow-hidden">
              <button className="w-full text-left p-2.5 bg-transparent border-0 cursor-pointer" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {BUILDING_SUPERTYPE_LABELS[getBuildingSupertype(buildingTypeById.get(b.buildingTypeId)?.category ?? "")]} ·{" "}
                  {buildingTypeById.get(b.buildingTypeId)?.name ?? b.buildingTypeId} · {wealthTierNameById.get(b.wealthTierId) ?? ""} ·{" "}
                  {districtNameById.get(b.districtId) ?? ""}
                </div>
              </button>
              {expandedId === b.id && (
                <div className="p-2.5 border-t border-border bg-panel text-sm flex flex-col gap-2">
                  {residentsHere.length === 0 ? (
                    <div className="text-muted">No residents live or work here.</div>
                  ) : (
                    residentsHere.map((r) => {
                      const roles: string[] = [];
                      if (r.homeBuildingId === b.id) roles.push("lives here");
                      if (r.professionBuildingId === b.id) roles.push(r.jobTitle ? r.jobTitle.toLowerCase() : "works here");
                      return (
                        <div key={r.id}>
                          {r.name} <span className="text-muted">({roles.join(", ")})</span>
                        </div>
                      );
                    })
                  )}
                  {b.inventory.length > 0 && (
                    <div>
                      <strong>In stock</strong>
                      {/* Semicolons, not commas — several item names contain
                          their own commas (e.g. "Ladder, 10-foot"). */}
                      <div className="text-muted">{b.inventory.join("; ")}</div>
                    </div>
                  )}
                  {b.linkedNoteTitle ? (
                    <Button onClick={() => void openLinkedNote(b.linkedNoteTitle!)}>Open note →</Button>
                  ) : (
                    <Button variant="primary" disabled={promotingId === b.id} onClick={() => void promote(b)}>
                      {promotingId === b.id ? "Promoting…" : "Promote to Location"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-muted">
            Page {clampedPage + 1} of {totalPages}
          </span>
          <Button disabled={clampedPage >= totalPages - 1} onClick={() => setPage(clampedPage + 1)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
