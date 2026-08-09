"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BUILDING_CATEGORIES,
  SETTLEMENT_SIZE_IDS,
  defaultBuildingTypes,
  defaultDistrictsForSize,
  defaultRaceLifeStages,
  resolveEducatedWealthTierIds,
  findPairPercent,
  upsertPairRelation,
  type PairRelation,
  type SettlementFrontmatter,
} from "@/lib/noteTypes/settlement";
import { SETTLEMENT_SIZE_PRESETS, generateSettlement, resolveGatingSizeId } from "@/lib/settlementGenerator";
import { BASELINE_RACES, FACTION_NAME_POOL, NAME_INSPIRATION_SOURCES, raceLabel } from "@/lib/settlementNames";
import { PHONETIC_PROFILES } from "@/lib/phoneticNames";
import { feetAndInchesToInches, inchesToFeetAndInches } from "@/lib/settlementAppearance";
import {
  defaultSettlementPresetFrontmatter,
  extractPresetFields,
  presetFieldsFromPreset,
  settlementPresetFrontmatterSchema,
} from "@/lib/noteTypes/settlementPreset";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";

interface NoteSummary {
  id: string;
  name: string;
}
interface FullNote {
  id: string;
  frontmatter: Record<string, unknown>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

async function findNoteByExactTitle(title: string, type?: string): Promise<FullNote | null> {
  const params = new URLSearchParams({ q: title });
  if (type) params.set("type", type);
  const matches = await fetchJson<NoteSummary[]>(`/api/notes?${params}`).catch(() => []);
  const id = resolveWikiLinkTitle(matches, title);
  if (!id) return null;
  return fetchJson<FullNote>(`/api/notes/${id}`).catch(() => null);
}

// Worshippers tab's "Amount of religious workers" dropdown — a pure UI
// convenience over the one real stored number (religiousWorkerMultiplier).
const RELIGIOUS_WORKER_PRESETS = [
  { id: "none", label: "None", multiplier: 0 },
  { id: "fewer", label: "Fewer than normal", multiplier: 0.5 },
  { id: "normal", label: "Normal, based on size", multiplier: 1 },
  { id: "more", label: "More than normal", multiplier: 2 },
] as const;

// Adapted from the Electron app's SettlementSetupTab.tsx — every generation-
// input editor, mirroring GenerationOptions field for field, plus Generate.
// Two convenience features are cut rather than ported: the climate/religion/
// preset pickers' pre-loaded <datalist> of every matching note (this repo's
// /api/notes short-circuits an empty, type-filtered query differently — see
// its own comment — and an exhaustive dropdown doesn't scale well on mobile
// anyway) becomes plain text + an Open button, same precedent LocationForm's
// climateNoteTitle already set; and "Add all religions from folder" is
// dropped entirely (this repo has no folder-path-listing endpoint yet — a
// new capability, not a mechanical port). Everything else — Presets, Size,
// Specialties, Districts with per-district building-type boosts, Races
// (with custom-race name-source config), Race/Gender Relations grids,
// Wealth tiers, Education, Religion distribution, Worshippers, Factions,
// Building types table, Generate — ports in full.
export function SettlementSetupTab({
  data,
  updateFrontmatter,
}: {
  data: SettlementFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const router = useRouter();
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetSaveError, setPresetSaveError] = useState<string | null>(null);
  const [lastPresetSaved, setLastPresetSaved] = useState<string | null>(null);
  const [presetToApply, setPresetToApply] = useState("");
  const [presetApplyError, setPresetApplyError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const savePreset = async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setPresetSaveError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          folderId: null,
          frontmatter: { ...defaultSettlementPresetFrontmatter(), ...extractPresetFields(data) },
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error ?? "Could not save preset");
      setNewPresetName("");
      setLastPresetSaved(`Saved preset "${name}".`);
    } catch (err) {
      setPresetSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyPreset = async () => {
    const name = presetToApply.trim();
    if (!name) return;
    setPresetApplyError(null);

    const note = await findNoteByExactTitle(name, "settlement-preset");
    if (!note) {
      setPresetApplyError(`No preset named "${name}" yet.`);
      return;
    }
    const parsed = settlementPresetFrontmatterSchema.safeParse(note.frontmatter);
    if (!parsed.success) {
      setPresetApplyError(`"${name}" doesn't look like a valid settlement preset.`);
      return;
    }

    if (data.buildings.length > 0 || data.residents.length > 0) {
      const proceed = window.confirm(
        `Apply preset "${name}"? This replaces this settlement's current Setup fields (race/wealth/religion/building/specialty ` +
          "settings) — already-generated people and buildings are untouched until you regenerate."
      );
      if (!proceed) return;
    }
    void updateFrontmatter(presetFieldsFromPreset(parsed.data));
  };

  const openByTitle = async (title: string) => {
    const note = await findNoteByExactTitle(title);
    if (note) router.push(`/notes/${note.id}`);
  };

  const updateBuildingType = (id: string, patch: Record<string, unknown>) =>
    updateFrontmatter({ buildingTypes: data.buildingTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const raceTotal = data.raceDistribution.reduce((sum, r) => sum + r.percent, 0);
  const wealthTotal = data.wealthTiers.reduce((sum, t) => sum + t.percent, 0);
  const religionTotal = data.religionDistribution.reduce((sum, r) => sum + r.percent, 0);
  const genderTotal = data.genderDistribution.reduce((sum, g) => sum + g.percent, 0);
  const educatedTierIds = resolveEducatedWealthTierIds(data.wealthTiers, data.customEducation, data.educatedWealthTierIds);

  const handleGenerate = async () => {
    if (data.buildings.length > 0 || data.residents.length > 0) {
      const proceed = window.confirm(
        "Regenerate this settlement? Promoted (linked) residents and buildings are kept — everything else is replaced."
      );
      if (!proceed) return;
    }
    const result = generateSettlement(
      {
        population: data.targetPopulation,
        sizeId: data.sizeId,
        districts: data.districts,
        raceDistribution: data.raceDistribution,
        customRaces: data.customRaces,
        inspirationSources: NAME_INSPIRATION_SOURCES,
        phoneticProfiles: PHONETIC_PROFILES,
        wealthTiers: data.wealthTiers,
        religionDistribution: data.religionDistribution,
        genderDistribution: data.genderDistribution,
        raceRelations: data.raceRelations,
        genderRelations: data.genderRelations,
        buildingTypes: data.buildingTypes,
        specialties: data.specialties,
        activeSpecialtyIds: data.activeSpecialtyIds,
        raceLifeStages: data.raceLifeStages,
        religiousWorkerMultiplier: data.religiousWorkerMultiplier,
        religiousPracticePercent: data.religiousPracticePercent,
        customEducation: data.customEducation,
        educatedWealthTierIds: data.educatedWealthTierIds,
        customFactions: data.customFactions,
        useRandomFactionDefaults: data.useRandomFactionDefaults,
        randomFactionCount: data.randomFactionCount,
        randomFactionMaxMembers: data.randomFactionMaxMembers,
      },
      { buildings: data.buildings, residents: data.residents },
      Math.random,
      () => crypto.randomUUID()
    );
    setGenerateError(null);
    setGenerating(true);
    try {
      await updateFrontmatter({ buildings: result.buildings, residents: result.residents, factions: result.factions });
      setLastGenerated(`Generated ${result.residents.length.toLocaleString()} residents across ${result.buildings.length.toLocaleString()} buildings.`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Summary" value={data.summary} onChange={(e) => updateFrontmatter({ summary: e.target.value })} />

      <div className="flex items-end gap-2">
        <TextField
          label="Climate"
          className="flex-1"
          placeholder="e.g. Arctic Tundra"
          value={data.climateNoteTitle ?? ""}
          onChange={(e) => updateFrontmatter({ climateNoteTitle: e.target.value || null })}
        />
        <Button disabled={!data.climateNoteTitle?.trim()} onClick={() => void openByTitle(data.climateNoteTitle!.trim())}>
          Open ↗
        </Button>
      </div>

      <section>
        <h3 className="font-medium mb-1">Presets</h3>
        <p className="text-sm text-muted mb-2">
          Save this settlement&apos;s Setup fields (size, districts, race/wealth/religion distribution, building
          types, specialties) as a reusable preset, then apply it from another settlement. Saving never overwrites an
          existing preset with the same name — pick a new name, or delete the old one first.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Save as preset" className="w-48" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="e.g. Coastal Human Village" />
          <Button onClick={() => void savePreset()} disabled={!newPresetName.trim()}>
            Save
          </Button>
        </div>
        {presetSaveError && <p className="text-sm text-danger mt-1">{presetSaveError}</p>}
        {lastPresetSaved && !presetSaveError && <p className="text-sm text-muted mt-1">{lastPresetSaved}</p>}

        <div className="flex flex-wrap items-end gap-2 mt-2">
          <TextField label="Apply preset" className="w-48" value={presetToApply} onChange={(e) => setPresetToApply(e.target.value)} placeholder="Exact preset name…" />
          <Button onClick={() => void applyPreset()} disabled={!presetToApply.trim()}>
            Apply
          </Button>
        </div>
        {presetApplyError && <p className="text-sm text-danger mt-1">{presetApplyError}</p>}
      </section>

      <section>
        <h3 className="font-medium mb-1">Size &amp; population</h3>
        <div className="flex flex-wrap items-end gap-2">
          {SETTLEMENT_SIZE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant={data.sizeId === preset.id ? "primary" : "default"}
              onClick={() => updateFrontmatter({ sizeId: preset.id, targetPopulation: preset.averagePopulation })}
            >
              {preset.name}
            </Button>
          ))}
          <TextField
            label="Population"
            type="number"
            className="w-28"
            value={data.targetPopulation}
            onChange={(e) => updateFrontmatter({ targetPopulation: Number(e.target.value) })}
          />
        </div>
      </section>

      <section>
        <h3 className="font-medium mb-1">Specialties</h3>
        <p className="text-sm text-muted mb-1">Zero or more — each boosts the odds of its related building types during Generate.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {data.specialties.map((specialty) => (
            <label key={specialty.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={data.activeSpecialtyIds.includes(specialty.id)}
                onChange={(e) =>
                  updateFrontmatter({
                    activeSpecialtyIds: e.target.checked
                      ? [...data.activeSpecialtyIds, specialty.id]
                      : data.activeSpecialtyIds.filter((id) => id !== specialty.id),
                  })
                }
              />
              {specialty.name}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-medium mb-1">Districts</h3>
        <p className="text-sm text-muted mb-1">
          Each district can optionally boost which building types get placed there — soft bias, not exclusive.
        </p>
        <div className="flex flex-col gap-2">
          {data.districts.map((d) => (
            <div key={d.id} className="border border-border rounded-lg p-2">
              <div className="flex gap-1.5 items-center">
                <input
                  className="flex-1 min-w-0"
                  value={d.name}
                  onChange={(e) => updateFrontmatter({ districts: data.districts.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)) })}
                />
                <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ districts: data.districts.filter((x) => x.id !== d.id) })}>
                  ✕
                </button>
              </div>
              <details className="mt-1.5">
                <summary className="text-xs cursor-pointer">Boosts ({d.buildingTypeBoosts.length})</summary>
                <div className="flex flex-wrap gap-3 mt-1.5 pl-2">
                  {data.buildingTypes.map((bt) => {
                    const boost = d.buildingTypeBoosts.find((b) => b.buildingTypeId === bt.id);
                    const setBoosts = (boosts: SettlementFrontmatter["districts"][number]["buildingTypeBoosts"]) =>
                      updateFrontmatter({ districts: data.districts.map((x) => (x.id === d.id ? { ...x, buildingTypeBoosts: boosts } : x)) });
                    return (
                      <label key={bt.id} className="text-xs flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!boost}
                          onChange={(e) =>
                            setBoosts(
                              e.target.checked
                                ? [...d.buildingTypeBoosts, { buildingTypeId: bt.id, multiplier: 2 }]
                                : d.buildingTypeBoosts.filter((b) => b.buildingTypeId !== bt.id)
                            )
                          }
                        />
                        {bt.name}
                        {boost && (
                          <input
                            type="number"
                            className="w-11"
                            step={0.5}
                            value={boost.multiplier}
                            onChange={(e) => setBoosts(d.buildingTypeBoosts.map((b) => (b.buildingTypeId === bt.id ? { ...b, multiplier: Number(e.target.value) } : b)))}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Button onClick={() => updateFrontmatter({ districts: [...data.districts, { id: crypto.randomUUID(), name: "New District", buildingTypeBoosts: [] }] })}>
            + Add district
          </Button>
          <Button
            onClick={() => {
              const sizeName = SETTLEMENT_SIZE_PRESETS.find((p) => p.id === data.sizeId)?.name ?? data.sizeId;
              const proceed = window.confirm(
                `Replace all ${data.districts.length} current district(s) with the default set for a ${sizeName}? This can't be undone.`
              );
              if (proceed) updateFrontmatter({ districts: defaultDistrictsForSize(resolveGatingSizeId(data.sizeId)) });
            }}
          >
            Reset to defaults
          </Button>
        </div>
      </section>

      <section>
        <h3 className="font-medium">
          Races <span className="text-sm text-muted font-normal">Total: {raceTotal}%{raceTotal !== 100 ? " (should total 100)" : ""}</span>
        </h3>
        {data.raceDistribution.map((_, i) => (
          <RaceCard key={i} data={data} updateFrontmatter={updateFrontmatter} index={i} />
        ))}
        <Button
          className="mt-1.5"
          onClick={() => {
            const usedIds = new Set(data.raceDistribution.map((r) => r.race));
            const nextBaseline = BASELINE_RACES.find((id) => !usedIds.has(id)) ?? "human";
            const seededStage = defaultRaceLifeStages().find((s) => s.race === nextBaseline);
            updateFrontmatter({
              raceDistribution: [...data.raceDistribution, { race: nextBaseline, percent: 0 }],
              raceLifeStages: data.raceLifeStages.some((s) => s.race === nextBaseline)
                ? data.raceLifeStages
                : [...data.raceLifeStages, seededStage ?? { race: nextBaseline, adulthood: 18, oldAge: 70, maxAge: 90 }],
            });
          }}
        >
          + Add race
        </Button>
      </section>

      <section>
        <h3 className="font-medium mb-1">Race Relations</h3>
        <p className="text-sm text-muted mb-1">
          How likely a notable&apos;s spouse is to be each race, given their own. Leave a race untouched and it defaults to always pairing with its own race.
        </p>
        <PairRelationTable
          keys={data.raceDistribution.map((r) => r.race)}
          labelFor={(race) => raceLabel(race, data.customRaces)}
          relations={data.raceRelations}
          defaultPercent={(a, b) => (a === b ? 100 : 0)}
          onChange={(next) => updateFrontmatter({ raceRelations: next })}
        />
      </section>

      <section>
        <h3 className="font-medium">
          Genders <span className="text-sm text-muted font-normal">Total: {genderTotal}%{genderTotal !== 100 ? " (should total 100)" : ""}</span>
        </h3>
        <p className="text-sm text-muted mb-1">
          &quot;Male&quot; and &quot;Female&quot; specifically get gendered first names — any other label draws from the combined pool.
        </p>
        {data.genderDistribution.map((g) => (
          <div key={g.id} className="flex gap-1.5 mt-1 items-center">
            <input className="flex-1 min-w-0" value={g.gender} onChange={(e) => updateFrontmatter({ genderDistribution: data.genderDistribution.map((x) => (x.id === g.id ? { ...x, gender: e.target.value } : x)) })} />
            <input type="number" className="w-14" value={g.percent} onChange={(e) => updateFrontmatter({ genderDistribution: data.genderDistribution.map((x) => (x.id === g.id ? { ...x, percent: Number(e.target.value) } : x)) })} />
            %
            <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ genderDistribution: data.genderDistribution.filter((x) => x.id !== g.id) })}>
              ✕
            </button>
          </div>
        ))}
        <Button className="mt-1.5" onClick={() => updateFrontmatter({ genderDistribution: [...data.genderDistribution, { id: crypto.randomUUID(), gender: "New Gender", percent: 0 }] })}>
          + Add gender
        </Button>
      </section>

      <section>
        <h3 className="font-medium mb-1">Gender Relations</h3>
        <p className="text-sm text-muted mb-1">
          How likely a notable&apos;s spouse is to be each gender, given their own. Untouched defaults to an independent draw from the Genders list.
        </p>
        <PairRelationTable
          keys={data.genderDistribution.map((g) => g.gender)}
          labelFor={(gender) => gender}
          relations={data.genderRelations}
          defaultPercent={(_a, b) => data.genderDistribution.find((g) => g.gender === b)?.percent ?? 0}
          onChange={(next) => updateFrontmatter({ genderRelations: next })}
        />
      </section>

      <section>
        <h3 className="font-medium">
          Wealth tiers <span className="text-sm text-muted font-normal">Total: {wealthTotal}%{wealthTotal !== 100 ? " (should total 100)" : ""}</span>
        </h3>
        {data.wealthTiers.map((t) => (
          <div key={t.id} className="flex gap-1.5 mt-1 items-center">
            <input className="flex-1 min-w-0" value={t.name} onChange={(e) => updateFrontmatter({ wealthTiers: data.wealthTiers.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} />
            <input type="number" className="w-14" value={t.percent} onChange={(e) => updateFrontmatter({ wealthTiers: data.wealthTiers.map((x) => (x.id === t.id ? { ...x, percent: Number(e.target.value) } : x)) })} />
            %
            <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ wealthTiers: data.wealthTiers.filter((x) => x.id !== t.id) })}>
              ✕
            </button>
          </div>
        ))}
        <Button className="mt-1.5" onClick={() => updateFrontmatter({ wealthTiers: [...data.wealthTiers, { id: crypto.randomUUID(), name: "New Tier", percent: 0 }] })}>
          + Add wealth tier
        </Button>
      </section>

      <section>
        <h3 className="font-medium mb-1">Education</h3>
        <p className="text-sm text-muted mb-1">
          Off (default), the top half of your wealth tiers (by list order) are educated automatically. Turn on Custom education to pick exactly which tiers count.
        </p>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={data.customEducation} onChange={(e) => updateFrontmatter({ customEducation: e.target.checked })} />
          Custom education
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
          {data.wealthTiers.map((t) => {
            const checked = educatedTierIds.has(t.id);
            const toggle = () => {
              if (!data.customEducation) return;
              updateFrontmatter({ educatedWealthTierIds: checked ? data.educatedWealthTierIds.filter((id) => id !== t.id) : [...data.educatedWealthTierIds, t.id] });
            };
            return (
              <label key={t.id} className={`flex items-center gap-1 text-sm ${data.customEducation ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={checked} disabled={!data.customEducation} onChange={toggle} />
                {t.name}
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-medium">
          Religion distribution <span className="text-sm text-muted font-normal">Total: {religionTotal}%{religionTotal !== 100 ? " (should total 100)" : ""}</span>
        </h3>
        {data.religionDistribution.map((r, i) => (
          <div key={i} className="flex gap-1.5 mt-1 items-center">
            <input className="flex-1 min-w-0" value={r.religion} onChange={(e) => updateFrontmatter({ religionDistribution: data.religionDistribution.map((x, xi) => (xi === i ? { ...x, religion: e.target.value } : x)) })} />
            <input type="number" className="w-14" value={r.percent} onChange={(e) => updateFrontmatter({ religionDistribution: data.religionDistribution.map((x, xi) => (xi === i ? { ...x, percent: Number(e.target.value) } : x)) })} />
            %
            <Button disabled={!r.religion.trim()} onClick={() => void openByTitle(r.religion.trim())}>
              Open ↗
            </Button>
            <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ religionDistribution: data.religionDistribution.filter((_, xi) => xi !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <Button className="mt-1.5" onClick={() => updateFrontmatter({ religionDistribution: [...data.religionDistribution, { religion: "New Religion", percent: 0 }] })}>
          + Add religion
        </Button>
        <p className="text-sm text-muted mt-1.5">
          Pointing a religion&apos;s name at a real note&apos;s exact title links it to that note&apos;s lore — a promoted resident&apos;s &quot;Follows&quot; line becomes a [[wiki-link]] back to it.
        </p>
      </section>

      <section>
        <h3 className="font-medium mb-1">Worshippers</h3>
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="Amount of religious workers"
            className="w-56"
            value={RELIGIOUS_WORKER_PRESETS.find((p) => p.multiplier === data.religiousWorkerMultiplier)?.id ?? "custom"}
            onChange={(e) => {
              const preset = RELIGIOUS_WORKER_PRESETS.find((p) => p.id === e.target.value);
              if (preset) updateFrontmatter({ religiousWorkerMultiplier: preset.multiplier });
            }}
          >
            {RELIGIOUS_WORKER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom" disabled>
              Custom
            </option>
          </SelectField>
          <TextField
            label="Multiplier"
            type="number"
            step={0.1}
            min={0}
            className="w-24"
            value={data.religiousWorkerMultiplier}
            onChange={(e) => updateFrontmatter({ religiousWorkerMultiplier: Number(e.target.value) })}
          />
        </div>
        <p className="text-sm text-muted mt-1">
          Scales how many religious buildings (and staff) get built. 0 means none, 1 is normal, 2 is double.
        </p>
        <TextField
          label="Percentage of people who practice religion"
          type="number"
          min={0}
          max={100}
          className="w-32 mt-2"
          value={data.religiousPracticePercent}
          onChange={(e) => updateFrontmatter({ religiousPracticePercent: Number(e.target.value) })}
        />
        <p className="text-sm text-muted mt-1">
          The religion distribution above describes the split among practitioners, not the whole population.
        </p>
      </section>

      <section>
        <h3 className="font-medium mb-1">Factions</h3>
        <p className="text-sm text-muted mb-1">
          Custom factions are named by you and always generated; random ones are picked fresh each Generate from a fixed pool. See the Factions tab to view results.
        </p>
        {data.customFactions.map((f) => (
          <div key={f.id} className="flex gap-1.5 mt-1 items-center">
            <input className="flex-1 min-w-0" value={f.name} onChange={(e) => updateFrontmatter({ customFactions: data.customFactions.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)) })} />
            <label className="flex items-center gap-1 text-xs">
              Max
              <input
                type="number"
                className="w-16"
                value={f.maxMembers}
                onChange={(e) => updateFrontmatter({ customFactions: data.customFactions.map((x) => (x.id === f.id ? { ...x, maxMembers: Number(e.target.value) } : x)) })}
              />
            </label>
            <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ customFactions: data.customFactions.filter((x) => x.id !== f.id) })}>
              ✕
            </button>
          </div>
        ))}
        <Button className="mt-1.5" onClick={() => updateFrontmatter({ customFactions: [...data.customFactions, { id: crypto.randomUUID(), name: "New Faction", maxMembers: 50 }] })}>
          + Add faction
        </Button>

        <div className="mt-2.5">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={data.useRandomFactionDefaults} onChange={(e) => updateFrontmatter({ useRandomFactionDefaults: e.target.checked })} />
            Use random faction defaults
          </label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <TextField
              label="Number of random factions"
              type="number"
              min={0}
              max={FACTION_NAME_POOL.length}
              className="w-40"
              value={data.randomFactionCount}
              onChange={(e) => updateFrontmatter({ randomFactionCount: Number(e.target.value) })}
            />
            {!data.useRandomFactionDefaults && (
              <TextField
                label="Max members per random faction"
                type="number"
                className="w-40"
                value={data.randomFactionMaxMembers}
                onChange={(e) => updateFrontmatter({ randomFactionMaxMembers: Number(e.target.value) })}
              />
            )}
          </div>
          {data.useRandomFactionDefaults && <p className="text-sm text-muted mt-1">Max members per random faction scales automatically with settlement size.</p>}
        </div>
      </section>

      <details>
        <summary className="font-medium cursor-pointer">Building types ({data.buildingTypes.length})</summary>
        <p className="text-sm text-muted mt-1">
          <strong>Weight</strong> is how often this type shows up relative to others in its category. <strong>Min. size</strong> is a soft floor — below it this type is heavily deprioritized, not forbidden.{" "}
          <strong>Max %</strong> is an optional hard ceiling on the whole staffed-building budget this type can claim — blank means unlimited.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left">
                <th className="pr-2">Name</th>
                <th className="pr-2">Category</th>
                <th className="pr-2">Wealth</th>
                <th className="pr-2">Staffed</th>
                <th className="pr-2">Weight</th>
                <th className="pr-2">Min. size</th>
                <th className="pr-2">Max %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.buildingTypes.map((bt) => (
                <tr key={bt.id} className="border-t border-border">
                  <td className="py-1 pr-2">
                    <input className="min-w-[100px]" value={bt.name} onChange={(e) => updateBuildingType(bt.id, { name: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={bt.category} onChange={(e) => updateBuildingType(bt.id, { category: e.target.value })}>
                      {BUILDING_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select value={bt.defaultWealthTierId} onChange={(e) => updateBuildingType(bt.id, { defaultWealthTierId: e.target.value })}>
                      <option value="">(none)</option>
                      {data.wealthTiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input type="checkbox" checked={bt.staffed} onChange={(e) => updateBuildingType(bt.id, { staffed: e.target.checked })} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" className="w-14" value={bt.weight} onChange={(e) => updateBuildingType(bt.id, { weight: Number(e.target.value) })} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={bt.minSizeId} onChange={(e) => updateBuildingType(bt.id, { minSizeId: e.target.value })}>
                      {SETTLEMENT_SIZE_IDS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      className="w-14"
                      placeholder="none"
                      value={bt.maxSharePercent ?? ""}
                      onChange={(e) => updateBuildingType(bt.id, { maxSharePercent: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1">
                    <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateFrontmatter({ buildingTypes: data.buildingTypes.filter((x) => x.id !== bt.id) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() =>
              updateFrontmatter({
                buildingTypes: [
                  ...data.buildingTypes,
                  { id: crypto.randomUUID(), name: "New Building", category: "shop", defaultWealthTierId: "", staffed: false, weight: 1, minSizeId: "hamlet" },
                ],
              })
            }
          >
            + Add building type
          </Button>
          <Button
            onClick={() => {
              const proceed = window.confirm(
                `Replace all ${data.buildingTypes.length} current building type(s) with today's defaults? Any customizations are discarded. This can't be undone.`
              );
              if (proceed) updateFrontmatter({ buildingTypes: defaultBuildingTypes() });
            }}
          >
            Reset to current defaults
          </Button>
        </div>
      </details>

      <div>
        <Button variant="primary" disabled={generating} onClick={() => void handleGenerate()}>
          {generating ? "Generating…" : "Generate"}
        </Button>
        {lastGenerated && <p className="text-sm text-muted mt-1">{lastGenerated}</p>}
        {generateError && <p className="text-sm text-danger mt-1">{generateError}</p>}
      </div>
    </div>
  );
}

// Shared by Race Relations and Gender Relations — an N×N grid (same `keys`
// list on both axes) rather than a flat list, so it stays scannable as the
// race/gender list grows. Cell (row, col) and cell (col, row) read/write the
// exact same underlying value (the pair is unordered in storage).
function PairRelationTable({
  keys,
  labelFor,
  relations,
  defaultPercent,
  onChange,
}: {
  keys: string[];
  labelFor: (key: string) => string;
  relations: PairRelation[];
  defaultPercent: (a: string, b: string) => number;
  onChange: (next: PairRelation[]) => void;
}) {
  if (keys.length === 0) {
    return <p className="text-sm text-muted">Add at least one entry above to configure pairings.</p>;
  }

  const percentFor = (a: string, b: string): number => findPairPercent(relations, a, b) ?? defaultPercent(a, b);
  const rowTotal = (rowKey: string): number => keys.reduce((sum, colKey) => sum + percentFor(rowKey, colKey), 0);
  const columnTotal = (colKey: string): number => keys.reduce((sum, rowKey) => sum + percentFor(rowKey, colKey), 0);

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th></th>
            {keys.map((colKey) => (
              <th key={colKey} className="text-xs font-normal px-1 whitespace-nowrap">
                {labelFor(colKey)}
              </th>
            ))}
            <th className="text-xs font-normal px-1 whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((rowKey) => (
            <tr key={rowKey}>
              <th className="text-xs font-normal text-right pr-1.5 whitespace-nowrap">{labelFor(rowKey)}</th>
              {keys.map((colKey) => (
                <td key={colKey} className="p-0.5">
                  <input type="number" className="w-14" value={percentFor(rowKey, colKey)} onChange={(e) => onChange(upsertPairRelation(relations, rowKey, colKey, Number(e.target.value)))} />
                </td>
              ))}
              <td className={`px-1.5 text-right font-bold ${rowTotal(rowKey) === 100 ? "" : "text-danger"}`}>{rowTotal(rowKey)}%</td>
            </tr>
          ))}
          <tr>
            <th className="text-xs font-normal text-right pr-1.5 whitespace-nowrap">Total</th>
            {keys.map((colKey) => (
              <td key={colKey} className={`px-1.5 text-center font-bold ${columnTotal(colKey) === 100 ? "" : "text-danger"}`}>
                {columnTotal(colKey)}%
              </td>
            ))}
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// One card per race in raceDistribution — percent share, age milestones
// (raceLifeStages, matched by the `race` string), and (only when this race
// id also matches a customRaces entry) its name-source config, all
// together. Changing which race this row represents renames the matching
// life-stage entry in the same update rather than orphaning it.
function RaceCard({
  data,
  updateFrontmatter,
  index,
}: {
  data: SettlementFrontmatter;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
  index: number;
}) {
  const row = data.raceDistribution[index];
  const customRace = data.customRaces.find((cr) => cr.id === row.race);
  const lifeStage = data.raceLifeStages.find((s) => s.race === row.race);
  const stage = lifeStage ?? { adulthood: 18, oldAge: 70, maxAge: 90 };

  const renameLifeStage = (newRace: string): SettlementFrontmatter["raceLifeStages"] =>
    lifeStage ? data.raceLifeStages.map((s) => (s.race === row.race ? { ...s, race: newRace } : s)) : [...data.raceLifeStages, { race: newRace, adulthood: 18, oldAge: 70, maxAge: 90 }];

  const handleRaceIdChange = (newRaceId: string) => {
    if (newRaceId === "__new_custom__") {
      const newId = crypto.randomUUID();
      updateFrontmatter({
        customRaces: [...data.customRaces, { id: newId, name: "New Race", inspirationSourceIds: [], phoneticProfileIds: [], heightRangeInches: [59, 75], specialFeatures: [] }],
        raceDistribution: data.raceDistribution.map((x, xi) => (xi === index ? { ...x, race: newId } : x)),
        raceLifeStages: renameLifeStage(newId),
      });
      return;
    }
    updateFrontmatter({
      raceDistribution: data.raceDistribution.map((x, xi) => (xi === index ? { ...x, race: newRaceId } : x)),
      raceLifeStages: renameLifeStage(newRaceId),
    });
  };

  const updatePercent = (percent: number) => updateFrontmatter({ raceDistribution: data.raceDistribution.map((x, xi) => (xi === index ? { ...x, percent } : x)) });

  const updateLifeStageField = (patch: Record<string, unknown>) =>
    updateFrontmatter({
      raceLifeStages: lifeStage ? data.raceLifeStages.map((s) => (s.race === row.race ? { ...s, ...patch } : s)) : [...data.raceLifeStages, { race: row.race, adulthood: 18, oldAge: 70, maxAge: 90, ...patch }],
    });

  const updateCustomRaceField = (patch: Record<string, unknown>) => updateFrontmatter({ customRaces: data.customRaces.map((cr) => (cr.id === row.race ? { ...cr, ...patch } : cr)) });

  const removeRace = () =>
    updateFrontmatter({
      raceDistribution: data.raceDistribution.filter((_, xi) => xi !== index),
      raceLifeStages: data.raceLifeStages.filter((s) => s.race !== row.race),
      customRaces: data.customRaces.filter((cr) => cr.id !== row.race),
    });

  return (
    <div className="border border-border rounded-lg p-2 mt-1.5">
      <div className="flex gap-1.5 items-center flex-wrap">
        <select value={row.race} onChange={(e) => handleRaceIdChange(e.target.value)}>
          {BASELINE_RACES.map((id) => (
            <option key={id} value={id}>
              {raceLabel(id)}
            </option>
          ))}
          {data.customRaces
            .filter((cr) => cr.id === row.race || !data.raceDistribution.some((r) => r.race === cr.id))
            .map((cr) => (
              <option key={cr.id} value={cr.id}>
                {cr.name} (custom)
              </option>
            ))}
          <option value="__new_custom__">+ New custom race…</option>
        </select>
        <label className="flex items-center gap-1 text-xs">
          Percent
          <input type="number" className="w-14" value={row.percent} onChange={(e) => updatePercent(Number(e.target.value))} />%
        </label>
        <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={removeRace} title="Remove this race">
          ✕
        </button>
      </div>

      {customRace && (
        <TextField label="Custom race name" className="max-w-[220px] mt-1.5" value={customRace.name} onChange={(e) => updateCustomRaceField({ name: e.target.value })} />
      )}

      {customRace && (
        <div className="mt-1.5">
          <label className="flex items-center gap-1 text-xs flex-wrap">
            Height range
            {([0, 1] as const).map((boundIndex) => {
              const { feet, inches } = inchesToFeetAndInches(customRace.heightRangeInches[boundIndex]);
              const setBound = (nextFeet: number, nextInches: number) => {
                const nextRange = [...customRace.heightRangeInches] as [number, number];
                nextRange[boundIndex] = feetAndInchesToInches(nextFeet, nextInches);
                updateCustomRaceField({ heightRangeInches: nextRange });
              };
              return (
                <span key={boundIndex} className="flex items-center gap-0.5">
                  {boundIndex === 1 && <span className="mx-1">to</span>}
                  <input type="number" className="w-12" value={feet} onChange={(e) => setBound(Number(e.target.value), inches)} />
                  ft
                  <input type="number" className="w-12" value={inches} onChange={(e) => setBound(feet, Number(e.target.value))} />
                  in
                </span>
              );
            })}
          </label>

          <div className="mt-1.5">
            <span className="text-xs text-muted">Special features — distinctive traits (horns, scales, tusks, ...) a Notable NPC of this race might have</span>
            {customRace.specialFeatures.map((feature, i) => (
              <div key={i} className="flex gap-1.5 mt-1 items-center">
                <input className="flex-1 min-w-0" value={feature} onChange={(e) => updateCustomRaceField({ specialFeatures: customRace.specialFeatures.map((f, fi) => (fi === i ? e.target.value : f)) })} />
                <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => updateCustomRaceField({ specialFeatures: customRace.specialFeatures.filter((_, fi) => fi !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <Button className="mt-1" onClick={() => updateCustomRaceField({ specialFeatures: [...customRace.specialFeatures, "New trait"] })}>
              + Add trait
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-1.5">
        <label className="flex items-center gap-1 text-xs">
          Adulthood
          <input type="number" className="w-16" value={stage.adulthood} onChange={(e) => updateLifeStageField({ adulthood: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1 text-xs">
          Old age
          <input type="number" className="w-16" value={stage.oldAge} onChange={(e) => updateLifeStageField({ oldAge: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1 text-xs">
          Max age
          <input type="number" className="w-16" value={stage.maxAge} onChange={(e) => updateLifeStageField({ maxAge: Number(e.target.value) })} />
        </label>
      </div>

      {customRace && (
        <div className="mt-1.5">
          <div className="flex gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={customRace.phoneticProfileIds.length === 0} onChange={() => updateCustomRaceField({ phoneticProfileIds: [] })} />
              Real-world inspiration sources
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={customRace.phoneticProfileIds.length > 0}
                onChange={() => updateCustomRaceField({ phoneticProfileIds: [PHONETIC_PROFILES[0].id], inspirationSourceIds: [] })}
              />
              Phonetic profile(s)
            </label>
          </div>
          {customRace.phoneticProfileIds.length === 0 ? (
            <div className="flex flex-wrap gap-3 mt-1">
              {NAME_INSPIRATION_SOURCES.map((source) => (
                <label key={source.id} className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={customRace.inspirationSourceIds.includes(source.id)}
                    onChange={(e) =>
                      updateCustomRaceField({
                        inspirationSourceIds: e.target.checked ? [...customRace.inspirationSourceIds, source.id] : customRace.inspirationSourceIds.filter((id) => id !== source.id),
                      })
                    }
                  />
                  {source.name}
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 mt-1">
              {PHONETIC_PROFILES.map((profile) => (
                <label key={profile.id} className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={customRace.phoneticProfileIds.includes(profile.id)}
                    onChange={(e) =>
                      updateCustomRaceField({
                        phoneticProfileIds: e.target.checked ? [...customRace.phoneticProfileIds, profile.id] : customRace.phoneticProfileIds.filter((id) => id !== profile.id),
                      })
                    }
                  />
                  {profile.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
