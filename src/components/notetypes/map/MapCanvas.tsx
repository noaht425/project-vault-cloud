"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { foldDrawnPathAtWraps, segmentDistance, type Point, type WrapConfig } from "@/lib/mapGeometry";
import { pinDisplayLabel, type LineType, type MapLandmass, type MapLine, type MapPin, type MapZone, type TerrainType } from "@/lib/noteTypes/map";
import { Button } from "@/components/ui/Button";

export type MapCanvasMode = "view" | "calibrate" | "paint-zone" | "draw-line" | "paint-landmass" | "draw-trip" | "place-pin";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  zones: MapZone[];
  lines: MapLine[];
  landmasses: MapLandmass[];
  pins: MapPin[];
  terrainTypes: TerrainType[];
  lineTypes: LineType[];
  mode: MapCanvasMode;
  onCalibrate: (pixelDistance: number) => void;
  onZoneDrawn: (points: Point[]) => void;
  onLineDrawn: (points: Point[]) => void;
  onLandmassDrawn: (points: Point[]) => void;
  onTripDrawn: (points: Point[]) => void;
  onPinPlaced: (point: Point) => void;
  onPinClick: (pin: MapPin) => void;
  highlightedPinIds?: Set<string>;
  tripPath?: Point[][] | null;
  equatorY?: number | null;
  wrapsHorizontally?: boolean;
  wrapsVertically?: boolean;
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
  mode,
  onCalibrate,
  onZoneDrawn,
  onLineDrawn,
  onLandmassDrawn,
  onTripDrawn,
  onPinPlaced,
  onPinClick,
  highlightedPinIds,
  tripPath,
  equatorY,
  wrapsHorizontally = false,
  wrapsVertically = false,
}: MapCanvasProps) {
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: imageWidth, h: imageHeight });
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null);
  const [zoneDraft, setZoneDraft] = useState<Point[]>([]);
  const [lineDraft, setLineDraft] = useState<Point[]>([]);
  const [landmassDraft, setLandmassDraft] = useState<Point[]>([]);
  const [tripDraft, setTripDraft] = useState<Point[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ startDist: number; startMidX: number; startMidY: number; origVb: ViewBox } | null>(null);
  const viewBoxRef = useRef(viewBox);
  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  const handleClickAtRef = useRef<(point: Point) => void>(() => {});
  const onPinClickRef = useRef(onPinClick);
  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  const terrainTypesById = useMemo(() => new Map(terrainTypes.map((t) => [t.id, t])), [terrainTypes]);
  const lineTypesById = useMemo(() => new Map(lineTypes.map((t) => [t.id, t])), [lineTypes]);
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

  const pinElements = useMemo(
    () =>
      pins.map((pin) => (
        <g
          key={pin.id}
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
    setTripDraft([]);
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
      } else if (mode === "draw-trip") {
        if (e.key === "Enter" && tripDraft.length >= 2) {
          onTripDrawn(tripDraft);
          setTripDraft([]);
        } else if (e.key === "Escape") {
          setTripDraft([]);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, zoneDraft, onZoneDrawn, lineDraft, onLineDrawn, landmassDraft, onLandmassDrawn, tripDraft, onTripDrawn]);

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
    } else if (mode === "draw-trip") {
      setTripDraft((pts) => [...pts, point]);
    } else if (mode === "place-pin") {
      onPinPlaced(point);
    }
  };
  useEffect(() => {
    handleClickAtRef.current = handleClickAt;
  });

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    setViewBox((vb) => {
      const before = getViewportTransform(rect, vb);
      const px = vb.x + (e.clientX - rect.left - before.offsetX) / before.scale;
      const py = vb.y + (e.clientY - rect.top - before.offsetY) / before.scale;

      const scaleFactor = e.deltaY < 0 ? 0.9 : 1.1;
      const newW = Math.min(imageWidth * 3, Math.max(50, vb.w * scaleFactor));
      const newH = vb.h * (newW / vb.w);

      const after = getViewportTransform(rect, { x: vb.x, y: vb.y, w: newW, h: newH });
      const newMx = e.clientX - rect.left - after.offsetX;
      const newMy = e.clientY - rect.top - after.offsetY;
      return { x: px - newMx / after.scale, y: py - newMy / after.scale, w: newW, h: newH };
    });
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
  }, [viewBox.w, viewBox.h, mode, calibrationStart, zoneDraft, lineDraft, landmassDraft, tripDraft]);

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
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleTouchStart = (e: TouchEvent): void => {
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
        const newW = Math.min(imageWidth * 3, Math.max(50, pinch.origVb.w * scaleFactor));
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
  }, [imageWidth, mode, calibrationStart, zoneDraft, lineDraft, landmassDraft, tripDraft]);

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
          : mode === "draw-trip"
            ? { count: tripDraft.length, min: 2, finish: () => { onTripDrawn(tripDraft); setTripDraft([]); }, clear: () => setTripDraft([]) }
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
        <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />

        <g>{landmassElements}</g>
        <g>{zoneElements}</g>
        <g>{lineElements}</g>

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

        {mode === "calibrate" && calibrationStart && <circle cx={calibrationStart.x} cy={calibrationStart.y} r={6} fill="#fff" stroke="#000" strokeWidth={2} />}

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

        <g>{pinElements}</g>
      </svg>

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
