"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clampViewBoxWidth, foldDrawnPathAtWraps, lodForZoom, polygonCentroid, segmentDistance, viewZoom, type MapLod, type Point, type WrapConfig } from "@/lib/mapGeometry";
import { pinDisplayLabel, type CityBoundary, type ClimateType, type ClimateZone, type LineType, type MapLandmass, type MapLine, type MapPin, type MapZone, type TerrainType, type Territory } from "@/lib/noteTypes/map";
import { Button } from "@/components/ui/Button";

export type MapCanvasMode = "view" | "calibrate" | "paint-zone" | "draw-line" | "paint-landmass" | "draw-trip" | "place-pin" | "select-region" | "paint-territory";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The live pan/zoom state, handed to onViewChange and the cityLayer render
// prop (Phase 7.0). `zoom` is image-width / viewBox-width (1 = whole image
// fits, larger = closer in); `lod` is the derived far/mid/near bucket a
// city-scale layer uses to decide how much to draw (silhouettes when far,
// building footprints and street labels only when near). See mapGeometry's
// viewZoom / lodForZoom.
export interface MapCanvasView {
  zoom: number;
  lod: MapLod;
  viewBox: ViewBox;
}

// Button/keyboard zoom step — one notch multiplies the viewBox size by this
// (zoom out) or its inverse (zoom in). The wheel uses its own gentler 0.9/
// 1.1, and pinch uses the raw finger-distance ratio, so neither is
// quantised to this.
const ZOOM_STEP = 1.25;

// Footprint tint by the building type's category (Phase 7.4) — the same
// "each type gets a colour" idea terrain types use, keyed off the five
// settlement building categories.
const BUILDING_CATEGORY_COLORS: Record<string, string> = {
  residence: "#a98d6b",
  shop: "#c99b52",
  civic: "#6f8fb0",
  religious: "#9a7bb0",
  tavern: "#c9793c",
};

// Below this many screen pixels of movement, a touchstart+touchend (or
// mousedown+mouseup) is treated as a tap/click (place a point / open a pin)
// rather than a pan drag — lets panning and tap-to-place share the same
// background without a separate "pan mode" toggle.
const CLICK_MOVEMENT_THRESHOLD = 4;

// The SVG's default preserveAspectRatio ("xMidYMid meet") scales the
// viewBox uniformly to fit inside the element's rendered box and centers
// it — whenever that box's aspect ratio doesn't match the viewBox's (near
// -guaranteed here, since the container is a fixed-height panel but the
// viewBox tracks the uploaded image's own dimensions), that leaves a
// letterboxed margin on two sides. A naive clientX/rect.width * viewBox.w
// conversion ignores that margin entirely, so every tap/click lands offset
// from the cursor by however wide the margin is.
function getViewportTransform(rect: DOMRect, viewBox: ViewBox): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
  return {
    scale,
    offsetX: (rect.width - viewBox.w * scale) / 2,
    offsetY: (rect.height - viewBox.h * scale) / 2,
  };
}

