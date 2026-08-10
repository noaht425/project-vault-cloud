"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SettlementFrontmatter, SettlementResident } from "@/lib/noteTypes/settlement";
import { buildPromotedNpcFrontmatter } from "@/lib/settlementPromotion";
import { relationLabel } from "@/lib/settlementGenerator";
import { raceLabel } from "@/lib/settlementNames";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

type SortKey = "name" | "race" | "age" | "wealth" | "district" | "notable";
type SortDir = "asc" | "desc";

// Rows rendered per page — a Metropolis-scale settlement can have tens of
// thousands of residents, and an unpaginated list (every row always in the
// DOM) is the actual cause of "tapping to expand a row feels slow," not
// anything happening in the tap handler itself. Same PAGE_SIZE as the
// Electron app's table.
const PAGE_SIZE = 50;

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
  r: SettlementResident,
  key: SortKey,
  wealthTierRankById: Map<string, number>,
  districtNameById: Map<string, string>,
  customRaces: SettlementFrontmatter["customRaces"]
): string | number {
  switch (key) {
    case "name":
      return r.name.toLowerCase();
    case "race":
      return raceLabel(r.race, customRaces).toLowerCase();
    case "age":
      return r.age;
    case "wealth":
      return wealthTierRankById.get(r.wealthTierId) ?? Number.MAX_SAFE_INTEGER;
    case "district":
      return (districtNameById.get(r.districtId) ?? "").toLowerCase();
    case "notable":
      return r.notable ? 1 : 0;
  }
}

