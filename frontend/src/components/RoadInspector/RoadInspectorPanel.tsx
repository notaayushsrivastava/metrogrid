/**
 * Floating Road Inspector Panel (PRD Phase 6).
 *
 * Appears when a freeform road object is selected. Provides real-time controls for
 * road subtype, width (meters), node manipulation, splitting, and deletion.
 */

import React from "react";
import type { InfrastructureLevel, RoadSubtype, SpatialRoad } from "../../types/spatial";
import {
  ROAD_SUBTYPE_NAMES,
  getDefaultRoadWidth,
  getRoadLevel,
  getRoadElevation,
  LEVEL_NAMES,
  LEVEL_ELEVATION_METERS,
} from "../../utils/freeformRoads";
import { Button } from "../ui/button";
import { Trash2, Scissors, X, Layers, ArrowUpRight } from "lucide-react";

interface RoadInspectorPanelProps {
  road: SpatialRoad;
  onUpdate: (updated: SpatialRoad) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onSplit?: (roadId: string, nodeIndex: number) => void;
}

const INFRA_LEVELS: InfrastructureLevel[] = [-2, -1, 0, 1, 2];

export function RoadInspectorPanel({
  road,
  onUpdate,
  onRemove,
  onClose,
  onSplit,
}: RoadInspectorPanelProps) {
  const currentLevel = getRoadLevel(road);
  const currentElevation = getRoadElevation(road);
  const isRamp = !!road.isRamp;
  const startLevel = (road.startLevel ?? currentLevel) as InfrastructureLevel;
  const endLevel = (road.endLevel ?? (currentLevel + 1 > 2 ? 2 : currentLevel + 1)) as InfrastructureLevel;

  const handleTypeChange = (newType: RoadSubtype) => {
    onUpdate({
      ...road,
      type: newType,
      width: getDefaultRoadWidth(newType),
    });
  };

  const handleLevelChange = (lvl: InfrastructureLevel) => {
    onUpdate({
      ...road,
      level: lvl,
      elevation: LEVEL_ELEVATION_METERS[lvl],
      startLevel: isRamp ? lvl : undefined,
      endLevel: isRamp ? ((lvl + 1 > 2 ? 2 : lvl + 1) as InfrastructureLevel) : undefined,
    });
  };

  const handleRampToggle = () => {
    const nextRamp = !isRamp;
    onUpdate({
      ...road,
      isRamp: nextRamp,
      startLevel: nextRamp ? currentLevel : undefined,
      endLevel: nextRamp ? ((currentLevel + 1 > 2 ? 2 : currentLevel + 1) as InfrastructureLevel) : undefined,
    });
  };

  const handleStartLevelChange = (lvl: InfrastructureLevel) => {
    onUpdate({
      ...road,
      startLevel: lvl,
      level: lvl,
      elevation: LEVEL_ELEVATION_METERS[lvl],
    });
  };

  const handleEndLevelChange = (lvl: InfrastructureLevel) => {
    onUpdate({
      ...road,
      endLevel: lvl,
    });
  };

  const handleElevationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elev = parseFloat(e.target.value);
    if (!isNaN(elev)) {
      onUpdate({
        ...road,
        elevation: Math.max(-30.0, Math.min(30.0, elev)),
      });
    }
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const w = parseFloat(e.target.value);
    if (!isNaN(w) && w > 0) {
      onUpdate({
        ...road,
        width: Math.max(1.0, Math.min(40.0, w)),
      });
    }
  };

  return (
    <div
      className="absolute bottom-6 right-6 z-40 w-84 rounded-xl bg-slate-900/95 p-4 text-white backdrop-blur-md border border-slate-700 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4"
      aria-label="Road Inspector"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wide text-slate-200">
            Road Infrastructure Inspector
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3.5 text-xs max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
        {/* Infrastructure Level Selector (PRD Phase 9) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>Infrastructure Level</span>
            </label>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                currentLevel > 0
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : currentLevel < 0
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "bg-slate-700 text-slate-200"
              }`}
            >
              {LEVEL_NAMES[currentLevel]}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {INFRA_LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => handleLevelChange(lvl)}
                className={`py-1 rounded border text-center font-mono font-bold transition-all ${
                  currentLevel === lvl
                    ? "bg-sky-500 text-slate-950 border-sky-400 shadow-sm"
                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title={LEVEL_NAMES[lvl]}
              >
                {lvl > 0 ? `+${lvl}` : `${lvl}`}
              </button>
            ))}
          </div>
        </div>

        {/* Vertical Ramp / Connector Toggle (PRD Phase 9) */}
        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-2.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="ramp-toggle"
              className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-200 select-none"
            >
              <ArrowUpRight className={`h-3.5 w-3.5 ${isRamp ? "text-amber-400" : "text-slate-400"}`} />
              <span>Sloped Ramp / Connector</span>
            </label>
            <input
              id="ramp-toggle"
              type="checkbox"
              checked={isRamp}
              onChange={handleRampToggle}
              className="accent-amber-500 h-4 w-4 cursor-pointer rounded"
            />
          </div>

          {isRamp && (
            <div className="mt-2.5 pt-2 border-t border-slate-700/60 grid grid-cols-2 gap-2 animate-in fade-in">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Start Level</label>
                <select
                  value={startLevel}
                  onChange={(e) => handleStartLevelChange(Number(e.target.value) as InfrastructureLevel)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-amber-400"
                >
                  {INFRA_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl > 0 ? `L+${lvl}` : `L${lvl}`} ({LEVEL_ELEVATION_METERS[lvl]}m)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">End Level</label>
                <select
                  value={endLevel}
                  onChange={(e) => handleEndLevelChange(Number(e.target.value) as InfrastructureLevel)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-amber-400"
                >
                  {INFRA_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl > 0 ? `L+${lvl}` : `L${lvl}`} ({LEVEL_ELEVATION_METERS[lvl]}m)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Physical Elevation Height Offset Slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-slate-400 font-medium">Deck Elevation</label>
            <span className="text-sky-400 font-mono font-bold">
              {currentElevation >= 0 ? `+${currentElevation.toFixed(1)}` : currentElevation.toFixed(1)} m
            </span>
          </div>
          <input
            type="range"
            min="-18"
            max="18"
            step="1"
            value={currentElevation}
            onChange={handleElevationChange}
            className="w-full accent-sky-400 bg-slate-800 rounded-lg cursor-pointer h-2"
          />
        </div>

        {/* Road Subtype Picker */}
        <div>
          <label className="block text-slate-400 font-medium mb-1.5">
            Road Subtype
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {([40, 41, 42, 43] as RoadSubtype[]).map((st) => (
              <button
                key={st}
                onClick={() => handleTypeChange(st)}
                className={`px-2.5 py-1.5 rounded-md border text-left font-medium transition-all ${
                  road.type === st
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {ROAD_SUBTYPE_NAMES[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Road Width Slider */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-slate-400 font-medium">Road Width</label>
            <span className="text-emerald-400 font-bold">{road.width.toFixed(1)} m</span>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="0.5"
            value={road.width}
            onChange={handleWidthChange}
            className="w-full accent-emerald-500 bg-slate-800 rounded-lg cursor-pointer h-2"
          />
        </div>

        {/* Polyline stats */}
        <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
          <span>Vertices / Nodes:</span>
          <span className="font-semibold text-slate-200">{road.points.length} nodes</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {road.points.length > 2 && onSplit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSplit(road.id, Math.floor(road.points.length / 2))}
              className="flex-1 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white text-xs h-8"
            >
              <Scissors className="h-3.5 w-3.5 mr-1" /> Split
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onRemove(road.id)}
            className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white text-xs h-8"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}


