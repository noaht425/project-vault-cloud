"use client";

import { useMemo, useState } from "react";
import {
  calculateTrip,
  foldDrawnPathAtWraps,
  mergeTripResults,
  wrapLegs,
  type LatitudeDistortionConfig,
  type Point,
} from "@/lib/mapGeometry";
import { pinDisplayLabel, type LineType, type MapLandmass, type MapLine, type MapPin, type MapScale, type MapZone, type TerrainType } from "@/lib/noteTypes/map";
import type { TravelMode } from "@/lib/noteTypes/travelModes";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";

// Adapted from the Electron app's MapTripCalculator.tsx — same geometry and
// route logic, `modes`/`modesLoading` passed as props (owned by MapForm's
// useTravelModes) instead of read from a Zustand store.
export function MapTripCalculator({
  pins,
  zones,
  lines,
  terrainTypes,
  lineTypes,
  landmasses,
  waterTerrainTypeId,
  scale,
  image,
  wrapsHorizontally,
  wrapsVertically,
  equatorY,
  planetCircumference,
  accountForLatitudeDistortion,
  modes,
  modesLoading,
  drawnPath,
  onClearDrawnPath,
  onStartDrawing,
  onShowPathChange,
}: {
  pins: MapPin[];
  zones: MapZone[];
  lines: MapLine[];
  terrainTypes: TerrainType[];
  lineTypes: LineType[];
  landmasses: MapLandmass[];
  waterTerrainTypeId: string | null;
  scale: MapScale | null;
  // Only width/height are ever read here (wrap-around geometry) — accepting
  // just that shape instead of a full MapImage lets this work equally for a
  // purely-generated map (canvasSize) with no uploaded raster at all.
  image: { width: number; height: number } | null;
  wrapsHorizontally: boolean;
  wrapsVertically: boolean;
  equatorY: number | null;
  planetCircumference: number | null;
  accountForLatitudeDistortion: boolean;
  modes: TravelMode[];
  modesLoading: boolean;
  drawnPath: Point[] | null;
  onClearDrawnPath: () => void;
  onStartDrawing: () => void;
  onShowPathChange: (legs: Point[][] | null) => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [landModeId, setLandModeId] = useState("");
  const [waterModeId, setWaterModeId] = useState("");

  const from = pins.find((p) => p.id === fromId) ?? pins[0];
  const to = pins.find((p) => p.id === toId) ?? pins[1];
  const sortedPins = useMemo(() => [...pins].sort((a, b) => pinDisplayLabel(a).localeCompare(pinDisplayLabel(b))), [pins]);
  const landTravelMode = modes.find((m) => m.id === landModeId) ?? modes[0];
  const waterTravelMode = (landmasses.length > 0 && modes.find((m) => m.id === waterModeId)) || landTravelMode;

  const effectiveLegs: Point[][] | null = useMemo(() => {
    if (drawnPath) {
      if (!image || (!wrapsHorizontally && !wrapsVertically)) return [drawnPath];
      return foldDrawnPathAtWraps(drawnPath, { mapWidth: image.width, mapHeight: image.height, wrapsHorizontally, wrapsVertically });
    }
    if (!from || !to || from.id === to.id) return null;
    if (!image || (!wrapsHorizontally && !wrapsVertically)) return [[from, to]];
    return wrapLegs(from, to, { mapWidth: image.width, mapHeight: image.height, wrapsHorizontally, wrapsVertically });
  }, [drawnPath, from, to, image, wrapsHorizontally, wrapsVertically]);

  const latitudeDistortion: LatitudeDistortionConfig | null = useMemo(
    () => (accountForLatitudeDistortion && equatorY !== null && planetCircumference ? { equatorY, planetCircumference } : null),
    [accountForLatitudeDistortion, equatorY, planetCircumference]
  );

  const trip = useMemo(() => {
    if (!effectiveLegs || !landTravelMode || !waterTravelMode || !scale) return null;
    const results = effectiveLegs.map((leg) =>
      calculateTrip(leg, zones, lines, terrainTypes, lineTypes, landmasses, waterTerrainTypeId, scale, landTravelMode, waterTravelMode, latitudeDistortion)
    );
    return mergeTripResults(results);
  }, [effectiveLegs, landTravelMode, waterTravelMode, scale, zones, lines, terrainTypes, lineTypes, landmasses, waterTerrainTypeId, latitudeDistortion]);

  const originalSegmentCount = drawnPath ? Math.max(drawnPath.length - 1, 0) : 1;
  const usedWrap = (effectiveLegs?.length ?? 0) > originalSegmentCount;

  const terrainNameById = new Map([...terrainTypes, ...lineTypes].map((t) => [t.id, t.name]));
  const waterLabel = (waterTerrainTypeId && terrainNameById.get(waterTerrainTypeId)) || "Water";
  const mixedUnits = trip !== null && landTravelMode.timeUnitLabel !== waterTravelMode.timeUnitLabel && trip.segments.some((s) => !s.isLand);

  if (!scale) return <p className="text-sm text-muted">Calibrate this map&apos;s scale first (Calibrate mode) to enable the trip calculator.</p>;
  if (pins.length < 2 && !drawnPath) {
    return <p className="text-sm text-muted">Place at least two pins, or use &quot;Draw custom route&quot; below, to calculate a trip.</p>;
  }
  if (!modesLoading && modes.length === 0) return <p className="text-sm text-muted">Add at least one travel mode below first.</p>;

  return (
    <div className="flex flex-col gap-2">
      {drawnPath ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Using your hand-drawn route ({drawnPath.length} points) — From/To below is ignored.</span>
          <Button onClick={onClearDrawnPath}>Clear drawn route</Button>
        </div>
      ) : (
        pins.length >= 2 && (
          <div className="flex flex-wrap gap-2">
            <SelectField label="From" className="w-36" value={from?.id ?? ""} onChange={(e) => setFromId(e.target.value)}>
              {sortedPins.map((p) => (
                <option key={p.id} value={p.id}>
                  {pinDisplayLabel(p)}
                </option>
              ))}
            </SelectField>
            <SelectField label="To" className="w-36" value={to?.id ?? ""} onChange={(e) => setToId(e.target.value)}>
              {sortedPins.map((p) => (
                <option key={p.id} value={p.id}>
                  {pinDisplayLabel(p)}
                </option>
              ))}
            </SelectField>
          </div>
        )
      )}

      <div className="flex flex-wrap gap-2">
        <SelectField label={landmasses.length > 0 ? "Land mode" : "Travel mode"} className="w-36" value={landTravelMode?.id ?? ""} onChange={(e) => setLandModeId(e.target.value)}>
          {modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
        {landmasses.length > 0 && (
          <SelectField label="Water mode" className="w-36" value={waterTravelMode?.id ?? ""} onChange={(e) => setWaterModeId(e.target.value)}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onStartDrawing}>Draw custom route</Button>
        <Button disabled={!effectiveLegs} onClick={() => onShowPathChange(effectiveLegs)}>
          Show on map
        </Button>
        <Button onClick={() => onShowPathChange(null)}>Hide from map</Button>
      </div>

      {!drawnPath && from && to && from.id === to.id && <p className="text-sm text-muted">Choose two different pins.</p>}

      {usedWrap && (
        <p className="text-sm text-muted">
          {drawnPath ? "This route crosses a wrapping edge" : "Shortest path wraps around the map edge"} — the route shown on the map jumps between opposite edges rather than crossing the middle.
        </p>
      )}

      {trip && (
        <div className="flex flex-col gap-1">
          <strong>
            {trip.totalRealDistance.toFixed(1)} {scale.unit} — {trip.totalTime === Infinity ? "no route (impassable terrain)" : `${trip.totalTime.toFixed(1)} ${landTravelMode.timeUnitLabel}`}
          </strong>
          {mixedUnits && (
            <span className="text-sm text-muted">
              Land mode uses &quot;{landTravelMode.timeUnitLabel}&quot; and water mode uses &quot;{waterTravelMode.timeUnitLabel}&quot; — the total above just sums the raw numbers, so treat it as
              approximate until both modes share a time unit.
            </span>
          )}
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <tbody>
                {trip.segments.map((seg, i) => {
                  const segMode = seg.isLand ? landTravelMode : waterTravelMode;
                  return (
                    <tr key={i}>
                      <td className="pr-3">{seg.terrainTypeId ? (terrainNameById.get(seg.terrainTypeId) ?? "Unknown") : seg.isLand ? "Unpainted" : waterLabel}</td>
                      <td className="pr-3">
                        {seg.realDistance.toFixed(1)} {scale.unit}
                      </td>
                      <td>{seg.time === Infinity ? "—" : `${seg.time.toFixed(1)} ${segMode.timeUnitLabel}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
