"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mapFrontmatterSchema, type LineType, type MapLandmass, type MapLine, type MapZone, type TerrainType } from "@/lib/noteTypes/map";
import { crossingTime, deriveEquatorY, deriveScaleFromLatitudeSpan, foldDrawnPathAtWraps, type Point } from "@/lib/mapGeometry";
import { uploadMapImage, getMapImageUrl } from "@/lib/mapImageStorage";
import { resolveWikiLinkTitle } from "@/lib/wikiLinkResolve";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { MapCanvas, type MapCanvasMode } from "./map/MapCanvas";
import { MapTripCalculator } from "./map/MapTripCalculator";
import { MapTimeline } from "./map/MapTimeline";
import { useTravelModes } from "./map/useTravelModes";

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

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load the uploaded image"));
    img.src = url;
  });
}

const MODE_LABELS: { id: MapCanvasMode; label: string }[] = [
  { id: "view", label: "View" },
  { id: "calibrate", label: "Calibrate Scale" },
  { id: "paint-zone", label: "Paint Terrain" },
  { id: "draw-line", label: "Draw Line" },
  { id: "paint-landmass", label: "Draw Landmass" },
  { id: "place-pin", label: "Place Pin" },
];

// Adapted from the Electron app's MapSheet.tsx — same feature set (image
// upload/calibration/terrain+line painting/landmass drawing/pin placement/
// edge-wrapping/latitude-based scale/trip calculator/timeline/travel
// modes), rebuilt against this repo's {frontmatter, onChange} contract
// instead of a raw content string, direct fetch calls instead of
// noteRefApi, and Supabase Storage upload via a <input type="file"> instead
// of Electron's native file-picker IPC.
export function MapForm({
  frontmatter,
  onChange,
}: {
  frontmatter: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const data = useMemo(() => mapFrontmatterSchema.parse(frontmatter), [frontmatter]);
  const updateFrontmatter = (patch: Record<string, unknown>) => onChange(patch);

  const { modes: travelModes, loading: travelModesLoading, save: saveTravelModes } = useTravelModes();

  const [mode, setMode] = useState<MapCanvasMode>("view");
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingPixelDistance, setPendingPixelDistance] = useState<number | null>(null);
  const [realDistanceInput, setRealDistanceInput] = useState("");
  const [unitInput, setUnitInput] = useState(data.scale?.unit ?? "miles");

  const [terrainChoice, setTerrainChoice] = useState("");
  const [newTerrainName, setNewTerrainName] = useState("");
  const [newTerrainColor, setNewTerrainColor] = useState("#4caf6e");
  const [newTerrainMultiplier, setNewTerrainMultiplier] = useState(1);

  const [pendingZonePoints, setPendingZonePoints] = useState<Point[] | null>(null);
  const [pendingLinePoints, setPendingLinePoints] = useState<Point[] | null>(null);
  const [lineWidthInput, setLineWidthInput] = useState(20);
  const [pendingLandmassPoints, setPendingLandmassPoints] = useState<Point[] | null>(null);
  const [newLandmassName, setNewLandmassName] = useState("");

  const [pendingPinPoint, setPendingPinPoint] = useState<Point | null>(null);
  const [pinQuery, setPinQuery] = useState("");
  const [pinResults, setPinResults] = useState<{ title: string }[]>([]);

  const [highlightedPinIds, setHighlightedPinIds] = useState<Set<string>>(new Set());
  const [drawnTripPath, setDrawnTripPath] = useState<Point[] | null>(null);
  const [tripOverlayPath, setTripOverlayPath] = useState<Point[][] | null>(null);

  // No reset branch for the "no image" case — imageUrl is only ever read
  // where data.image is also truthy (the map-view section below), so a
  // stale value left over from a since-removed image is simply never
  // rendered. Avoids a synchronous setState in the effect body for a case
  // that has no observable effect anyway.
  useEffect(() => {
    if (!data.image) return;
    let cancelled = false;
    getMapImageUrl(data.image.path)
      .then((url) => !cancelled && setImageUrl(url))
      .catch(() => !cancelled && setImageUrl(null));
    return () => {
      cancelled = true;
    };
  }, [data.image]);

  // Same reasoning as the image effect above — pinResults is only ever
  // rendered while pendingPinPoint is set, so no reset branch is needed for
  // when it isn't.
  useEffect(() => {
    if (!pendingPinPoint || !pinQuery.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(pinQuery)}&type=location`)
        .then((matches) => !cancelled && setPinResults(matches.map((m) => ({ title: m.name }))))
        .catch(() => !cancelled && setPinResults([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pinQuery, pendingPinPoint]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { path } = await uploadMapImage(file);
      const url = await getMapImageUrl(path);
      const dims = await loadImageDimensions(url);
      // Replacing an existing image leaves the old file behind in Supabase
      // Storage — acceptable for a personal single-user tool, not worth a
      // cleanup pass in v1 (same tradeoff the Electron app makes).
      updateFrontmatter({ image: { path, width: dims.width, height: dims.height } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const confirmCalibration = () => {
    const real = Number(realDistanceInput);
    if (pendingPixelDistance === null || !Number.isFinite(real) || real <= 0) return;
    updateFrontmatter({ scale: { pixelDistance: pendingPixelDistance, realDistance: real, unit: unitInput.trim() || "miles" } });
    setPendingPixelDistance(null);
    setRealDistanceInput("");
    setMode("view");
  };
  const cancelCalibration = () => {
    setPendingPixelDistance(null);
    setRealDistanceInput("");
    setMode("view");
  };

  const resolveType = (pool: TerrainType[]): TerrainType | null => {
    if (terrainChoice === "__new__") {
      if (!newTerrainName.trim()) return null;
      return { id: crypto.randomUUID(), name: newTerrainName.trim(), color: newTerrainColor, speedMultiplier: newTerrainMultiplier };
    }
    return pool.find((t) => t.id === terrainChoice) ?? null;
  };
  const previewMultiplier = terrainChoice === "__new__" ? newTerrainMultiplier : data.lineTypes.find((t) => t.id === terrainChoice)?.speedMultiplier;
  const resetPendingTerrainForm = () => {
    setTerrainChoice("");
    setNewTerrainName("");
  };

  const confirmZone = () => {
    if (!pendingZonePoints) return;
    const terrainType = resolveType(data.terrainTypes);
    if (!terrainType) return;
    const zone: MapZone = { id: crypto.randomUUID(), terrainTypeId: terrainType.id, points: pendingZonePoints };
    const isNewTerrainType = terrainChoice === "__new__";
    updateFrontmatter(isNewTerrainType ? { terrainTypes: [...data.terrainTypes, terrainType], zones: [...data.zones, zone] } : { zones: [...data.zones, zone] });
    setPendingZonePoints(null);
    resetPendingTerrainForm();
    setMode("view");
  };
  const cancelZone = () => {
    setPendingZonePoints(null);
    resetPendingTerrainForm();
    setMode("view");
  };

  const confirmLine = () => {
    if (!pendingLinePoints) return;
    const widthPixels = Number(lineWidthInput);
    if (!Number.isFinite(widthPixels) || widthPixels <= 0) return;
    const lineType = resolveType(data.lineTypes);
    if (!lineType) return;
    const line: MapLine = { id: crypto.randomUUID(), lineTypeId: lineType.id, points: pendingLinePoints, widthPixels, generated: false };
    const isNewLineType = terrainChoice === "__new__";
    updateFrontmatter(isNewLineType ? { lineTypes: [...data.lineTypes, lineType], lines: [...data.lines, line] } : { lines: [...data.lines, line] });
    setPendingLinePoints(null);
    resetPendingTerrainForm();
    setMode("view");
  };
  const cancelLine = () => {
    setPendingLinePoints(null);
    resetPendingTerrainForm();
    setMode("view");
  };

  const confirmLandmass = () => {
    if (!pendingLandmassPoints) return;
    const landmass: MapLandmass = { id: crypto.randomUUID(), name: newLandmassName.trim(), points: pendingLandmassPoints };
    updateFrontmatter({ landmasses: [...data.landmasses, landmass] });
    setPendingLandmassPoints(null);
    setNewLandmassName("");
    setMode("view");
  };
  const cancelLandmass = () => {
    setPendingLandmassPoints(null);
    setNewLandmassName("");
    setMode("view");
  };

  const confirmPin = (title: string) => {
    if (!pendingPinPoint) return;
    updateFrontmatter({ pins: [...data.pins, { id: crypto.randomUUID(), x: pendingPinPoint.x, y: pendingPinPoint.y, locationTitle: title, label: "" }] });
    setPendingPinPoint(null);
    setMode("view");
  };
  const confirmFreehandPin = () => {
    if (!pendingPinPoint || !pinQuery.trim()) return;
    updateFrontmatter({ pins: [...data.pins, { id: crypto.randomUUID(), x: pendingPinPoint.x, y: pendingPinPoint.y, locationTitle: null, label: pinQuery.trim() }] });
    setPendingPinPoint(null);
    setMode("view");
  };
  const cancelPin = () => {
    setPendingPinPoint(null);
    setMode("view");
  };

  const openLocationNote = async (title: string) => {
    const matches = await fetchJson<NoteSummary[]>(`/api/notes?q=${encodeURIComponent(title)}&type=location`).catch(() => []);
    const id = resolveWikiLinkTitle(matches, title);
    if (id) router.push(`/notes/${id}`);
  };

  const updateTerrainType = (id: string, patch: Partial<TerrainType>) => updateFrontmatter({ terrainTypes: data.terrainTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const updateLineType = (id: string, patch: Partial<LineType>) => updateFrontmatter({ lineTypes: data.lineTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const removeZone = (id: string) => updateFrontmatter({ zones: data.zones.filter((z) => z.id !== id) });
  const removeLine = (id: string) => updateFrontmatter({ lines: data.lines.filter((l) => l.id !== id) });
  const removeLandmass = (id: string) => updateFrontmatter({ landmasses: data.landmasses.filter((l) => l.id !== id) });
  const removeTerrainType = (id: string) =>
    updateFrontmatter({
      terrainTypes: data.terrainTypes.filter((t) => t.id !== id),
      waterTerrainTypeId: data.waterTerrainTypeId === id ? null : data.waterTerrainTypeId,
    });
  const removeLineType = (id: string) => updateFrontmatter({ lineTypes: data.lineTypes.filter((t) => t.id !== id) });
  const removePin = (id: string) => updateFrontmatter({ pins: data.pins.filter((p) => p.id !== id) });

  const terrainNameById = new Map(data.terrainTypes.map((t) => [t.id, t.name]));
  const lineTypeNameById = new Map(data.lineTypes.map((t) => [t.id, t.name]));

  // Working canvas dimensions, independent of whether there's an uploaded
  // raster: an uploaded image is still the source of truth for size when
  // present (unchanged behavior), but a purely-generated map with no image
  // falls back to canvasSize instead — see map.ts's canvasSize field.
  const workingDims = data.image ? { width: data.image.width, height: data.image.height } : data.canvasSize;
  // True once there's something to actually draw a canvas over: an image
  // that's finished loading its signed URL, or a generated-only canvas size
  // (which needs no async load at all).
  const canvasReady = workingDims !== null && (!data.image || imageUrl !== null);

  const derivedScale =
    data.scaleMode === "latitude" && data.topLatitude !== null && data.bottomLatitude !== null && data.planetCircumference && workingDims
      ? deriveScaleFromLatitudeSpan(data.topLatitude, data.bottomLatitude, data.planetCircumference, workingDims.height, data.latitudeUnit)
      : null;
  const derivedEquatorY = data.scaleMode === "latitude" && data.topLatitude !== null && data.bottomLatitude !== null ? deriveEquatorY(data.topLatitude, data.bottomLatitude, workingDims?.height ?? 0) : null;
  const effectiveScale = data.scaleMode === "latitude" ? derivedScale : data.scale;

  const [showLandmasses, setShowLandmasses] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [canvasWidthInput, setCanvasWidthInput] = useState("1000");
  const [canvasHeightInput, setCanvasHeightInput] = useState("1000");

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border md:max-w-5xl md:mx-auto md:w-full">
      <TextField label="Summary" value={data.summary} onChange={(e) => updateFrontmatter({ summary: e.target.value })} />

      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileSelected(e)} />
        <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? "Uploading…" : data.image ? "Replace image" : "Upload image"}
        </Button>
        {uploadError && <span className="text-sm text-danger">{uploadError}</span>}
      </div>

      {/* A map doesn't need an uploaded raster at all — this is the entry
          point for a purely-generated map (see the procedural map generation
          plan). Only offered while there's neither an image nor a canvas
          size yet; once canvasSize is set, the rest of the editor treats it
          exactly like an image-backed map (see workingDims/canvasReady). */}
      {!data.image && !data.canvasSize && (
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Width (px)" type="number" className="w-28" value={canvasWidthInput} onChange={(e) => setCanvasWidthInput(e.target.value)} />
          <TextField label="Height (px)" type="number" className="w-28" value={canvasHeightInput} onChange={(e) => setCanvasHeightInput(e.target.value)} />
          <Button
            onClick={() => {
              const width = Number(canvasWidthInput);
              const height = Number(canvasHeightInput);
              if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
                updateFrontmatter({ canvasSize: { width, height } });
              }
            }}
          >
            Start blank map (no image)
          </Button>
          <p className="text-sm text-muted basis-full">For a map you&apos;ll fill in with the generator instead of an uploaded image.</p>
        </div>
      )}

      {canvasReady && workingDims && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {MODE_LABELS.filter((m) => m.id !== "calibrate" || data.scaleMode === "manual").map((m) => (
              <button
                key={m.id}
                className={`px-2.5 py-1 text-sm rounded-md border ${mode === m.id ? "bg-accent border-accent text-white" : "border-border hover:bg-hover"}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={data.wrapsHorizontally} onChange={(e) => updateFrontmatter({ wrapsHorizontally: e.target.checked })} />
              Wraps left/right edge
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={data.wrapsVertically} onChange={(e) => updateFrontmatter({ wrapsVertically: e.target.checked })} />
              Wraps top/bottom edge
            </label>
          </div>
          {(data.wrapsHorizontally || data.wrapsVertically) && (
            <p className="text-sm text-muted">
              The trip calculator considers going off a wrapping edge and reappearing on the opposite one, if shorter. You can also draw your own route across a wrapping edge — pan/zoom out past
              the edge in &quot;Draw custom route&quot; and place points out there.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              className={`px-2.5 py-1 text-sm rounded-md border ${data.scaleMode === "manual" ? "bg-accent border-accent text-white" : "border-border hover:bg-hover"}`}
              onClick={() => {
                updateFrontmatter({ scaleMode: "manual" });
                if (mode === "calibrate") setMode("view");
              }}
            >
              Simple scale
            </button>
            <button
              className={`px-2.5 py-1 text-sm rounded-md border ${data.scaleMode === "latitude" ? "bg-accent border-accent text-white" : "border-border hover:bg-hover"}`}
              onClick={() => updateFrontmatter({ scaleMode: "latitude" })}
            >
              Realistic (latitude-based) scale
            </button>
          </div>

          {data.scaleMode === "latitude" && (
            <>
              <div className="flex flex-wrap gap-2">
                <TextField label="Top edge latitude" type="number" className="w-28" value={data.topLatitude ?? ""} onChange={(e) => updateFrontmatter({ topLatitude: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 65" />
                <TextField label="Bottom edge latitude" type="number" className="w-28" value={data.bottomLatitude ?? ""} onChange={(e) => updateFrontmatter({ bottomLatitude: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 10" />
                <TextField label={`Planet circumference (${data.latitudeUnit})`} type="number" className="w-40" value={data.planetCircumference ?? ""} onChange={(e) => updateFrontmatter({ planetCircumference: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 24901" />
                <TextField label="Unit" className="w-24" value={data.latitudeUnit} onChange={(e) => updateFrontmatter({ latitudeUnit: e.target.value || "miles" })} placeholder="miles" />
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={data.accountForLatitudeDistortion}
                  disabled={derivedEquatorY === null || !data.planetCircumference}
                  onChange={(e) => updateFrontmatter({ accountForLatitudeDistortion: e.target.checked })}
                />
                Account for planet curvature
              </label>
              {(data.topLatitude === null || data.bottomLatitude === null || !data.planetCircumference) && (
                <p className="text-sm text-muted">
                  Set the latitude at this image&apos;s top and bottom edges, plus the planet&apos;s circumference, to derive scale and the equator&apos;s position automatically. Once all three
                  are set, the curvature option above becomes available.
                </p>
              )}
            </>
          )}

          {mode === "calibrate" && pendingPixelDistance === null && <p className="text-sm text-muted">Tap two points a known real-world distance apart.</p>}
          {mode === "paint-zone" && !pendingZonePoints && <p className="text-sm text-muted">Tap to add vertices, then Finish (3+ points).</p>}
          {mode === "draw-line" && !pendingLinePoints && <p className="text-sm text-muted">Tap to add points along a road, path, or river, then Finish (2+ points).</p>}
          {mode === "paint-landmass" && !pendingLandmassPoints && <p className="text-sm text-muted">Tap to trace a continent or island&apos;s outline, then Finish (3+ points).</p>}
          {mode === "draw-trip" && <p className="text-sm text-muted">Tap to trace the actual route you&apos;d travel, then Finish (2+ points).</p>}
          {mode === "place-pin" && !pendingPinPoint && <p className="text-sm text-muted">Tap a spot on the map to place a pin.</p>}

          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showLandmasses} onChange={(e) => setShowLandmasses(e.target.checked)} />
              Landmasses
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
              Terrain
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
              Lines
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
              Pins
            </label>
          </div>

          {/* Taller on desktop — a fixed mobile-sized height left most of a
              wide monitor's vertical space empty below the map. */}
          <div className="relative h-[480px] md:h-[70vh] border border-border rounded-lg overflow-hidden">
            <MapCanvas
              imageUrl={imageUrl ?? undefined}
              imageWidth={workingDims.width}
              imageHeight={workingDims.height}
              zones={data.zones}
              lines={data.lines}
              landmasses={data.landmasses}
              pins={data.pins}
              terrainTypes={data.terrainTypes}
              lineTypes={data.lineTypes}
              mode={mode}
              onCalibrate={setPendingPixelDistance}
              onZoneDrawn={setPendingZonePoints}
              onLineDrawn={setPendingLinePoints}
              onLandmassDrawn={setPendingLandmassPoints}
              onTripDrawn={(points) => {
                setDrawnTripPath(points);
                const legs =
                  data.wrapsHorizontally || data.wrapsVertically
                    ? foldDrawnPathAtWraps(points, { mapWidth: workingDims.width, mapHeight: workingDims.height, wrapsHorizontally: data.wrapsHorizontally, wrapsVertically: data.wrapsVertically })
                    : [points];
                setTripOverlayPath(legs);
                setMode("view");
              }}
              onPinPlaced={(point) => {
                setPendingPinPoint(point);
                setPinQuery("");
                setPinResults([]);
              }}
              onPinClick={(pin) => pin.locationTitle && void openLocationNote(pin.locationTitle)}
              highlightedPinIds={highlightedPinIds}
              tripPath={tripOverlayPath}
              equatorY={derivedEquatorY}
              wrapsHorizontally={data.wrapsHorizontally}
              wrapsVertically={data.wrapsVertically}
              showLandmasses={showLandmasses}
              showZones={showZones}
              showLines={showLines}
              showPins={showPins}
            />
          </div>

          {pendingPixelDistance !== null && (
            <div className="flex flex-wrap items-end gap-2">
              <TextField label="Real distance" type="number" className="w-28" value={realDistanceInput} onChange={(e) => setRealDistanceInput(e.target.value)} autoFocus />
              <TextField label="Unit" className="w-24" value={unitInput} onChange={(e) => setUnitInput(e.target.value)} placeholder="miles" />
              <Button variant="primary" onClick={confirmCalibration}>
                Set scale
              </Button>
              <Button onClick={cancelCalibration}>Cancel</Button>
            </div>
          )}

          {pendingZonePoints && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Terrain type</span>
                <select value={terrainChoice} onChange={(e) => setTerrainChoice(e.target.value)}>
                  <option value="">Choose…</option>
                  {data.terrainTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="__new__">+ New terrain type…</option>
                </select>
              </label>
              {terrainChoice === "__new__" && (
                <>
                  <TextField label="Name" className="w-32" value={newTerrainName} onChange={(e) => setNewTerrainName(e.target.value)} placeholder="Forest" />
                  <TextField label="Color" type="color" className="w-14" value={newTerrainColor} onChange={(e) => setNewTerrainColor(e.target.value)} />
                  <TextField label="Speed x" type="number" step="0.1" className="w-20" value={newTerrainMultiplier} onChange={(e) => setNewTerrainMultiplier(Number(e.target.value))} />
                </>
              )}
              <Button variant="primary" onClick={confirmZone}>
                Add zone
              </Button>
              <Button onClick={cancelZone}>Cancel</Button>
            </div>
          )}

          {pendingLinePoints && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted">Line type</span>
                  <select value={terrainChoice} onChange={(e) => setTerrainChoice(e.target.value)}>
                    <option value="">Choose…</option>
                    {data.lineTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    <option value="__new__">+ New line type…</option>
                  </select>
                </label>
                {terrainChoice === "__new__" && (
                  <>
                    <TextField label="Name" className="w-32" value={newTerrainName} onChange={(e) => setNewTerrainName(e.target.value)} placeholder="Road" />
                    <TextField label="Color" type="color" className="w-14" value={newTerrainColor} onChange={(e) => setNewTerrainColor(e.target.value)} />
                    <TextField label="Speed x" type="number" step="0.1" className="w-20" value={newTerrainMultiplier} onChange={(e) => setNewTerrainMultiplier(Number(e.target.value))} />
                  </>
                )}
                <TextField label="Width (px)" type="number" className="w-24" value={lineWidthInput} onChange={(e) => setLineWidthInput(Number(e.target.value))} />
                <Button variant="primary" onClick={confirmLine}>
                  Add line
                </Button>
                <Button onClick={cancelLine}>Cancel</Button>
              </div>

              {effectiveScale && previewMultiplier !== undefined && travelModes.length > 0 && (
                <div>
                  <span className="text-sm text-muted">Approx. time to cross this width, per travel mode:</span>
                  <div className="overflow-x-auto">
                    <table className="text-sm border-collapse">
                      <tbody>
                        {travelModes.map((m) => {
                          const time = crossingTime(lineWidthInput, effectiveScale, previewMultiplier, m);
                          const normal = crossingTime(lineWidthInput, effectiveScale, 1, m);
                          const delta = time - normal;
                          return (
                            <tr key={m.id}>
                              <td className="pr-3">{m.name}</td>
                              <td className="pr-3">{time === Infinity ? "impassable" : `${time.toFixed(1)} ${m.timeUnitLabel}`}</td>
                              <td>{time === Infinity ? "" : `(${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${m.timeUnitLabel} vs. normal ground)`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!effectiveScale && <p className="text-sm text-muted">{data.scaleMode === "latitude" ? "Fill in the latitude/circumference fields above" : "Calibrate this map's scale"} to preview crossing times.</p>}
            </div>
          )}

          {pendingLandmassPoints && (
            <div className="flex flex-wrap items-end gap-2">
              <TextField label="Name (optional)" className="w-48" value={newLandmassName} onChange={(e) => setNewLandmassName(e.target.value)} placeholder="The Old Continent" autoFocus />
              <Button variant="primary" onClick={confirmLandmass}>
                Add landmass
              </Button>
              <Button onClick={cancelLandmass}>Cancel</Button>
            </div>
          )}

          {pendingPinPoint && (
            <div className="flex flex-col gap-1.5">
              <input value={pinQuery} onChange={(e) => setPinQuery(e.target.value)} placeholder="Search existing location notes, or type any label…" autoFocus />
              {pinResults.map((r) => (
                <button key={r.title} className="text-left bg-transparent border-0 cursor-pointer p-1 hover:bg-hover rounded" onClick={() => confirmPin(r.title)}>
                  {r.title} (linked note)
                </button>
              ))}
              <Button disabled={!pinQuery.trim()} onClick={confirmFreehandPin}>
                Just place a pin here labeled &quot;{pinQuery.trim() || "…"}&quot; (no note)
              </Button>
              <p className="text-sm text-muted">A freehand pin has no linked note — it still works in the trip calculator, just nothing to open.</p>
              <Button onClick={cancelPin}>Cancel</Button>
            </div>
          )}
        </>
      )}

      {data.terrainTypes.length > 0 && (
        <section>
          <h3 className="font-medium mb-1">Terrain types</h3>
          <p className="text-sm text-muted mb-1">For painted regions (Paint Terrain) — edit anytime, including the seeded defaults.</p>
          {data.terrainTypes.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 mb-1">
              <input type="color" value={t.color} onChange={(e) => updateTerrainType(t.id, { color: e.target.value })} />
              <input className="flex-[2] min-w-0" value={t.name} onChange={(e) => updateTerrainType(t.id, { name: e.target.value })} />
              <label className="flex items-center gap-1 text-xs">
                Speed x
                <input type="number" step="0.1" className="w-14" value={t.speedMultiplier} onChange={(e) => updateTerrainType(t.id, { speedMultiplier: Number(e.target.value) })} />
              </label>
              <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removeTerrainType(t.id)} title="Delete terrain type">
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      {data.lineTypes.length > 0 && (
        <section>
          <h3 className="font-medium mb-1">Line types</h3>
          <p className="text-sm text-muted mb-1">For roads, paths, and rivers (Draw Line) — edit anytime, including the seeded defaults.</p>
          {data.lineTypes.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 mb-1">
              <input type="color" value={t.color} onChange={(e) => updateLineType(t.id, { color: e.target.value })} />
              <input className="flex-[2] min-w-0" value={t.name} onChange={(e) => updateLineType(t.id, { name: e.target.value })} />
              <label className="flex items-center gap-1 text-xs">
                Speed x
                <input type="number" step="0.1" className="w-14" value={t.speedMultiplier} onChange={(e) => updateLineType(t.id, { speedMultiplier: Number(e.target.value) })} />
              </label>
              <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removeLineType(t.id)} title="Delete line type">
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      {data.zones.length > 0 && (
        <details>
          <summary className="font-medium cursor-pointer">Terrain zones ({data.zones.length})</summary>
          {data.zones.map((zone) => (
            <div key={zone.id} className="flex items-center gap-1.5 text-sm mt-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.terrainTypes.find((t) => t.id === zone.terrainTypeId)?.color ?? "#888" }} />
              <span>{terrainNameById.get(zone.terrainTypeId) ?? "Unknown terrain"}</span>
              <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removeZone(zone.id)}>
                ✕
              </button>
            </div>
          ))}
        </details>
      )}

      {data.lines.length > 0 && (
        <details>
          <summary className="font-medium cursor-pointer">Lines (roads, paths, rivers) ({data.lines.length})</summary>
          {data.lines.map((line) => (
            <div key={line.id} className="flex items-center gap-1.5 text-sm mt-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.lineTypes.find((t) => t.id === line.lineTypeId)?.color ?? "#888" }} />
              <span>
                {lineTypeNameById.get(line.lineTypeId) ?? "Unknown line type"} ({line.widthPixels}px wide)
              </span>
              <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removeLine(line.id)}>
                ✕
              </button>
            </div>
          ))}
        </details>
      )}

      {data.landmasses.length > 0 && (
        <details>
          <summary className="font-medium cursor-pointer">Landmasses (continents/islands) ({data.landmasses.length})</summary>
          <p className="text-sm text-muted mt-1">Anything outside every landmass boundary is treated as water, using the Water terrain pick below (or normal 1x speed if none is set).</p>
          {data.landmasses.map((landmass) => (
            <div key={landmass.id} className="flex items-center gap-1.5 text-sm mt-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed" style={{ borderColor: "#2a6f97" }} />
              <span>{landmass.name || "Unnamed landmass"}</span>
              <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removeLandmass(landmass.id)}>
                ✕
              </button>
            </div>
          ))}
          <label className="flex flex-col gap-1.5 mt-1.5 max-w-[260px]">
            <span className="text-sm text-muted">Water terrain</span>
            <select value={data.waterTerrainTypeId ?? ""} onChange={(e) => updateFrontmatter({ waterTerrainTypeId: e.target.value || null })}>
              <option value="">None (water = normal 1x speed)</option>
              {data.terrainTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </details>
      )}

      {data.pins.length > 0 && (
        <details>
          <summary className="font-medium cursor-pointer">Pins ({data.pins.length})</summary>
          {data.pins.map((pin) =>
            pin.locationTitle ? (
              <div key={pin.id} className="flex items-center gap-1.5 text-sm mt-1">
                <button className="text-left bg-transparent border-0 cursor-pointer p-0 text-accent underline" onClick={() => void openLocationNote(pin.locationTitle!)}>
                  {pin.locationTitle}
                </button>
                <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removePin(pin.id)}>
                  ✕
                </button>
              </div>
            ) : (
              <div key={pin.id} className="flex items-center gap-1.5 text-sm mt-1">
                <span className="opacity-70">{pin.label} (no note)</span>
                <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => removePin(pin.id)}>
                  ✕
                </button>
              </div>
            )
          )}
        </details>
      )}

      <details>
        <summary className="font-medium cursor-pointer">Trip calculator</summary>
        <div className="mt-2">
          <MapTripCalculator
            pins={data.pins}
            zones={data.zones}
            lines={data.lines}
            terrainTypes={data.terrainTypes}
            lineTypes={data.lineTypes}
            landmasses={data.landmasses}
            waterTerrainTypeId={data.waterTerrainTypeId}
            scale={effectiveScale}
            image={workingDims}
            wrapsHorizontally={data.wrapsHorizontally}
            wrapsVertically={data.wrapsVertically}
            equatorY={derivedEquatorY}
            planetCircumference={data.planetCircumference}
            accountForLatitudeDistortion={data.accountForLatitudeDistortion}
            modes={travelModes}
            modesLoading={travelModesLoading}
            drawnPath={drawnTripPath}
            onClearDrawnPath={() => {
              setDrawnTripPath(null);
              setTripOverlayPath(null);
            }}
            onStartDrawing={() => setMode("draw-trip")}
            onShowPathChange={setTripOverlayPath}
          />
        </div>
      </details>

      <details onToggle={(e) => !e.currentTarget.open && setHighlightedPinIds(new Set())}>
        <summary className="font-medium cursor-pointer">Timeline</summary>
        <div className="mt-2">
          <MapTimeline
            pins={data.pins}
            zones={data.zones}
            lines={data.lines}
            terrainTypes={data.terrainTypes}
            lineTypes={data.lineTypes}
            landmasses={data.landmasses}
            waterTerrainTypeId={data.waterTerrainTypeId}
            scale={effectiveScale}
            modes={travelModes}
            onHighlightChange={setHighlightedPinIds}
          />
        </div>
      </details>

      <details>
        <summary className="font-medium cursor-pointer">Travel modes (shared across all maps)</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {travelModesLoading ? (
            <p className="text-sm text-muted">Loading travel modes…</p>
          ) : (
            <>
              {travelModes.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5">
                  <input className="flex-[2] min-w-0" value={m.name} onChange={(e) => void saveTravelModes(travelModes.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                  <input type="number" className="w-16" value={m.speed} onChange={(e) => void saveTravelModes(travelModes.map((x) => (x.id === m.id ? { ...x, speed: Number(e.target.value) } : x)))} />
                  <span className="text-xs text-muted">per</span>
                  <input
                    className="w-20"
                    value={m.timeUnitLabel}
                    onChange={(e) => void saveTravelModes(travelModes.map((x) => (x.id === m.id ? { ...x, timeUnitLabel: e.target.value } : x)))}
                    placeholder="hours"
                  />
                  <button className="text-muted hover:text-danger bg-transparent border-0 cursor-pointer px-1" onClick={() => void saveTravelModes(travelModes.filter((x) => x.id !== m.id))} title="Remove">
                    ✕
                  </button>
                </div>
              ))}
              <Button onClick={() => void saveTravelModes([...travelModes, { id: crypto.randomUUID(), name: "New mode", speed: 1, timeUnitLabel: "hours" }])}>+ Add travel mode</Button>
              <p className="text-sm text-muted">Speed is distance-per-time-unit, in whatever real-world unit each map&apos;s own scale uses (e.g. miles).</p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