export interface MapCanvasProps {
  // Empty/absent for a purely-generated map with no uploaded raster — the
  // <image> element is skipped entirely in that case, but the SVG's
  // coordinate space (driven by imageWidth/imageHeight) still applies, so
  // zones/lines/landmasses/pins render exactly as they would over a raster.
  // See MapForm's dimension resolution (data.canvasSize ?? data.image).
  imageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  zones: MapZone[];
  lines: MapLine[];
  landmasses: MapLandmass[];
  pins: MapPin[];
  terrainTypes: TerrainType[];
  lineTypes: LineType[];
  climateZones?: ClimateZone[];
  climateTypes?: ClimateType[];
  territories?: Territory[];
  mode: MapCanvasMode;
  onCalibrate: (pixelDistance: number) => void;
  onZoneDrawn: (points: Point[]) => void;
  onLineDrawn: (points: Point[]) => void;
  onLandmassDrawn: (points: Point[]) => void;
  // "paint-territory" mode — a hand-drawn national/civilization border,
  // same multi-point click/Finish/Clear flow as paint-landmass. Optional
  // since callers that predate this mode never pass it.
  onTerritoryDrawn?: (points: Point[]) => void;
  onTripDrawn: (points: Point[]) => void;
  onPinPlaced: (point: Point) => void;
  onPinClick: (pin: MapPin) => void;
  // "select-region" mode's own drawn boundary (Phase 5 — augment/drilldown
  // boundary selection) — same multi-point click/Finish/Clear flow as
  // paint-landmass, just producing a boundaryMask instead of a real
  // landmass. Optional since most callers (nothing pre-Phase-5) never use
  // this mode.
  onRegionDrawn?: (points: Point[]) => void;
  // The CURRENTLY ACTIVE boundary constraint (from an existing landmass or
  // a confirmed select-region draft) — rendered as a persistent highlighted
  // overlay whenever set, regardless of mode, so it's clear what area
  // "Generate" is about to be scoped to even after leaving select-region
  // mode. Distinct from the in-progress regionDraft (which only renders
  // while mode === "select-region").
  boundaryMask?: Point[] | null;
  highlightedPinIds?: Set<string>;
  tripPath?: Point[][] | null;
  equatorY?: number | null;
  wrapsHorizontally?: boolean;
  wrapsVertically?: boolean;
  // Per-layer visibility — all default to visible, so every existing caller
  // (nothing passes these yet) renders identically to before. Added for the
  // procedural map generation feature's "toggle a layer on/off" panel; see
  // the plan's Phase 0. showClimateZones added in Phase 2, showTerritories
  // in Phase 3, each alongside its own layer.
  showLandmasses?: boolean;
  showZones?: boolean;
  showLines?: boolean;
  showPins?: boolean;
  showClimateZones?: boolean;
  showTerritories?: boolean;
  // The city-scale street map's outer footprint (Phase 7.1) — rendered as a
  // wall line when `walled`, a soft edge otherwise. Null / absent on every
  // non-city map. Later sub-phases render streets/buildings via cityLayer;
  // this is just the boundary itself.
  cityBoundary?: CityBoundary | null;
  // District polygons for the linked settlement's own districts[] (Phase
  // 7.2) — rendered the same way territories are (tinted fill + name
  // label). The parent resolves these from the linked Settlement note;
  // empty/absent on every non-city map.
  cityDistricts?: { id: string; name: string; points: Point[]; color?: string }[];
  // Building footprints for the linked settlement's own buildings[] (Phase
  // 7.4) — small rotated rectangles tinted by the building type's category.
  // Only mounted at the closest LOD (a city has hundreds of them). The
  // parent resolves category from the settlement's buildingTypes[]. Extra
  // fields the parent may carry for the click panel are ignored here.
  cityBuildings?: { id: string; footprint: { x: number; y: number; width: number; height: number; rotationDegrees: number }; category: string }[];
  // Fired when a building footprint is clicked in view mode (Phase 7.5) —
  // the parent opens a detail panel for that building id.
  onBuildingClick?: (buildingId: string) => void;
  // Fired whenever the view pans or zooms, with the derived zoom factor and
  // level-of-detail bucket (Phase 7.0). Optional — only the city-scale
  // street-map UI reacts to zoom; every existing caller ignores it.
  onViewChange?: (view: MapCanvasView) => void;
  // Extra SVG content rendered above the base layers and below the pins /
  // draft overlays, given the live view so it can do its own level-of-
  // detail gating (district silhouettes when `view.lod` is "far", building
  // footprints and street labels only at "near"). The Phase 7.1+ city
  // layers plug in here, keeping MapCanvas ignorant of settlement/street
  // schemas.
  cityLayer?: (view: MapCanvasView) => ReactNode;
}

