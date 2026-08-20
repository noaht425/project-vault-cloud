"use client";

import { useState } from "react";
import { generateMap } from "@/lib/mapGeneration/generateMap";
import { defaultTerrainTypes, type MapFrontmatter, type TerrainType } from "@/lib/noteTypes/map";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

// Finds this map's "Mountains" terrain type by id first (matches
// defaultTerrainTypes()'s seeded id, the common case), falling back to a
// case-insensitive name match (covers a map whose seeded type was
// recreated under a different id), and only creates a new one if neither
// is found — never silently duplicates a terrain type the user already has.
function resolveMountainTerrainType(terrainTypes: TerrainType[]): { id: string; newType: TerrainType | null } {
  const byId = terrainTypes.find((t) => t.id === "mountains");
  if (byId) return { id: byId.id, newType: null };
  const byName = terrainTypes.find((t) => t.name.trim().toLowerCase() === "mountains");
  if (byName) return { id: byName.id, newType: null };
  const seeded = defaultTerrainTypes().find((t) => t.id === "mountains")!;
  return { id: seeded.id, newType: seeded };
}

export function MapGenerationPanel({
  data,
  workingDims,
  updateFrontmatter,
}: {
  data: MapFrontmatter;
  workingDims: { width: number; height: number } | null;
  updateFrontmatter: (patch: Record<string, unknown>) => void;
}) {
  const savedParams = data.generation?.params as Record<string, number> | undefined;
  const [seed, setSeed] = useState(data.generation?.seed ?? randomSeed());
  const [landmassScale, setLandmassScale] = useState(savedParams?.landmassScale ?? 0.35);
  const [seaLevel, setSeaLevel] = useState(savedParams?.seaLevel ?? 0.5);
  const [mountainDensity, setMountainDensity] = useState(savedParams?.mountainDensity ?? 0.35);
  const [mountainRuggedness, setMountainRuggedness] = useState(savedParams?.mountainRuggedness ?? 0.5);
  const [generating, setGenerating] = useState(false);

  const generateTerrainNow = () => {
    if (!workingDims) return;
    setGenerating(true);
    try {
      const { id: mountainTerrainTypeId, newType } = resolveMountainTerrainType(data.terrainTypes);
      const result = generateMap({
        seed,
        widthPixels: workingDims.width,
        heightPixels: workingDims.height,
        landmassScale,
        seaLevel,
        mountainDensity,
        mountainRuggedness,
        mountainTerrainTypeId,
      });
      // Only ever replaces content THIS generator previously produced
      // (generated:true) — anything hand-drawn survives untouched. This is
      // the same non-destructive guarantee Phase 5 formalizes for
      // augmenting an existing hand-drawn map; there's no reason terrain
      // generation on a fresh map should behave any less carefully from
      // the start, and it costs nothing extra since the flag already
      // exists.
      const keptLandmasses = data.landmasses.filter((l) => !l.generated);
      const keptZones = data.zones.filter((z) => !z.generated);
      updateFrontmatter({
        landmasses: [...keptLandmasses, ...result.landmasses],
        zones: [...keptZones, ...result.mountainZones],
        terrainTypes: newType ? [...data.terrainTypes, newType] : data.terrainTypes,
        generation: {
          seed,
          params: { landmassScale, seaLevel, mountainDensity, mountainRuggedness },
          parentMapTitle: data.generation?.parentMapTitle ?? null,
          parentBounds: data.generation?.parentBounds ?? null,
        },
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <details open={data.generation !== null}>
      <summary className="font-medium cursor-pointer">Generate terrain</summary>
      <div className="mt-2 flex flex-col gap-3 max-w-md">
        <p className="text-sm text-muted">
          Procedurally generates coastlines and mountain ranges from a seed — deterministic, not AI-written content. Running this again only
          replaces what a previous run generated; anything you&apos;ve drawn by hand is never touched.
        </p>

        <div className="flex items-end gap-2">
          <TextField label="Seed" type="number" className="w-40" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          <Button onClick={() => setSeed(randomSeed())}>Randomize</Button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span>
            Landmass scale ({landmassScale.toFixed(2)}) — smaller means more, smaller landmasses; larger means fewer, bigger ones.
          </span>
          <input type="range" min={0.05} max={1} step={0.01} value={landmassScale} onChange={(e) => setLandmassScale(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Sea level ({seaLevel.toFixed(2)}) — higher means more ocean, less land.</span>
          <input type="range" min={0} max={1} step={0.01} value={seaLevel} onChange={(e) => setSeaLevel(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Mountain density ({mountainDensity.toFixed(2)}) — how much of already-high land becomes mountainous.</span>
          <input type="range" min={0} max={1} step={0.01} value={mountainDensity} onChange={(e) => setMountainDensity(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Mountain ruggedness ({mountainRuggedness.toFixed(2)}) — how jagged the mountain ranges are.</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={mountainRuggedness}
            onChange={(e) => setMountainRuggedness(Number(e.target.value))}
          />
        </label>

        <Button variant="primary" disabled={!workingDims || generating} onClick={generateTerrainNow}>
          {generating ? "Generating…" : data.generation ? "Regenerate terrain" : "Generate terrain"}
        </Button>
        {!workingDims && <p className="text-sm text-muted">Upload an image or start a blank map above first, so there&apos;s a canvas to generate onto.</p>}
      </div>
    </details>
  );
}