function SortableHeader({
  label,
  sortKeyValue,
  activeSortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeSortKey === sortKeyValue;
  return (
    <th className="text-left cursor-pointer select-none py-1.5 pr-3 whitespace-nowrap" onClick={() => onSort(sortKeyValue)}>
      {label} {active && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );
}

// The expanded-detail content shared by the mobile card's expand panel and
// the desktop table's expanded row — kept as one block so the two layouts
// can never drift out of sync with each other.
function ResidentDetail({ r, onOpen, onPromote, promoting }: { r: SettlementResident; onOpen: () => void; onPromote: () => void; promoting: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {r.jobTitle && <div>{r.jobTitle}</div>}
      {r.notable ? (
        <>
          {r.personalityLine && <div>{r.personalityLine}</div>}
          {r.goal && <div>{`${r.name} ${r.goal}.`}</div>}
          {r.stats && (
            <div>
              STR {r.stats.str} DEX {r.stats.dex} CON {r.stats.con} INT {r.stats.int} WIS {r.stats.wis} CHA {r.stats.cha}
            </div>
          )}
          {r.proficiencies.length > 0 && <div>Proficient in: {r.proficiencies.join(", ")}</div>}
          {r.appearance && (
            <div className="whitespace-pre-line">
              <strong>Appearance</strong>
              <br />
              {r.appearance}
            </div>
          )}
          {r.relatives.length > 0 && (
            <div>
              <strong>Family</strong>
              <ul className="mt-0.5 pl-4.5">
                {r.relatives.map((rel) => (
                  <li key={rel.id}>
                    {relationLabel(rel.relation, r.gender)} {rel.name} {rel.livingStatus === "deceased" ? "(deceased)" : `(${rel.age})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div>{r.flavorTag}</div>
      )}
      <div className="text-xs text-muted">
        {r.employmentStatus === "unemployed" && !r.notable ? "Unemployed. " : ""}
        {r.homeless ? "Homeless. " : ""}
        {r.educated ? "Educated. " : ""}
        {r.religion ? `Follows ${r.religion}.` : ""}
      </div>
      {r.linkedNoteTitle ? (
        <Button onClick={onOpen}>Open note →</Button>
      ) : (
        <Button variant="primary" disabled={promoting} onClick={onPromote}>
          {promoting ? "Promoting…" : "Promote to NPC"}
        </Button>
      )}
    </div>
  );
}

// Adapted from the Electron app's SettlementPeopleTab.tsx — same search/
// filter/sort/paginate/promote feature set. Below md: a card list (a
// 9-column table is unusable at phone width); at md:+ a real sortable
// table, closer to the Electron original's own table, since desktop has
// the width and mouse precision to make clickable column headers and more
// visible columns worthwhile.
export function SettlementPeopleTab({
  data,
  updateFrontmatter,
}: {
  data: SettlementFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [raceFilter, setRaceFilter] = useState("");
  const [wealthFilter, setWealthFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [notableOnly, setNotableOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const districtNameById = useMemo(() => new Map(data.districts.map((d) => [d.id, d.name])), [data.districts]);
  const wealthTierNameById = useMemo(() => new Map(data.wealthTiers.map((t) => [t.id, t.name])), [data.wealthTiers]);
  const wealthTierRankById = useMemo(() => new Map(data.wealthTiers.map((t, i) => [t.id, i])), [data.wealthTiers]);
  const buildingNameById = useMemo(() => new Map(data.buildings.map((b) => [b.id, b.name])), [data.buildings]);
  const races = useMemo(() => Array.from(new Set(data.residents.map((r) => r.race))).sort(), [data.residents]);

  const filtered = useMemo(
    () =>
      data.residents.filter((r) => {
        if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (raceFilter && r.race !== raceFilter) return false;
        if (wealthFilter && r.wealthTierId !== wealthFilter) return false;
        if (districtFilter && r.districtId !== districtFilter) return false;
        if (notableOnly && !r.notable) return false;
        return true;
      }),
    [data.residents, search, raceFilter, wealthFilter, districtFilter, notableOnly]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const va = getSortValue(a, sortKey, wealthTierRankById, districtNameById, data.customRaces);
        const vb = getSortValue(b, sortKey, wealthTierRankById, districtNameById, data.customRaces);
        const cmp =
          typeof va === "string" && typeof vb === "string"
            ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
            : va < vb
              ? -1
              : va > vb
                ? 1
                : 0;
        return sortDir === "asc" ? cmp : -cmp;
      }),
    [filtered, sortKey, sortDir, wealthTierRankById, districtNameById, data.customRaces]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(() => sorted.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE), [sorted, clampedPage]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  // Mobile's plain "Sort by" dropdown only ever picks a key, always
  // ascending — the direction toggle is desktop-table-only (clicking a
  // header again to reverse), see toggleSort above.
  const selectSortKey = (key: SortKey) => {
    setSortKey(key);
    setPage(0);
  };

  const promote = async (resident: SettlementResident) => {
    setPromotingId(resident.id);
    setPromoteError(null);
    try {
      const { frontmatter, body } = buildPromotedNpcFrontmatter(
        resident,
        districtNameById.get(resident.districtId) ?? "",
        wealthTierNameById.get(resident.wealthTierId) ?? ""
      );
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: resident.name, folderId: null, frontmatter, body }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error ?? "Could not create note");
      await updateFrontmatter({
        residents: data.residents.map((r) => (r.id === resident.id ? { ...r, linkedNoteTitle: created.name } : r)),
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
        <TextField
          label="Search name"
          className="w-36"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <SelectField
          label="Race"
          className="w-32"
          value={raceFilter}
          onChange={(e) => {
            setRaceFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All races</option>
          {races.map((r) => (
            <option key={r} value={r}>
              {raceLabel(r, data.customRaces)}
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
        {/* Sort-by dropdown is mobile-only — the desktop table's clickable
            column headers below cover the same job with the direction
            toggle a dropdown can't offer. */}
        <SelectField label="Sort by" className="w-28 md:hidden" value={sortKey} onChange={(e) => selectSortKey(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="race">Race</option>
          <option value="age">Age</option>
          <option value="wealth">Wealth</option>
          <option value="district">District</option>
          <option value="notable">Notable</option>
        </SelectField>
        <label className="flex items-center gap-1.5 text-sm self-end mb-1.5">
          <input
            type="checkbox"
            checked={notableOnly}
            onChange={(e) => {
              setNotableOnly(e.target.checked);
              setPage(0);
            }}
          />
          Notable only
        </label>
      </div>

      <p className="text-sm text-muted">
        {filtered.length} of {data.residents.length} residents
        {totalPages > 1 ? ` — page ${clampedPage + 1} of ${totalPages}` : ""}
      </p>
      {promoteError && <p className="text-sm text-danger">{promoteError}</p>}
      {data.residents.length === 0 && <p className="text-sm text-muted">No residents yet — use the Setup tab&apos;s Generate button.</p>}

      {/* Mobile: tap-to-expand cards. */}
      <div className="flex flex-col gap-1.5 md:hidden">
        {pageItems.map((r) => (
          <div key={r.id} className="border border-border rounded-lg overflow-hidden">
            <button className="w-full text-left p-2.5 bg-transparent border-0 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{r.name}</span>
                {r.notable && <span title="Notable">★</span>}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {raceLabel(r.race, data.customRaces)} · Age {r.age}
                {r.gender ? ` · ${r.gender}` : ""} · {wealthTierNameById.get(r.wealthTierId) ?? ""} ·{" "}
                {districtNameById.get(r.districtId) ?? ""}
                {r.professionBuildingId && <> · {buildingNameById.get(r.professionBuildingId) ?? ""}</>}
              </div>
            </button>
            {expandedId === r.id && (
              <div className="p-2.5 border-t border-border bg-panel text-sm">
                <ResidentDetail
                  r={r}
                  onOpen={() => void openLinkedNote(r.linkedNoteTitle!)}
                  onPromote={() => void promote(r)}
                  promoting={promotingId === r.id}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: sortable table, click a row to expand its detail below it. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <SortableHeader label="Name" sortKeyValue="name" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Race" sortKeyValue="race" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Age" sortKeyValue="age" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-left py-1.5 pr-3">Gender</th>
              <SortableHeader label="Wealth" sortKeyValue="wealth" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="District" sortKeyValue="district" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Notable" sortKeyValue="notable" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-left py-1.5 pr-3">Workplace</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b border-border cursor-pointer hover:bg-hover" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <td className="py-1.5 pr-3">{r.name}</td>
                  <td className="py-1.5 pr-3">{raceLabel(r.race, data.customRaces)}</td>
                  <td className="py-1.5 pr-3">{r.age}</td>
                  <td className="py-1.5 pr-3">{r.gender}</td>
                  <td className="py-1.5 pr-3">{wealthTierNameById.get(r.wealthTierId) ?? ""}</td>
                  <td className="py-1.5 pr-3">{districtNameById.get(r.districtId) ?? ""}</td>
                  <td className="py-1.5 pr-3">{r.notable ? "★" : ""}</td>
                  <td className="py-1.5 pr-3">{r.professionBuildingId ? (buildingNameById.get(r.professionBuildingId) ?? "") : ""}</td>
                  <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.linkedNoteTitle ? (
                      <Button onClick={() => void openLinkedNote(r.linkedNoteTitle!)}>Open →</Button>
                    ) : (
                      <Button variant="primary" disabled={promotingId === r.id} onClick={() => void promote(r)}>
                        {promotingId === r.id ? "Promoting…" : "Promote"}
                      </Button>
                    )}
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr className="border-b border-border bg-panel">
                    <td colSpan={9} className="p-3">
                      <ResidentDetail
                        r={r}
                        onOpen={() => void openLinkedNote(r.linkedNoteTitle!)}
                        onPromote={() => void promote(r)}
                        promoting={promotingId === r.id}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
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