// Adapted from the Electron app's MapCanvas.tsx — same viewBox-based pan/
// zoom/click-to-place SVG engine, with touch support added since Electron's
// is mouse+keyboard only: single-finger drag pans (same tap-vs-drag
// CLICK_MOVEMENT_THRESHOLD distinction the mouse path already used), a
// two-finger pinch zooms (keeping the pinch midpoint stationary, same
// "stationary point under the gesture" math handleWheel already did for the
// cursor), and an on-screen "Finish"/"Cancel" button bar replaces Enter/
// Escape for multi-point drafts (paint-zone/draw-line/paint-landmass/draw-
// trip). The live hover ghost-preview for a cursor past a wrapping edge
// (mouse-only — touch has no hover state before a tap commits) is dropped;
// everything else, including the ghost logic for already-placed draft
// points, ports unchanged.
export function MapCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  zones,
  lines,
  landmasses,
  pins,
  terrainTypes,
  lineTypes,
  climateZones = [],
  climateTypes = [],
  territories = [],
  mode,
  onCalibrate,
  onZoneDrawn,
  onLineDrawn,
  onLandmassDrawn,
  onTerritoryDrawn,
  onTripDrawn,
  onPinPlaced,
  onPinClick,
  onRegionDrawn,
  boundaryMask,
  highlightedPinIds,
  tripPath,
  equatorY,
  wrapsHorizontally = false,
  wrapsVertically = false,
  showLandmasses = true,
  showZones = true,
  showLines = true,
  showPins = true,
  showClimateZones = true,
  showTerritories = true,
  cityBoundary,
  cityDistricts = [],
  cityBuildings = [],
  onBuildingClick,
  onViewChange,
  cityLayer,
}: MapCanvasProps) {
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: imageWidth, h: imageHeight });
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null);
  const [zoneDraft, setZoneDraft] = useState<Point[]>([]);
  const [lineDraft, setLineDraft] = useState<Point[]>([]);
  const [landmassDraft, setLandmassDraft] = useState<Point[]>([]);
  const [territoryDraft, setTerritoryDraft] = useState<Point[]>([]);
  const [tripDraft, setTripDraft] = useState<Point[]>([]);
  const [regionDraft, setRegionDraft] = useState<Point[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ startDist: number; startMidX: number; startMidY: number; origVb: ViewBox } | null>(null);
  const viewBoxRef = useRef(viewBox);
  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  const handleClickAtRef = useRef<(point: Point) => void>(() => {});
  const onPinClickRef = useRef(onPinClick);
  const onBuildingClickRef = useRef(onBuildingClick);
  useEffect(() => {
    onPinClickRef.current = onPinClick;
    onBuildingClickRef.current = onBuildingClick;
  }, [onPinClick, onBuildingClick]);

  // Derived pan/zoom state (Phase 7.0). `zoom`/`lod` update on every pan or
  // zoom tick; `view` is memoised so its identity only changes when a field
  // actually does, keeping the onViewChange effect and cityLayer from
  // re-firing on unrelated renders.
  const zoom = viewZoom(imageWidth, viewBox.w);
  const lod = lodForZoom(zoom);
  const view = useMemo<MapCanvasView>(() => ({ zoom, lod, viewBox }), [zoom, lod, viewBox]);

  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);
  useEffect(() => {
    onViewChangeRef.current?.(view);
  }, [view]);

  // Zoom the view by `factor` (>1 zooms out, <1 zooms in), keeping the
  // point under (screenX, screenY) — the viewport centre when omitted —
  // stationary, the same "anchor a point under the gesture" math the wheel
  // and pinch paths use. Shared by the wheel handler, the on-canvas +/−/Fit
  // buttons, and the keyboard shortcuts so they can't diverge.
  const zoomBy = (factor: number, screenX?: number, screenY?: number): void => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = screenX ?? rect.left + rect.width / 2;
    const sy = screenY ?? rect.top + rect.height / 2;
    setViewBox((vb) => {
      const before = getViewportTransform(rect, vb);
      const px = vb.x + (sx - rect.left - before.offsetX) / before.scale;
      const py = vb.y + (sy - rect.top - before.offsetY) / before.scale;
      const newW = clampViewBoxWidth(vb.w * factor, imageWidth);
      const newH = vb.h * (newW / vb.w);
      const after = getViewportTransform(rect, { x: vb.x, y: vb.y, w: newW, h: newH });
      const newMx = sx - rect.left - after.offsetX;
      const newMy = sy - rect.top - after.offsetY;
      return { x: px - newMx / after.scale, y: py - newMy / after.scale, w: newW, h: newH };
    });
  };
  const resetView = (): void => setViewBox({ x: 0, y: 0, w: imageWidth, h: imageHeight });

  const zoomByRef = useRef(zoomBy);
  const resetViewRef = useRef(resetView);
  useEffect(() => {
    zoomByRef.current = zoomBy;
    resetViewRef.current = resetView;
  });

  // Keyboard zoom (Phase 7.0) — +/= in, -/_ out, 0 to fit. Ignored while a
  // form field is focused so typing "-" or "0" into the calibration/latitude
  // inputs doesn't jump the map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key === "+" || e.key === "=") zoomByRef.current(1 / ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") zoomByRef.current(ZOOM_STEP);
      else if (e.key === "0") resetViewRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const terrainTypesById = useMemo(() => new Map(terrainTypes.map((t) => [t.id, t])), [terrainTypes]);
  const lineTypesById = useMemo(() => new Map(lineTypes.map((t) => [t.id, t])), [lineTypes]);
  const climateTypesById = useMemo(() => new Map(climateTypes.map((t) => [t.id, t])), [climateTypes]);
  const pinRadius = Math.max(6, Math.min(imageWidth, imageHeight) * 0.01);
  const equatorStrokeWidth = Math.max(2, Math.min(imageWidth, imageHeight) * 0.003);
  const wrapConfig: WrapConfig = { mapWidth: imageWidth, mapHeight: imageHeight, wrapsHorizontally, wrapsVertically };

  const foldedTripDraft = useMemo(() => {
    if (tripDraft.length < 2) return [];
    if (!wrapsHorizontally && !wrapsVertically) return [tripDraft];
    return foldDrawnPathAtWraps(tripDraft, wrapConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripDraft, wrapsHorizontally, wrapsVertically, imageWidth, imageHeight]);

  const landmassElements = useMemo(
    () =>
      landmasses.map((landmass) => (
        <polygon
          key={landmass.id}
          points={landmass.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="#2a6f97"
          fillOpacity={0.06}
          stroke="#2a6f97"
          strokeOpacity={0.8}
          strokeWidth={2}
          strokeDasharray="6,4"
        />
      )),
    [landmasses]
  );

  // Renders BELOW terrain zones (landmasses -> climate -> territories ->
  // terrain -> lines -> pins) — a climate zone is a broad background biome
  // tint, while a terrain zone is a more specific painted region that
  // should still read clearly on top of it. Higher fillOpacity than a
  // terrain zone (0.35) since climate zones are typically much larger and
  // would otherwise barely register at the same faintness.
  const climateZoneElements = useMemo(
    () =>
      climateZones.map((zone) => (
        <polygon
          key={zone.id}
          points={zone.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={climateTypesById.get(zone.climateTypeId)?.color ?? "#888"}
          fillOpacity={0.45}
          stroke="none"
        />
      )),
    [climateZones, climateTypesById]
  );

  // Renders on top of climate (so borders stay visible regardless of the
  // biome tint underneath) but below terrain zones — a national border is
  // a political fact, not a physical feature, so it shouldn't visually
  // compete with an actually-painted terrain region.
  const territoryElements = useMemo(
    () =>
      territories.map((territory) => (
        <polygon
          key={territory.id}
          points={territory.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={territory.color}
          fillOpacity={0.18}
          stroke={territory.color}
          strokeOpacity={0.9}
          strokeWidth={2.5}
        />
      )),
    [territories]
  );

  // City districts (Phase 7.2) — same visual language as territories (tinted
  // fill + centred name label), hue cycled by index so adjacent districts
  // read apart. A district carries its own `color` only if the caller
  // assigned one; otherwise it's derived here.
  const cityDistrictElements = useMemo(
    () =>
      cityDistricts
        .filter((d) => d.points.length >= 3)
        .map((district, i) => {
          const color = district.color ?? `hsl(${Math.round((360 / Math.max(1, cityDistricts.length)) * i)}, 45%, 45%)`;
          const centre = polygonCentroid(district.points);
          return (
            <g key={district.id}>
              <polygon points={district.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} fillOpacity={0.16} stroke={color} strokeOpacity={0.75} strokeWidth={2} />
              <text x={centre.x} y={centre.y} textAnchor="middle" fill={color} style={{ fontWeight: 600 }}>
                {district.name}
              </text>
            </g>
          );
        }),
    [cityDistricts]
  );

  const zoneElements = useMemo(
    () =>
      zones.map((zone) => (
        <polygon
          key={zone.id}
          points={zone.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={terrainTypesById.get(zone.terrainTypeId)?.color ?? "#888"}
          fillOpacity={0.35}
          stroke={terrainTypesById.get(zone.terrainTypeId)?.color ?? "#888"}
          strokeWidth={2}
        />
      )),
    [zones, terrainTypesById]
  );

  const lineElements = useMemo(
    () =>
      lines.map((line) => (
        <polyline
          key={line.id}
          points={line.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={lineTypesById.get(line.lineTypeId)?.color ?? "#888"}
          strokeOpacity={0.6}
          strokeWidth={line.widthPixels}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )),
    [lines, lineTypesById]
  );

  // Building footprints (Phase 7.4) — a small rectangle per placed
  // building, rotated about its own centre, tinted by category, and only at
  // the closest LOD (a city has hundreds). This is the LOD's primary job:
  // bounding the *rendered* element count, not just the generated one.
  // Clickable in view mode (Phase 7.5), same opt-out-of-pan-tracking
  // pattern as a pin (data attribute + stopPropagation); in a drawing mode
  // a click on a building places a point there like a click anywhere else.
  const cityBuildingElements = useMemo(() => {
    if (lod !== "near") return [];
    return cityBuildings.map(({ id, footprint: f, category }) => (
      <rect
        key={`bld-${id}`}
        data-map-building="true"
        x={f.x - f.width / 2}
        y={f.y - f.height / 2}
        width={f.width}
        height={f.height}
        transform={`rotate(${f.rotationDegrees}, ${f.x}, ${f.y})`}
        fill={BUILDING_CATEGORY_COLORS[category] ?? BUILDING_CATEGORY_COLORS.shop}
        fillOpacity={0.9}
        stroke="#3a3128"
        strokeOpacity={0.55}
        strokeWidth={0.5}
        style={{ cursor: mode === "view" ? "pointer" : "crosshair" }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={() => (mode === "view" ? onBuildingClickRef.current?.(id) : handleClickAtRef.current({ x: f.x, y: f.y }))}
      />
    ));
  }, [cityBuildings, lod, mode]);

  // Street name labels (Phase 7.3) — only lines with a `name` (city
  // streets; rivers/roads leave it null), and only at the closest LOD, so
  // a zoomed-out city isn't a wall of text. Rotated along the street, with
  // a white halo so they read over any block fill. Rebuilt when `lod`
  // crosses the threshold, not on every pan/zoom tick.
  const streetLabelElements = useMemo(() => {
    if (lod !== "near") return [];
    return lines
      .filter((line) => line.name && line.points.length >= 2)
      .map((line) => {
        const midIndex = Math.floor(line.points.length / 2);
        const mid = line.points[midIndex];
        const prev = line.points[Math.max(0, midIndex - 1)];
        let angle = (Math.atan2(mid.y - prev.y, mid.x - prev.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return (
          <text
            key={`street-label-${line.id}`}
            x={mid.x}
            y={mid.y}
            textAnchor="middle"
            transform={`rotate(${angle}, ${mid.x}, ${mid.y})`}
            fill={lineTypesById.get(line.lineTypeId)?.color ?? "#6a5a44"}
            style={{ fontSize: 10, fontWeight: 600, paintOrder: "stroke", stroke: "#fff", strokeWidth: 3, strokeLinejoin: "round" }}
          >
            {line.name}
          </text>
        );
      });
  }, [lines, lineTypesById, lod]);

  const pinElements = useMemo(
    () =>
      pins.map((pin) => (
        <g
          key={pin.id}
          data-map-pin="true"
          transform={`translate(${pin.x}, ${pin.y})`}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => (mode === "view" ? onPinClickRef.current(pin) : handleClickAtRef.current({ x: pin.x, y: pin.y }))}
          style={{ cursor: mode === "view" && pin.locationTitle ? "pointer" : mode === "view" ? "default" : "crosshair" }}
        >
          {highlightedPinIds?.has(pin.id) && <circle r={pinRadius + 5} fill="none" stroke="#7c8cff" strokeWidth={3} />}
          <circle r={pinRadius} fill={pin.locationTitle ? "#e08a3c" : "#888"} stroke="#fff" strokeWidth={2} strokeDasharray={pin.locationTitle ? undefined : "3,2"} />
          <text y={-pinRadius - 6} textAnchor="middle" fill="#fff">
            {pinDisplayLabel(pin)}
          </text>
        </g>
      )),
    [pins, mode, highlightedPinIds, pinRadius]
  );

  const tripPathElements = useMemo(
    () =>
      tripPath?.map(
        (leg, legIndex) =>
          leg.length > 1 && (
            <g key={legIndex}>
              <polyline points={leg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={6} strokeLinecap="round" />
              <polyline points={leg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#ffd60a" strokeWidth={3} strokeDasharray="10,6" strokeLinecap="round" />
              {leg.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={5} fill="#ffd60a" stroke="#000" strokeWidth={1.5} />
              ))}
            </g>
          )
      ),
    [tripPath]
  );

  // "Adjusting state when a prop changes" via a conditional setState call
  // during render (comparing against a tracked previous value), not inside
  // a useEffect — React's own documented pattern for this exact case
  // (https://react.dev/learn/you-might-not-need-an-effect), and the one
  // react-hooks/set-state-in-effect actually wants here: a plain effect
  // would need an extra render pass to apply the reset, this doesn't.
  const imageKey = `${imageUrl}|${imageWidth}|${imageHeight}`;
  const [prevImageKey, setPrevImageKey] = useState(imageKey);
  if (imageKey !== prevImageKey) {
    setPrevImageKey(imageKey);
    setViewBox({ x: 0, y: 0, w: imageWidth, h: imageHeight });
  }

  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setCalibrationStart(null);
    setZoneDraft([]);
    setLineDraft([]);
    setLandmassDraft([]);
    setTerritoryDraft([]);
    setTripDraft([]);
    setRegionDraft([]);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (mode === "paint-zone") {
        if (e.key === "Enter" && zoneDraft.length >= 3) {
          onZoneDrawn(zoneDraft);
          setZoneDraft([]);
        } else if (e.key === "Escape") {
          setZoneDraft([]);
        }
      } else if (mode === "draw-line") {
        if (e.key === "Enter" && lineDraft.length >= 2) {
          onLineDrawn(lineDraft);
          setLineDraft([]);
        } else if (e.key === "Escape") {
          setLineDraft([]);
        }
      } else if (mode === "paint-landmass") {
        if (e.key === "Enter" && landmassDraft.length >= 3) {
          onLandmassDrawn(landmassDraft);
          setLandmassDraft([]);
        } else if (e.key === "Escape") {
          setLandmassDraft([]);
        }
      } else if (mode === "paint-territory") {
        if (e.key === "Enter" && territoryDraft.length >= 3) {
          onTerritoryDrawn?.(territoryDraft);
          setTerritoryDraft([]);
        } else if (e.key === "Escape") {
          setTerritoryDraft([]);
        }
      } else if (mode === "draw-trip") {
        if (e.key === "Enter" && tripDraft.length >= 2) {
          onTripDrawn(tripDraft);
          setTripDraft([]);
        } else if (e.key === "Escape") {
          setTripDraft([]);
        }
      } else if (mode === "select-region") {
        if (e.key === "Enter" && regionDraft.length >= 3) {
          onRegionDrawn?.(regionDraft);
          setRegionDraft([]);
        } else if (e.key === "Escape") {
          setRegionDraft([]);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, zoneDraft, onZoneDrawn, lineDraft, onLineDrawn, landmassDraft, onLandmassDrawn, territoryDraft, onTerritoryDrawn, tripDraft, onTripDrawn, regionDraft, onRegionDrawn]);

  const clientToSvgPoint = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const vb = viewBoxRef.current;
    const { scale, offsetX, offsetY } = getViewportTransform(rect, vb);
    return { x: vb.x + (clientX - rect.left - offsetX) / scale, y: vb.y + (clientY - rect.top - offsetY) / scale };
  };

  const handleClickAt = (point: Point): void => {
    if (mode === "calibrate") {
      if (!calibrationStart) {
        setCalibrationStart(point);
      } else {
        onCalibrate(segmentDistance(calibrationStart, point));
        setCalibrationStart(null);
      }
    } else if (mode === "paint-zone") {
      setZoneDraft((pts) => [...pts, point]);
    } else if (mode === "draw-line") {
      setLineDraft((pts) => [...pts, point]);
    } else if (mode === "paint-landmass") {
      setLandmassDraft((pts) => [...pts, point]);
    } else if (mode === "paint-territory") {
      setTerritoryDraft((pts) => [...pts, point]);
    } else if (mode === "draw-trip") {
      setTripDraft((pts) => [...pts, point]);
    } else if (mode === "place-pin") {
      onPinPlaced(point);
    } else if (mode === "select-region") {
      setRegionDraft((pts) => [...pts, point]);
    }
  };
  useEffect(() => {
    handleClickAtRef.current = handleClickAt;
  });

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.9 : 1.1, e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>): void => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: viewBox.x, origY: viewBox.y, moved: false };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      const drag = dragRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > CLICK_MOVEMENT_THRESHOLD) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const { scale } = getViewportTransform(rect, viewBoxRef.current);
      const dxUser = (e.clientX - drag.startX) / scale;
      const dyUser = (e.clientY - drag.startY) / scale;
      setViewBox((vb) => ({ ...vb, x: drag.origX - dxUser, y: drag.origY - dyUser }));
    };
    const handleMouseUp = (e: MouseEvent): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved) return;
      const point = clientToSvgPoint(e.clientX, e.clientY);
      if (point) handleClickAt(point);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBox.w, viewBox.h, mode, calibrationStart, zoneDraft, lineDraft, landmassDraft, territoryDraft, tripDraft, regionDraft]);

  // Touch equivalent of the mouse pan/click handling above — a single
  // finger either pans (moved past CLICK_MOVEMENT_THRESHOLD) or taps (place
  // a point), same distinction. touchstart is attached directly to the SVG
  // (like onMouseDown — a gesture has to start on the canvas), touchmove/
  // touchend go on window (like the mouse listeners) so a finger sliding
  // past the SVG's edge still pans. All three need {passive: false} +
  // preventDefault(), not just touchmove during an actual drag: without it,
  // a real device fires a *synthetic* mousedown/mouseup/click ~afterward
  // for every tap, which the mouse listeners below then treat as a SECOND,
  // independent click — confirmed on a real phone as taps registering 2
  // points instead of 1 (occasionally more, depending on how fast the
  // synthetic events landed relative to the next tap).
  //
  // Pins opt out of this entirely (checked via e.target here, since a
  // pin's own onTouchStart={stopPropagation} is a *React synthetic* handler
  // — it can't stop this *native* listener, which sits on the actual <svg>
  // DOM node, closer to the target than React's root-level delegated
  // listener, so it always runs first regardless). Without this bail, a tap
  // on a pin still fell through to pan-tracking/preventDefault here, which
  // both suppressed the browser's synthesized click (so the pin's own
  // onClick never fired) and, in view mode, invoked handleClickAt with no
  // matching branch — taps on pins did nothing at all.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleTouchStart = (e: TouchEvent): void => {
      if (e.target instanceof Element && e.target.closest("[data-map-pin], [data-map-building]")) return;
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { startX: t.clientX, startY: t.clientY, origX: viewBoxRef.current.x, origY: viewBoxRef.current.y, moved: false };
        pinchRef.current = null;
      } else if (e.touches.length === 2) {
        dragRef.current = null;
        const [a, b] = [e.touches[0], e.touches[1]];
        pinchRef.current = {
          startDist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
          startMidX: (a.clientX + b.clientX) / 2,
          startMidY: (a.clientY + b.clientY) / 2,
          origVb: viewBoxRef.current,
        };
      }
    };
    svg.addEventListener("touchstart", handleTouchStart, { passive: false });
    return () => svg.removeEventListener("touchstart", handleTouchStart);
  }, []);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent): void => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const pinch = pinchRef.current;
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;
        if (dist <= 0 || pinch.startDist <= 0) return;

        const before = getViewportTransform(rect, pinch.origVb);
        // The map-space point under the pinch's ORIGINAL midpoint — kept
        // stationary under the (possibly moved) current midpoint, same
        // "stationary point under the gesture" math handleWheel uses for a
        // mouse cursor.
        const px = pinch.origVb.x + (pinch.startMidX - rect.left - before.offsetX) / before.scale;
        const py = pinch.origVb.y + (pinch.startMidY - rect.top - before.offsetY) / before.scale;

        const scaleFactor = pinch.startDist / dist;
        const newW = clampViewBoxWidth(pinch.origVb.w * scaleFactor, imageWidth);
        const newH = pinch.origVb.h * (newW / pinch.origVb.w);

        const after = getViewportTransform(rect, { x: pinch.origVb.x, y: pinch.origVb.y, w: newW, h: newH });
        const newMx = midX - rect.left - after.offsetX;
        const newMy = midY - rect.top - after.offsetY;
        setViewBox({ x: px - newMx / after.scale, y: py - newMy / after.scale, w: newW, h: newH });
        return;
      }

      const drag = dragRef.current;
      if (e.touches.length === 1 && drag) {
        const t = e.touches[0];
        if (!drag.moved && Math.hypot(t.clientX - drag.startX, t.clientY - drag.startY) > CLICK_MOVEMENT_THRESHOLD) {
          drag.moved = true;
        }
        if (!drag.moved) return;
        e.preventDefault();
        const { scale } = getViewportTransform(rect, viewBoxRef.current);
        const dxUser = (t.clientX - drag.startX) / scale;
        const dyUser = (t.clientY - drag.startY) / scale;
        setViewBox((vb) => ({ ...vb, x: drag.origX - dxUser, y: drag.origY - dyUser }));
      }
    };
    const handleTouchEnd = (e: TouchEvent): void => {
      e.preventDefault();
      const drag = dragRef.current;
      const pinch = pinchRef.current;
      if (e.touches.length === 0) {
        dragRef.current = null;
        pinchRef.current = null;
        if (drag && !drag.moved && !pinch) {
          const t = e.changedTouches[0];
          const point = t && clientToSvgPoint(t.clientX, t.clientY);
          if (point) handleClickAt(point);
        }
      } else if (e.touches.length === 1) {
        // Lifted one of two fingers mid-pinch — resume single-finger pan
        // from here rather than jumping (a stale drag anchor from before
        // the pinch started would otherwise cause a visible snap).
        pinchRef.current = null;
        const t = e.touches[0];
        dragRef.current = { startX: t.clientX, startY: t.clientY, origX: viewBoxRef.current.x, origY: viewBoxRef.current.y, moved: false };
      }
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageWidth, mode, calibrationStart, zoneDraft, lineDraft, landmassDraft, territoryDraft, tripDraft, regionDraft]);

  // Touch has no equivalent of Enter/Escape — a "Finish (N points)"/"Clear
  // points" bar covers every multi-point draft mode whenever there's at
  // least one placed point. Overlaid on the canvas (not part of MapForm's
  // surrounding UI) since it needs to sit right where the drawing is
  // happening, not scrolled away below the map.
  const draftInfo: { count: number; min: number; finish: () => void; clear: () => void } | null =
    mode === "paint-zone"
      ? { count: zoneDraft.length, min: 3, finish: () => { onZoneDrawn(zoneDraft); setZoneDraft([]); }, clear: () => setZoneDraft([]) }
      : mode === "draw-line"
        ? { count: lineDraft.length, min: 2, finish: () => { onLineDrawn(lineDraft); setLineDraft([]); }, clear: () => setLineDraft([]) }
        : mode === "paint-landmass"
          ? { count: landmassDraft.length, min: 3, finish: () => { onLandmassDrawn(landmassDraft); setLandmassDraft([]); }, clear: () => setLandmassDraft([]) }
          : mode === "paint-territory"
            ? { count: territoryDraft.length, min: 3, finish: () => { onTerritoryDrawn?.(territoryDraft); setTerritoryDraft([]); }, clear: () => setTerritoryDraft([]) }
            : mode === "draw-trip"
            ? { count: tripDraft.length, min: 2, finish: () => { onTripDrawn(tripDraft); setTripDraft([]); }, clear: () => setTripDraft([]) }
            : mode === "select-region"
              ? { count: regionDraft.length, min: 3, finish: () => { onRegionDrawn?.(regionDraft); setRegionDraft([]); }, clear: () => setRegionDraft([]) }
              : null;

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full touch-none"
        style={{ cursor: mode === "view" ? "grab" : "crosshair" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        {imageUrl && <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />}

        {showLandmasses && <g>{landmassElements}</g>}
        {showClimateZones && <g>{climateZoneElements}</g>}
        {showTerritories && <g>{territoryElements}</g>}
        {showZones && <g>{zoneElements}</g>}
        {showLines && <g>{lineElements}</g>}

        {/* The city footprint (Phase 7.1). A walled town draws a heavy
            wall line (dark base + light coping stroke); an unwalled one a
            soft dashed edge with a faint fill. Renders under cityLayer so
            later districts/streets/buildings sit on top of it. */}
        {cityBoundary && cityBoundary.points.length >= 3 && (
          cityBoundary.walled ? (
            <g>
              <polygon points={cityBoundary.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="#000" fillOpacity={0.03} stroke="#3d2b1f" strokeWidth={6} strokeLinejoin="round" />
              <polygon points={cityBoundary.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#d8c3a5" strokeWidth={2.5} strokeLinejoin="round" />
            </g>
          ) : (
            <polygon
              points={cityBoundary.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#c9a24d"
              fillOpacity={0.05}
              stroke="#c9a24d"
              strokeOpacity={0.85}
              strokeWidth={3}
              strokeDasharray="10,7"
              strokeLinejoin="round"
            />
          )
        )}

        {/* City districts (Phase 7.2), inside the boundary. */}
        {cityDistrictElements.length > 0 && <g>{cityDistrictElements}</g>}

        {/* Building footprints (Phase 7.4) — above districts/streets, below
            the pins and street labels; near-LOD only. */}
        {cityBuildingElements.length > 0 && <g>{cityBuildingElements}</g>}

        {/* Phase 7.3+ city-scale layers (streets / building footprints) —
            mounted above the base map, below the pins and draft overlays,
            with their own level-of-detail gating driven by `view.lod`. */}
        {cityLayer && <g>{cityLayer(view)}</g>}

        {mode === "paint-zone" && zoneDraft.length > 0 && (
          <g>
            <polyline points={zoneDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
            <polyline points={zoneDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeDasharray="4,2" strokeWidth={2} />
            {zoneDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "draw-line" && lineDraft.length > 0 && (
          <g>
            <polyline points={lineDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
            <polyline points={lineDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeDasharray="4,2" strokeWidth={2} />
            {lineDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "paint-landmass" && landmassDraft.length > 0 && (
          <g>
            <polyline points={landmassDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
            <polyline points={landmassDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeDasharray="4,2" strokeWidth={2} />
            {landmassDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "paint-territory" && territoryDraft.length > 0 && (
          <g>
            <polyline points={territoryDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
            <polyline points={territoryDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#7c8cff" strokeDasharray="4,2" strokeWidth={2} />
            {territoryDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#7c8cff" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "draw-trip" && tripDraft.length > 0 && (
          <g>
            {foldedTripDraft.map((leg, legIndex) => (
              <g key={legIndex}>
                <polyline points={leg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
                <polyline points={leg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeDasharray="4,2" strokeWidth={2} />
              </g>
            ))}
            {tripDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "select-region" && regionDraft.length > 0 && (
          <g>
            <polyline points={regionDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={4} />
            <polyline points={regionDraft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#e0a83c" strokeDasharray="4,2" strokeWidth={2} />
            {regionDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#e0a83c" stroke="#000" strokeWidth={1.5} />
            ))}
          </g>
        )}

        {mode === "calibrate" && calibrationStart && <circle cx={calibrationStart.x} cy={calibrationStart.y} r={6} fill="#fff" stroke="#000" strokeWidth={2} />}

        {/* The CONFIRMED active boundary mask (Phase 5) — a persistent
            highlighted overlay independent of mode, so "what's about to be
            generated inside" stays visible while adjusting Generate panel
            sliders, not just while actively drawing it. */}
        {boundaryMask && boundaryMask.length >= 3 && (
          <polygon
            points={boundaryMask.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="#e0a83c"
            fillOpacity={0.08}
            stroke="#e0a83c"
            strokeOpacity={0.9}
            strokeWidth={3}
            strokeDasharray="10,5"
          />
        )}

        {equatorY != null && (
          <g>
            <line x1={viewBox.x} x2={viewBox.x + viewBox.w} y1={equatorY} y2={equatorY} stroke="#000" strokeOpacity={0.4} strokeWidth={equatorStrokeWidth + 1.5} />
            <line
              x1={viewBox.x}
              x2={viewBox.x + viewBox.w}
              y1={equatorY}
              y2={equatorY}
              stroke="#2ec4b6"
              strokeWidth={equatorStrokeWidth}
              strokeDasharray={`${equatorStrokeWidth * 5},${equatorStrokeWidth * 3}`}
            />
            <text x={viewBox.x + 8} y={equatorY - 8} fill="#2ec4b6">
              Equator
            </text>
          </g>
        )}

        {tripPath && tripPath.length > 0 && <g>{tripPathElements}</g>}

        {showLines && streetLabelElements.length > 0 && <g>{streetLabelElements}</g>}

        {showPins && <g>{pinElements}</g>}
      </svg>

      {/* On-canvas zoom controls (Phase 7.0) — pan is drag, but a discrete
          zoom-in/out/fit needs real buttons on touch and is handy on
          desktop too. Keyboard equivalents: +/-, and 0 to fit. */}
      <div className="absolute top-2 right-2 flex flex-col items-stretch gap-1">
        <Button aria-label="Zoom in" title="Zoom in (+)" className="w-8 tabular-nums" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          +
        </Button>
        <Button aria-label="Zoom out" title="Zoom out (−)" className="w-8 tabular-nums" onClick={() => zoomBy(ZOOM_STEP)}>
          −
        </Button>
        <Button aria-label="Fit map to view" title="Fit map to view (0)" className="w-8 text-xs" onClick={resetView}>
          Fit
        </Button>
        <span className="text-[10px] text-muted text-center tabular-nums select-none">{zoom.toFixed(1)}×</span>
      </div>

      {draftInfo && draftInfo.count > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 bg-panel border border-border rounded-lg px-2 py-1.5 shadow-lg">
          <Button variant="primary" disabled={draftInfo.count < draftInfo.min} onClick={draftInfo.finish}>
            Finish ({draftInfo.count} point{draftInfo.count === 1 ? "" : "s"})
          </Button>
          <Button onClick={draftInfo.clear}>Clear</Button>
        </div>
      )}
    </div>
  );
}
